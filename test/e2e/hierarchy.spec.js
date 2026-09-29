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

// The virtual Uncontained items group of one location, by the name its toggle is announced with.
const groupName = location => `Uncontained items — ${location}`;
const rowOf = (page, name) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) });

test('groups the tree by location and opens a nested item', async ({ page, request }) => {
  const category = await createCategory(request, unique('Shelving'));
  const location = unique('Tree Home');
  const box = await createItem(request, { name: unique('Box'), category_id: category.id, location });
  const [bag, camera] = await createChain(request, category.id, ['Camera Bag', 'Camera'], box);
  // Another spelling of the same location joins the same Location node; a tie is named by code-point order.
  const loose = await createItem(request, { name: unique('Coffee mug'), category_id: category.id, location: location.toUpperCase() });
  const shown = [location, location.toUpperCase()].sort()[0];
  const writes = recordWrites(page);

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Hierarchy' }).click();
  await expect(page).toHaveURL('/hierarchy');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

  // The location is a virtual row that counts every item of its branches; its contents appear once it is expanded.
  const locationRow = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Expand ${shown}`, exact: true }) });
  await expect(locationRow).toContainText('4 items');
  await expect(locationRow.getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Expand Uncontained items', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Expand ${shown}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Collapse ${shown}`, exact: true })).toHaveAttribute('aria-expanded', 'true');

  // A top-level container is a branch of its location.
  await expect(page.getByRole('link', { name: bag.name, exact: true })).toBeHidden();
  await page.getByRole('button', { name: `Expand ${box.name}` }).click();
  await expect(page.getByRole('button', { name: `Collapse ${box.name}` })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: `Expand ${bag.name}` }).click();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeVisible();
  await expect(rowOf(page, camera.name)).toContainText(location);

  // A top-level leaf waits in its own location's Uncontained items group.
  await expect(page.getByRole('link', { name: loose.name, exact: true })).toBeHidden();
  await page.getByRole('button', { name: `Expand ${groupName(shown)}`, exact: true }).click();
  await expect(rowOf(page, loose.name)).toContainText(loose.location);

  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeHidden();
  // Expand all opens the locations and their groups as well as the containers.
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('button', { name: `Collapse ${shown}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: loose.name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: camera.name, exact: true }).click();
  await expect(page).toHaveURL(`/items/${camera.id}`);
  await expect(page.getByRole('heading', { name: camera.name })).toBeVisible();
  expect(writes).toEqual([]);
});

test('search reveals every match with its location and full container path', async ({ page, request }) => {
  const category = await createCategory(request, unique('Archive'));
  const location = unique('KP Garage');
  const box = await createItem(request, { name: unique('Crate'), category_id: category.id, location });
  // A nested saved location never moves the item out of its container's location.
  const bag = await createItem(request, { name: unique('Lens Bag'), category_id: category.id, parent_item_id: box.id, location: unique('Office') });
  const [lens] = await createChain(request, category.id, ['Nikkor lens'], bag);
  const sibling = await createItem(request, { name: unique('Tapes'), category_id: category.id, parent_item_id: box.id });
  const nowhere = await createItem(request, { name: unique('Unknown adapter'), category_id: category.id });

  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await page.getByLabel('Search hierarchy').fill(lens.name.toUpperCase());

  // The match is shown inside its expanded location and ancestors, with the location inherited from the crate.
  await expect(page.getByRole('button', { name: `Collapse ${location}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: bag.name, exact: true })).toBeVisible();
  await expect(rowOf(page, lens.name)).toContainText(location);
  await expect(page.getByRole('link', { name: sibling.name, exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /^(Expand|Collapse) No location$/ })).toHaveCount(0);

  // A matching location name reveals that location's branches, collapsed and highlighted.
  await page.getByLabel('Search hierarchy').fill(location.toLowerCase());
  await expect(page.locator('.hierarchy-row-location .hierarchy-match')).toHaveText(location);
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: bag.name, exact: true })).toBeHidden();

  // An item without a location is found under No location and its Uncontained items group.
  await page.getByLabel('Search hierarchy').fill(nowhere.name);
  await expect(page.getByRole('button', { name: 'Collapse No location', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Collapse ${groupName('No location')}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: nowhere.name, exact: true })).toBeVisible();

  await page.getByLabel('Search hierarchy').fill(unique('No such item'));
  await expect(page.getByText('No matching items')).toBeVisible();

  // Clearing the search returns to the collapsed browsing state.
  await page.getByLabel('Search hierarchy').fill('');
  await expect(page.getByRole('button', { name: `Expand ${location}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: lens.name, exact: true })).toBeHidden();
});

test('the graph view groups by location, expands branches, highlights a search, and opens a nested item', async ({ page, request }) => {
  const category = await createCategory(request, unique('Graph shelf'));
  const location = unique('Graph Home');
  const box = await createItem(request, { name: unique('Graph Box'), category_id: category.id, location });
  const [bag, camera] = await createChain(request, category.id, ['Graph Bag', 'Graph Camera'], box);
  const lens = await createItem(request, { name: unique('Graph Lens'), category_id: category.id, parent_item_id: bag.id });
  const loose = await createItem(request, { name: unique('Graph Mug'), category_id: category.id, location });
  const writes = recordWrites(page);

  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('radio', { name: 'Tree' })).toBeChecked();
  await page.getByText('Graph', { exact: true }).click();
  await expect(page).toHaveURL('/hierarchy?view=graph');
  const graph = page.getByRole('region', { name: 'Storage graph' });
  await expect(graph).toBeVisible();

  // The virtual root and the collapsed location are nodes; the location counts all five items.
  await expect(graph.getByText('Inventory', { exact: true })).toBeVisible();
  await expect(graph.locator('.hierarchy-node-location').filter({ hasText: location })).toContainText('5 items');
  await expect(graph.getByRole('link', { name: box.name, exact: true })).toHaveCount(0);
  await graph.getByRole('button', { name: `Expand ${location}`, exact: true }).click();
  await expect(graph.getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await expect(graph.getByRole('button', { name: `Expand ${groupName(location)}`, exact: true })).toBeVisible();
  await expect(graph.getByRole('link', { name: loose.name, exact: true })).toHaveCount(0);
  await expect(graph.getByRole('link', { name: bag.name, exact: true })).toHaveCount(0);

  // Expanding draws the contents; collapsing removes them from the graph, and expanding restores them.
  await graph.getByRole('button', { name: `Expand ${box.name}` }).click();
  await graph.getByRole('button', { name: `Expand ${bag.name}` }).click();
  await expect(graph.getByRole('link', { name: camera.name, exact: true })).toBeVisible();
  await expect(graph.getByRole('link', { name: lens.name, exact: true })).toBeVisible();
  await graph.getByRole('button', { name: `Collapse ${box.name}` }).click();
  await expect(graph.getByRole('link', { name: bag.name, exact: true })).toHaveCount(0);
  await expect(graph.getByRole('link', { name: camera.name, exact: true })).toHaveCount(0);
  await graph.getByRole('button', { name: `Expand ${box.name}` }).click();
  await expect(graph.getByRole('link', { name: camera.name, exact: true })).toBeVisible();
  await graph.getByRole('button', { name: `Expand ${groupName(location)}`, exact: true }).click();
  await expect(graph.getByRole('link', { name: loose.name, exact: true })).toBeVisible();

  // The opened location and branches are the same in the Tree.
  await page.getByText('Tree', { exact: true }).click();
  await expect(page.getByRole('button', { name: `Collapse ${location}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: camera.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: loose.name, exact: true })).toBeVisible();
  await page.getByText('Graph', { exact: true }).click();

  // A search reveals the nested match inside its location and path and highlights only it.
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(graph.getByRole('link', { name: box.name, exact: true })).toHaveCount(0);
  await page.getByLabel('Search hierarchy').fill(lens.name);
  await expect(graph.getByRole('button', { name: `Collapse ${location}`, exact: true })).toBeVisible();
  await expect(graph.getByRole('link', { name: bag.name, exact: true })).toBeVisible();
  await expect(graph.getByRole('link', { name: camera.name, exact: true })).toHaveCount(0);
  await expect(graph.locator('.hierarchy-node-match')).toHaveCount(1);
  await expect(graph.locator('.hierarchy-node-match')).toContainText(lens.name);

  // The view controls work, and switching to the tree keeps the same opened path.
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await page.getByText('Tree', { exact: true }).click();
  await expect(page).toHaveURL('/hierarchy');
  await expect(rowOf(page, lens.name)).toBeVisible();
  await page.getByText('Graph', { exact: true }).click();

  await graph.getByRole('link', { name: lens.name, exact: true }).click();
  await expect(page).toHaveURL(`/items/${lens.id}`);
  await expect(page.getByRole('heading', { name: lens.name })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('radio', { name: 'Graph' })).toBeChecked();
  expect(writes).toEqual([]);
});

