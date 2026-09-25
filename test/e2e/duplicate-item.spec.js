import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');

test('Duplicate opens a prefilled Add Item form and saves a separate item', async ({ page, request }) => {
  const category = await createCategory(request, unique('Boxes'), [{ name: 'Size', type: 'text' }, { name: 'Sealed', type: 'boolean' }]);
  const [size, sealed] = await (await request.get(`/api/categories/${category.id}/fields`)).json();
  const container = await createItem(request, { name: unique('Shelf'), category_id: category.id });
  const sourceName = unique('Box #1');
  const source = await createItem(request, {
    name: sourceName, category_id: category.id, parent_item_id: container.id, description: 'Brown cardboard',
    condition: 'New', location: 'Garage', purchase_date: '2024-11-18', purchase_price: { amount: '12.50', currency: 'EUR' },
    serial_number: 'BOX-0001', transferred_to: 'Neighbor', field_values: { [size.id]: '40x24x21', [sealed.id]: '1' }
  });
  const photoBytes = await readFile(fixture);
  expect((await request.post(`/api/items/${source.id}/photos`, {
    multipart: { photos: { name: 'box.png', mimeType: 'image/png', buffer: photoBytes } }
  })).ok()).toBeTruthy();
  const sourceBefore = await (await request.get(`/api/items/${source.id}`)).json();

  await page.goto(`/items/${source.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Duplicate' }).click();

  // Nothing is created yet: the regular Add Item form opens with every value copied.
  await expect(page).toHaveURL(`/items/new?duplicate=${source.id}`);
  await expect(page.getByRole('heading', { name: 'Add item' })).toBeVisible();
  await expect(page.getByText(`Prefilled from the item “${sourceName}”.`, { exact: false })).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue(sourceName);
  await expect(page.getByLabel('Category *')).toHaveValue(String(category.id));
  await expect(page.getByLabel('Condition')).toHaveValue('New');
  await expect(page.getByLabel('Location')).toHaveValue('Garage');
  await expect(page.getByLabel('Transferred To')).toHaveValue('Neighbor');
  await expect(page.getByLabel('Purchase Date')).toHaveValue('2024-11-18');
  await expect(page.getByLabel('Purchase Price', { exact: true })).toHaveValue('12.50');
  await expect(page.getByLabel('Purchase Price currency')).toHaveValue('EUR');
  await expect(page.getByLabel('Serial Number')).toHaveValue('BOX-0001');
  await expect(page.getByText('Serial numbers are often unique.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Description')).toHaveValue('Brown cardboard');
  await expect(page.getByLabel('Size')).toHaveValue('40x24x21');
  await expect(page.getByLabel('Sealed')).toHaveValue('1');
  // The container and the photos stay with the source item.
  await expect(page.getByText(container.name)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Delete photo/ })).toHaveCount(0);
  expect((await (await request.get(`/api/items?search=${encodeURIComponent(sourceName)}`)).json()).pagination.total).toBe(1);

  // Every value stays editable before saving.
  const copyName = unique('Box #2');
  await page.getByLabel('Name *').fill(copyName);
  await page.getByLabel('Serial Number').fill('');
  await expect(page.getByText('Serial numbers are often unique.', { exact: false })).toHaveCount(0);
  await page.getByLabel('Size').fill('60x40x40');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: copyName })).toBeVisible();
  await expect(page).not.toHaveURL(`/items/${source.id}`);
  await expect(detail(page, 'Location')).toHaveText('Garage');
  await expect(detail(page, 'Size')).toHaveText('60x40x40');
  await expect(detail(page, 'Sealed')).toHaveText('Yes');
  await expect(page.getByText('No photos for this item yet.')).toBeVisible();
  const copyId = Number(new URL(page.url()).pathname.split('/').pop());

  const copy = await (await request.get(`/api/items/${copyId}`)).json();
  const original = await (await request.get(`/api/items/${source.id}`)).json();
  expect(copy.uuid).not.toBe(original.uuid);
  expect(copy.parent_item_id).toBeNull();
  expect(copy.serial_number).toBeNull();
  expect(copy.photos).toHaveLength(0);
  expect(copy.children).toHaveLength(0);
  // The source item is untouched, and deleting the copy leaves it in place.
  expect(original).toEqual(sourceBefore);
  expect(original).toMatchObject({ name: sourceName, serial_number: 'BOX-0001', parent_item_id: container.id });
  expect(original.photos).toHaveLength(1);
  expect(original.fields.find(field => field.id === size.id).value).toBe('40x24x21');
  expect((await request.delete(`/api/items/${copyId}`)).ok()).toBeTruthy();
  expect((await request.get(`/api/items/${source.id}`)).ok()).toBeTruthy();
});
