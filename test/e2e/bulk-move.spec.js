import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const SEARCH = 'Search name, description, serial number, transferred to or text fields…';

// Items that share one unique token, so a single search shows exactly this test's records.
async function setup(request, prefix) {
  const token = unique(prefix);
  const category = await createCategory(request, unique('Moving'));
  const create = (name, attributes = {}) => createItem(request, { name: `${token} ${name}`, category_id: category.id, ...attributes });
  return { token, create };
}

// Waits for the filtered count, so page-wide selection never acts on the unfiltered list.
async function openItems(page, token, count) {
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByPlaceholder(SEARCH).fill(token);
  await expect(page.getByText(`${count} items`, { exact: true })).toBeVisible();
}

const parentOf = async (request, item) => (await (await request.get(`/api/items/${item.id}`)).json()).parent_item_id;

test('moves a selected container and its selected content while preserving their nesting', async ({ page, request }) => {
  const { token, create } = await setup(request, 'Preserve');
  const home = unique('Home');
  const boxA = await create('Box A', { location: unique('Garage') });
  const camera = await create('Camera', { parent_item_id: boxA.id });
  const boxB = await create('Box B', { location: home });

  await openItems(page, token, 3);
  await page.getByRole('checkbox', { name: `Select ${boxA.name}` }).check();
  await page.getByRole('checkbox', { name: `Select ${camera.name}` }).check();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move to…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Move selected items' });
  await expect(dialog.getByText('2 selected items')).toBeVisible();
  await expect(dialog.getByText('1 top-level selected group will be moved.')).toBeVisible();
  await expect(dialog.getByText('existing nested structure is preserved')).toBeVisible();
  // Nothing inside the moved subtree is offered as a destination.
  await dialog.getByRole('searchbox', { name: 'Destination' }).fill(token);
  await expect(dialog.getByRole('radio')).toHaveCount(1);
  await dialog.getByRole('radio', { name: boxB.name }).check();
  await expect(dialog.getByText(`Move the selected items into "${boxB.name}"?`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText(`2 selected items are now inside ${boxB.name}.`);
  await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
  // The list refreshes Stored inside and the inherited location without a reload.
  const boxRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: boxA.name, exact: true }) });
  await expect(boxRow.getByRole('link', { name: boxB.name, exact: true })).toBeVisible();
  const cameraRow = page.getByRole('row').filter({ has: page.getByRole('link', { name: camera.name, exact: true }) });
  await expect(cameraRow.getByRole('link', { name: boxA.name, exact: true })).toBeVisible();
  await expect(cameraRow).toContainText(home);

  expect(await parentOf(request, boxA)).toBe(boxB.id);
  expect(await parentOf(request, camera)).toBe(boxA.id);

  // Item Details and the container Contents show the same structure.
  await page.goto(`/items/${boxB.id}`);
  await expect(page.getByRole('link', { name: boxA.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeHidden();
  await page.goto(`/items/${camera.id}`);
  await expect(detail(page, 'Stored inside')).toHaveText(boxA.name);
  await expect(detail(page, 'Location')).toContainText(home);

  // The Hierarchy tree shows Box B > Box A > Camera under Box B's location after its normal load.
  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: `Expand ${home}`, exact: true }).click();
  await page.getByRole('button', { name: `Expand ${boxB.name}` }).click();
  await page.getByRole('button', { name: `Expand ${boxA.name}` }).click();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeVisible();
});

test('a move the server refuses changes nothing and keeps the selection', async ({ page, request }) => {
  const { token, create } = await setup(request, 'Refused');
  const loose = await create('Loose');
  const boxA = await create('Box A');
  const boxC = await create('Box C');

  await openItems(page, token, 3);
  await page.getByRole('checkbox', { name: `Select ${loose.name}` }).check();
  await page.getByRole('checkbox', { name: `Select ${boxA.name}` }).check();
  await page.getByRole('button', { name: 'Move to…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move selected items' });
  await dialog.getByRole('searchbox', { name: 'Destination' }).fill(boxC.name);
  await expect(dialog.getByRole('radio')).toHaveCount(1);
  await dialog.getByRole('radio', { name: boxC.name }).check();

  // Meanwhile Box C is stored inside Box A, so the chosen destination is now inside a selected root.
  const response = await request.put(`/api/items/${boxC.id}`, { data: { name: boxC.name, category_id: boxC.category_id, parent_item_id: boxA.id } });
  expect(response.ok()).toBeTruthy();
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();

  await expect(dialog.getByRole('alert')).toHaveText('An item cannot be stored inside one of its own contents.');
  expect(await parentOf(request, loose)).toBeNull();
  expect(await parentOf(request, boxA)).toBeNull();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Move to…' })).toBeFocused();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('selects cards and moves them into a container', async ({ page, request }) => {
    const { token, create } = await setup(request, 'Phone');
    const shelf = await create('Shelf');
    const cable = await create('Cable');
    const charger = await create('Charger');

    await openItems(page, token, 3);
    const cards = page.getByRole('listitem').filter({ hasText: token });
    await page.getByRole('button', { name: 'Select all items on this page' }).click();
    await page.getByRole('checkbox', { name: `Select ${shelf.name}` }).uncheck();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Move to…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Move selected items' });
    await dialog.getByRole('searchbox', { name: 'Destination' }).fill(shelf.name);
    await expect(dialog.getByRole('radio')).toHaveCount(1);
    await dialog.getByRole('radio', { name: shelf.name }).check();
    await dialog.getByRole('button', { name: 'Move', exact: true }).click();

    await expect(page.getByRole('status')).toContainText(`2 selected items are now inside ${shelf.name}.`);
    for (const item of [cable, charger]) {
      await expect(cards.filter({ hasText: item.name })).toContainText(`Stored inside: ${shelf.name}`);
    }
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});