test('a graph node is selected by a click and opens the item on a double-click', async ({ page, request }) => {
  const category = await createCategory(request, unique('Graph dbl'));
  const location = unique('Double shelf');
  const box = await createItem(request, { name: unique('Double Box'), category_id: category.id, location });
  await createChain(request, category.id, ['Double Inner'], box);

  await page.goto('/hierarchy?view=graph');
  await page.mouse.move(600, 400);
  // A location node is not an item, so double-clicking it opens nothing.
  const locationNode = page.locator('.vue-flow__node').filter({ has: page.locator('.hierarchy-node-location', { hasText: location }) });
  await locationNode.locator('.meta-text').dblclick();
  await expect(page).toHaveURL('/hierarchy?view=graph');
  await page.getByRole('button', { name: `Expand ${location}`, exact: true }).click();
  const node = page.locator('.vue-flow__node').filter({ has: page.getByRole('link', { name: box.name, exact: true }) });
  await node.locator('.meta-text').click();
  await expect(node).toHaveClass(/selected/);
  await node.locator('.meta-text').dblclick();
  await expect(page).toHaveURL(`/items/${box.id}`);
});

test('groups by category in the tree and the graph and keeps the location grouping intact', async ({ page, request }) => {
  const containers = await createCategory(request, unique('Crates'));
  const photography = await createCategory(request, unique('Photography'));
  const location = unique('Category Garage');
  // Box [Crates] > Camera [Photography] > Lens [Photography]: the box stays out of Photography.
  const box = await createItem(request, { name: unique('Category Box'), category_id: containers.id, location });
  const [camera, lens] = await createChain(request, photography.id, ['Category Camera', 'Category Lens'], box);
  const writes = recordWrites(page);

  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('radio', { name: 'Location' })).toBeChecked();
  await page.getByText('Category', { exact: true }).click();
  await expect(page).toHaveURL('/hierarchy?group=category');
  await expect(page.getByRole('radio', { name: 'Tree' })).toBeChecked();

  // A category is a virtual row counting its items; the cross-category box is not one of them.
  const categoryRow = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Expand ${photography.name}`, exact: true }) });
  await expect(categoryRow).toContainText('2 items');
  await expect(categoryRow.getByRole('link')).toHaveCount(0);
  await page.getByRole('button', { name: `Expand ${photography.name}`, exact: true }).click();
  await expect(rowOf(page, camera.name)).toContainText(`${location} · Stored inside: ${box.name}`);
  await expect(page.getByRole('link', { name: box.name, exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: lens.name, exact: true })).toBeHidden();
  await page.getByRole('button', { name: `Expand ${camera.name}` }).click();
  await expect(page.getByRole('link', { name: lens.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand Uncontained items', exact: true })).toHaveCount(0);

  // The box is only under its own category.
  await page.getByRole('button', { name: `Expand ${containers.name}`, exact: true }).click();
  await expect(page.getByRole('link', { name: box.name, exact: true })).toHaveCount(1);
  await expect(rowOf(page, box.name)).not.toContainText('item');

  // Back from an item returns to the category grouping.
  await page.getByRole('link', { name: lens.name, exact: true }).click();
  await expect(page).toHaveURL(`/items/${lens.id}`);
  await page.goBack();
  await expect(page).toHaveURL('/hierarchy?group=category');
  await expect(page.getByRole('radio', { name: 'Category' })).toBeChecked();

  // The graph draws the same category projection.
  await page.mouse.move(600, 400);
  await page.getByText('Graph', { exact: true }).click();
  await expect(page).toHaveURL('/hierarchy?group=category&view=graph');
  const graph = page.getByRole('region', { name: 'Category graph' });
  await expect(graph.locator('.hierarchy-node-category').filter({ hasText: photography.name })).toContainText('2 items');
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(graph.getByRole('link', { name: camera.name, exact: true })).toHaveCount(0);
  await page.getByLabel('Search hierarchy').fill(lens.name);
  await expect(graph.getByRole('link', { name: camera.name, exact: true })).toBeVisible();
  await expect(graph.getByRole('link', { name: box.name, exact: true })).toHaveCount(0);
  await expect(graph.locator('.hierarchy-node-match')).toHaveCount(1);
  await expect(graph.locator('.hierarchy-node-match')).toContainText(lens.name);

  // Location still shows the physical path, with the box as the lens's ancestor.
  await page.getByText('Location', { exact: true }).click();
  await expect(page).toHaveURL('/hierarchy?view=graph');
  await expect(page.getByRole('region', { name: 'Storage graph' }).getByRole('link', { name: box.name, exact: true })).toBeVisible();
  await page.getByText('Tree', { exact: true }).click();
  await expect(page).toHaveURL('/hierarchy');
  for (const item of [box, camera, lens]) await expect(page.getByRole('link', { name: item.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Collapse ${location}`, exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('an unknown grouping or view in the address falls back to Location and Tree', async ({ page, request }) => {
  const category = await createCategory(request, unique('Fallback'));
  await createItem(request, { name: unique('Fallback item'), category_id: category.id });
  await page.goto('/hierarchy?group=tags&view=3d');
  await expect(page.getByRole('radio', { name: 'Location' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Tree' })).toBeChecked();
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

  test('the graph stays usable on a phone without sideways page scrolling', async ({ page, request }) => {
    const category = await createCategory(request, unique('Phone graph'));
    const chain = await createChain(request, category.id, ['Phone Box', 'Phone Bag', 'Phone Camera']);

    await page.goto('/hierarchy?view=graph');
    await page.getByLabel('Search hierarchy').fill(chain.at(-1).name);
    const graph = page.getByRole('region', { name: 'Storage graph' });
    await expect(graph.getByRole('link', { name: chain.at(-1).name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fit to view' })).toBeVisible();
    const width = await page.locator('body').evaluate(body => body.ownerDocument.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(phone.width);
  });
});
