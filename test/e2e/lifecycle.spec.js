import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const SEARCH = 'Search name, description, serial number, transferred to or text fields…';
const LOCALE_KEY = 'inventory-atlas.locale';
const phone = { width: 390, height: 844 };

// Items that share one unique token, so a single search shows exactly this test's records.
async function setup(request, prefix) {
  const token = unique(prefix);
  const category = await createCategory(request, unique('Lifecycle'));
  const create = (name, attributes = {}) => createItem(request, { name: `${token} ${name}`, category_id: category.id, ...attributes });
  return { token, category, create };
}

const retire = async (request, item, data = {}) => {
  const response = await request.patch(`/api/items/${item.id}/lifecycle`, { data: { status: 'retired', reason: 'sold', ...data } });
  expect(response.ok(), `retiring ${item.name} returned ${response.status()}`).toBeTruthy();
};
const lifecycleOf = async (request, item) => (await (await request.get(`/api/items/${item.id}`)).json()).lifecycle_status;

async function openItems(page, token) {
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByPlaceholder(SEARCH).fill(token);
}
const lifecycleFilter = (page, option) => page.getByRole('group', { name: 'Inventory' }).getByText(option, { exact: true });

test('retires an item with a reason, filters it out of the active list, and restores it', async ({ page, request }) => {
  const { token, create } = await setup(request, 'Retire');
  const shelf = await create('Shelf', { location: unique('Garage') });
  const lens = await create('Lens', { parent_item_id: shelf.id, is_new: true, serial_number: 'LN-1' });
  const flash = await create('Flash');

  await page.goto(`/items/${lens.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Retire item' }).click();
  const dialog = page.getByRole('dialog', { name: `Retire ${lens.name}` });
  await expect(dialog.getByText('Nothing is deleted')).toBeVisible();
  // The reason is required: the dialog does not submit without it.
  await dialog.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Reason').selectOption({ label: 'Sold' });
  await dialog.getByLabel('Recipient or context').fill('Olena from the camera club');
  await dialog.getByLabel('Note').fill('Paid in cash');
  await dialog.getByRole('button', { name: 'Retire', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText(`${lens.name} is retired.`);
  await expect(page.getByText('Retired', { exact: true }).first()).toBeVisible();
  const retirement = page.getByRole('region', { name: 'Retirement' });
  await expect(detail(retirement, 'Reason')).toHaveText('Sold');
  await expect(detail(retirement, 'Recipient or context')).toHaveText('Olena from the camera club');
  await expect(detail(retirement, 'Note')).toHaveText('Paid in cash');
  await expect(detail(retirement, 'Former container')).toHaveText(shelf.name);
  // Nothing else about the item changed: New, the serial number, and its identity stay.
  await expect(detail(page, 'New')).toHaveText('New');
  await expect(detail(page, 'Serial Number')).toHaveText('LN-1');
  await expect(page.getByRole('button', { name: 'Restore to inventory' })).toBeVisible();

  // The Active view is the default; All mixes both, Retired shows only retired items, with the badge.
  await openItems(page, token);
  await expect(page.getByText('2 items', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: lens.name, exact: true })).toHaveCount(0);
  await lifecycleFilter(page, 'All').click();
  await expect(page.getByText('3 items', { exact: true })).toBeVisible();
  await lifecycleFilter(page, 'Retired').click();
  await expect(page.getByText('1 item', { exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: lens.name, exact: true }) });
  await expect(row.getByText('Retired', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: flash.name, exact: true })).toHaveCount(0);
  // The chosen view survives normal navigation within the session.
  await row.getByRole('link', { name: lens.name, exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('radio', { name: 'Retired' })).toBeChecked();

  // Restore never puts the item back into its former container on its own; here it goes into one deliberately.
  await page.goto(`/items/${lens.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Restore to inventory' }).click();
  const restore = page.getByRole('dialog', { name: `Restore ${lens.name}` });
  await expect(restore.getByRole('radio', { name: 'On its own, at a location' })).toBeChecked();
  await restore.getByText('Inside an active container', { exact: true }).click();
  await restore.getByRole('searchbox', { name: 'Stored inside' }).fill(flash.name);
  await restore.getByRole('radio', { name: flash.name }).check();
  await restore.getByRole('button', { name: 'Restore to inventory' }).click();
  await expect(restore).toBeHidden();
  await expect(page.getByRole('status')).toContainText(`${lens.name} is back in the inventory.`);
  await expect(page.getByRole('region', { name: 'Retirement' })).toHaveCount(0);
  await expect(detail(page, 'Stored inside')).toHaveText(flash.name);
  expect(await lifecycleOf(request, lens)).toBe('active');
});

test('a container asks before retiring its contents and can retire the whole subtree', async ({ page, request }) => {
  const { create } = await setup(request, 'Subtree');
  const bag = await create('Bag', { location: unique('Hall') });
  const pouch = await create('Pouch', { parent_item_id: bag.id });
  const cable = await create('Cable', { parent_item_id: pouch.id });

  await page.goto(`/items/${bag.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Retire item' }).click();
  const dialog = page.getByRole('dialog', { name: `Retire ${bag.name}` });
  await expect(dialog.getByText('This container holds 2 active items.')).toBeVisible();
  await dialog.getByText('Move the contents out first', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Move contents first' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Nothing was retired.');
  expect(await lifecycleOf(request, bag)).toBe('active');

  await page.getByRole('button', { name: 'Retire item' }).click();
  await dialog.getByText('Retire the container and all 2 items inside it', { exact: true }).click();
  await dialog.getByLabel('Reason').selectOption({ label: 'Stolen' });
  await dialog.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`${bag.name} and the 3 items inside it are retired.`);
  for (const item of [bag, pouch, cable]) expect(await lifecycleOf(request, item)).toBe('retired');
  // The nesting inside the retired subtree is kept, and a retired container offers no audit.
  await expect(page.getByRole('link', { name: pouch.name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Audit contents' })).toHaveCount(0);
  await page.getByRole('link', { name: pouch.name }).click();
  await expect(detail(page, 'Stored inside')).toHaveText(bag.name);
  await expect(detail(page.getByRole('region', { name: 'Retirement' }), 'Reason')).toHaveText('Stolen');
});

test('the hierarchy shows active items by default and retired ones on request in both groupings', async ({ page, request }) => {
  const { token, category, create } = await setup(request, 'Hierarchy');
  const location = unique('Attic');
  const crate = await create('Crate', { location });
  const radio = await create('Radio', { parent_item_id: crate.id });
  const kept = await create('Kept lamp', { location });
  await retire(request, crate, { include_contents: true });

  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('radio', { name: 'Active' })).toBeChecked();
  await page.getByLabel('Search hierarchy').fill(token);
  await expect(page.getByRole('link', { name: kept.name })).toBeVisible();
  await expect(page.getByRole('link', { name: crate.name })).toHaveCount(0);

  await lifecycleFilter(page, 'Retired').click();
  await expect(page).toHaveURL(/lifecycle=retired/);
  await page.getByLabel('Search hierarchy').fill(token);
  await expect(page.getByRole('link', { name: radio.name })).toBeVisible();
  await expect(page.getByRole('link', { name: crate.name })).toBeVisible();
  await expect(page.getByRole('link', { name: kept.name })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ has: page.getByRole('link', { name: radio.name }) })).toContainText('Retired');

  await page.getByText('Category', { exact: true }).click();
  await page.getByLabel('Search hierarchy').fill(token);
  await expect(page.getByRole('link', { name: radio.name })).toBeVisible();
  await expect(page.getByText(category.name, { exact: true })).toBeVisible();

  await lifecycleFilter(page, 'All').click();
  await page.getByLabel('Search hierarchy').fill(token);
  await expect(page.getByRole('link', { name: kept.name })).toBeVisible();
  await expect(page.getByRole('link', { name: radio.name })).toBeVisible();
});

test('checklists mark retired entries and leave them out of new runs', async ({ page, request }) => {
  const { create } = await setup(request, 'Checklist');
  const camera = await create('Camera');
  const tripod = await create('Tripod');
  const response = await request.post('/api/checklists', {
    data: { name: unique('Shoot kit'), mode: 'packing', items: [{ item_id: camera.id }, { item_id: tripod.id }] }
  });
  const checklist = await response.json();
  await retire(request, tripod, { reason: 'lost' });

  await page.goto(`/checklists/${checklist.id}`);
  await page.mouse.move(600, 400);
  await expect(page.getByRole('status')).toContainText('1 item on this checklist is retired. New runs leave it out.');
  const entry = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: tripod.name }) });
  await expect(entry.getByText('Retired', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page).toHaveURL(/\/checklists\/runs\/\d+/);
  await expect(page.getByText('1 retired item from the checklist was left out of this run.')).toBeVisible();
  await expect(page.getByText(camera.name)).toBeVisible();
  await expect(page.getByText(tripod.name)).toHaveCount(0);
});

test('the dashboard counts retired items separately and links to them', async ({ page, request }) => {
  const { create } = await setup(request, 'Dashboard');
  await retire(request, await create('Old phone'));
  await page.goto('/dashboard');
  await page.mouse.move(600, 400);
  const link = page.getByRole('link', { name: /retired items? (is|are) not counted/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL('/items?lifecycle=retired');
  await expect(page.getByRole('radio', { name: 'Retired' })).toBeChecked();
});

test('a retired item opens from a direct UUID link, and new sessions start with the Active view', async ({ page, request }) => {
  const { token, create } = await setup(request, 'Direct');
  const watch = await create('Watch');
  await retire(request, watch, { reason: 'gifted' });
  await page.goto(`/items/${watch.uuid}`);
  await expect(page.getByRole('heading', { name: watch.name })).toBeVisible();
  await expect(detail(page, 'Status')).toHaveText('Retired');
  await openItems(page, token);
  await expect(page.getByRole('radio', { name: 'Active' })).toBeChecked();
  await expect(page.getByText('No retired items')).toHaveCount(0);
  await expect(page.getByText('No matching items')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: phone });

  test('the lifecycle filter and the Retired badge work on the item cards', async ({ page, request }) => {
    const { token, create } = await setup(request, 'Phone');
    const kettle = await create('Kettle');
    await retire(request, kettle, { reason: 'disposed' });
    await openItems(page, token);
    await expect(page.getByText('0 items', { exact: true })).toBeVisible();
    await lifecycleFilter(page, 'Retired').click();
    const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: kettle.name, exact: true }) });
    await expect(card.getByText('Retired', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone.width);
  });
});

test('the lifecycle is translated into Ukrainian', async ({ page, request }) => {
  const { create } = await setup(request, 'Ukrainian');
  const lamp = await create('Lamp');
  await page.addInitScript(key => localStorage.setItem(key, 'uk'), LOCALE_KEY);
  await page.goto(`/items/${lamp.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Списати предмет' }).click();
  const dialog = page.getByRole('dialog', { name: `Списати «${lamp.name}»` });
  await dialog.getByLabel('Причина').selectOption({ label: 'Подаровано' });
  await dialog.getByRole('button', { name: 'Списати', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`«${lamp.name}» списано.`);
  await expect(detail(page, 'Статус')).toHaveText('Списаний');
  await expect(page.getByRole('button', { name: 'Повернути в інвентар' })).toBeVisible();
});
