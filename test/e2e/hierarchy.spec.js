import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const phone = { width: 390, height: 844 };

// A chain of items, each stored inside the previous one; the first goes inside `parent` or the top level.
async function createChain(request, categoryId, prefixes, parent = null) {
  const chain = [];
  for (const prefix of prefixes) {
    chain.push(await createItem(request, { name: unique(prefix), category_id: categoryId, parent_item_id: (chain.at(-1) ?? parent)?.id ?? null }));
  }
  return chain;
}

// Tree interactions only ever read; any other API method would be a write from a read-only view.
const recordWrites = page => {
  const writes = [];
  page.on('request', request => {
    if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
  });
  return writes;
};

test('expands a container in the tree and opens a nested item', async ({ page, request }) => {
  const category = await createCategory(request, unique('Shelving'));
  const [box, bag, camera] = await createChain(request, category.id, ['Box', 'Camera Bag', 'Camera']);
  const loose = await createItem(request, { name: unique('Coffee mug'), category_id: category.id, location: unique('Kitchen') });
  const writes = recordWrites(page);

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Hierarchy' }).click();
  await expect(page).toHaveURL('/hierarchy');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

  // A top-level container is a root branch; its contents appear only once it is expanded.
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: bag.name, exact: true })).toBeHidden();
  await page.getByRole('button', { name: `Expand ${box.name}` }).click();
  await expect(page.getByRole('button', { name: `Collapse ${box.name}` })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: `Expand ${bag.name}` }).click();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeVisible();

  // A top-level leaf waits in the virtual Uncontained items group with its own location.
  await expect(page.getByRole('link', { name: loose.name, exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand Uncontained items' }).click();
  const looseRow = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: loose.name, exact: true }) });
  await expect(looseRow).toContainText(loose.location);

  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await page.getByRole('link', { name: camera.name, exact: true }).click();
  await expect(page).toHaveURL(`/items/${camera.id}`);
  await expect(page.getByRole('heading', { name: camera.name })).toBeVisible();
  expect(writes).toEqual([]);
});

test('search reveals every match with its full container path', async ({ page, request }) => {
  const category = await createCategory(request, unique('Archive'));
  const location = unique('KP Garage');
  const box = await createItem(request, { name: unique('Crate'), category_id: category.id, location });
  const [bag, lens] = await createChain(request, category.id, ['Lens Bag', 'Nikkor lens'], box);
  const sibling = await createItem(request, { name: unique('Tapes'), category_id: category.id, parent_item_id: box.id });

  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await page.getByLabel('Search hierarchy').fill(lens.name.toUpperCase());

  // The match is shown inside its expanded ancestors, with the location inherited from the crate.
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: bag.name, exact: true })).toBeVisible();
  const lensRow = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: lens.name, exact: true }) });
  await expect(lensRow).toContainText(location);
  await expect(page.getByRole('link', { name: sibling.name, exact: true })).toBeHidden();

  await page.getByLabel('Search hierarchy').fill(unique('No such item'));
  await expect(page.getByText('No matching items')).toBeVisible();

  // Clearing the search returns to the collapsed browsing state.
  await page.getByLabel('Search hierarchy').fill('');
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: lens.name, exact: true })).toBeHidden();
});

test.describe('narrow screens', () => {
  test.use({ viewport: phone });

  test('a deeply nested path stays readable without sideways scrolling', async ({ page, request }) => {
    const category = await createCategory(request, unique('Deep'));
    const chain = await createChain(request, category.id, Array.from({ length: 10 }, (_, index) => `Level ${index} with a long container name`));
    const deepest = chain.at(-1);

    await page.goto('/hierarchy');
    await page.getByLabel('Search hierarchy').fill(deepest.name);
    for (const item of chain) await expect(page.getByRole('link', { name: item.name, exact: true })).toBeVisible();
    const width = await page.locator('body').evaluate(body => body.ownerDocument.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(phone.width);

    await page.getByRole('link', { name: deepest.name, exact: true }).click();
    await expect(page.getByRole('heading', { name: deepest.name })).toBeVisible();
  });
});
