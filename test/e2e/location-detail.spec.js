import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const LOCALE_KEY = 'inventory-atlas.locale';
const searchBox = page => page.getByPlaceholder('Search name, description, serial number, transferred to, specific location or text fields…');
const historyCard = page => page.getByRole('region', { name: 'History' });

// A box with a broad and a specific location, and a camera inside it with an outdated own placement.
async function setup(request, prefix) {
  const category = await createCategory(request, unique(prefix));
  const home = unique('Apartment');
  const spot = unique('Bedroom wardrobe');
  const box = await createItem(request, { name: unique('Camera Bag'), category_id: category.id, location: home, location_detail: spot });
  const camera = await createItem(request, {
    name: unique('Camera'), category_id: category.id, parent_item_id: box.id, location: 'Old garage', location_detail: 'Old shelf'
  });
  return { category, home, spot, box, camera };
}

test('a new item saves its Specific location next to Location', async ({ page, request }) => {
  const categoryName = unique('Placed');
  await createCategory(request, categoryName);
  const name = unique('Lamp');
  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Name *').fill(name);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Location', { exact: true }).fill('Apartment');
  const field = page.getByLabel('Specific location', { exact: true });
  await expect(field).toHaveAttribute('placeholder', 'Bedroom, wardrobe, top shelf');
  await expect(field).toHaveAccessibleDescription('Optional: the exact spot within the location.');
  await field.fill('Living room, lower cabinet');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(detail(page, 'Location')).toHaveText('Apartment');
  await expect(detail(page, 'Specific location')).toHaveText('Living room, lower cabinet');
});

test('a contained item shows the inherited placement, and the list finds and shows it', async ({ page, request }) => {
  const { home, spot, box, camera } = await setup(request, 'Inherited');

  await page.goto(`/items/${camera.id}`);
  await expect(detail(page, 'Location')).toContainText(home);
  await expect(detail(page, 'Specific location')).toContainText(spot);
  await expect(detail(page, 'Specific location')).toContainText('Displayed specific location is inherited from the parent container.');

  // Editing shows the item's own saved values with a note.
  await page.goto(`/items/${camera.id}/edit`);
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Specific location', { exact: true })).toHaveValue('Old shelf');
  await expect(page.getByText('These fields keep this item\'s own saved values.')).toBeVisible();

  // Searching the box's spot finds the box and the camera inside it; the detail sits under Location.
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await searchBox(page).fill(spot);
  const table = page.getByRole('table');
  const row = table.getByRole('row').filter({ hasText: camera.name });
  await expect(row.getByRole('cell').filter({ hasText: home })).toContainText(spot);
  await expect(table.getByRole('row').filter({ hasText: box.name })).toHaveCount(2);
  await searchBox(page).fill('Old shelf');
  await expect(page.getByText('No matching items')).toBeVisible();

  // The dedicated column replaces the secondary line, so the detail is never shown twice.
  await searchBox(page).fill(spot);
  await page.getByRole('button', { name: 'Columns' }).click();
  const picker = page.getByRole('group', { name: 'Visible columns' });
  await expect(picker.getByRole('checkbox', { name: 'Specific location' })).not.toBeChecked();
  await picker.getByRole('checkbox', { name: 'Specific location' }).check();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('columnheader', { name: 'Specific location' })).toBeVisible();
  await expect(row.getByRole('cell', { name: home, exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: spot, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('button', { name: 'Reset to default' }).click();
});

test('taking an item out of its container sets both placement fields from one explicit choice', async ({ page, request }) => {
  const { home, spot, camera } = await setup(request, 'Detach');
  await page.goto(`/items/${camera.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('radio', { name: `Where it was: ${home} · ${spot}` })).toBeVisible();
  await page.getByRole('radio', { name: 'Its own saved location: Old garage · Old shelf' }).check();
  await expect(page.getByLabel('Specific location', { exact: true })).toHaveValue('Old shelf');
  await page.getByRole('radio', { name: 'No location' }).check();
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Specific location', { exact: true })).toHaveValue('');
  await page.getByRole('radio', { name: `Where it was: ${home} · ${spot}` }).check();
  await expect(page.getByLabel('Specific location', { exact: true })).toHaveValue(spot);
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: camera.name })).toBeVisible();
  await expect(detail(page, 'Location')).toHaveText(home);
  await expect(detail(page, 'Specific location')).toHaveText(spot);
});

test('moving the box within its location shows in the history of the camera inside it', async ({ page, request }) => {
  const { home, spot, box, camera } = await setup(request, 'Moved');
  await page.goto(`/items/${box.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByLabel('Specific location', { exact: true }).fill('Living room, lower cabinet');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(historyCard(page).getByText(`${home} · ${spot} → ${home} · Living room, lower cabinet`)).toBeVisible();

  await page.goto(`/items/${camera.id}`);
  const preview = historyCard(page);
  await expect(preview.getByRole('heading', { name: 'Location changed' })).toBeVisible();
  await expect(preview.getByText(`${home} · ${spot} → ${home} · Living room, lower cabinet`)).toBeVisible();
  await expect(preview.getByText(`Moved together with ${box.name}`)).toBeVisible();
  await expect(detail(page, 'Specific location')).toContainText('Living room, lower cabinet');
});

test('the Specific location is translated into Ukrainian', async ({ page, request }) => {
  const { spot, camera } = await setup(request, 'Ukrainian');
  await page.addInitScript(key => localStorage.setItem(key, 'uk'), LOCALE_KEY);
  await page.goto(`/items/${camera.id}`);
  await expect(detail(page, 'Точне місце')).toContainText(spot);
  await expect(detail(page, 'Точне місце')).toContainText('Показане точне місце успадковано від батьківського контейнера.');
  await page.goto(`/items/${camera.id}/edit`);
  await expect(page.getByLabel('Точне місце', { exact: true })).toHaveValue('Old shelf');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the item card shows the placement on one line', async ({ page, request }) => {
    const { home, spot, camera } = await setup(request, 'Phone');
    await page.goto('/items');
    await searchBox(page).fill(spot);
    const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: camera.name, exact: true }) });
    await expect(card).toContainText(`Location: ${home} · ${spot}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
