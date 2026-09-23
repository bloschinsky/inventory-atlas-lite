import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCategory, createItem, unique } from './helpers.js';

const photo = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png'));

// Empties the shared isolated test database through the API so the counts shown by the dialog are
// exactly the records seeded below. The suite never runs against data/inventory.sqlite.
async function resetThroughApi(request) {
  const prepared = await request.post('/api/database/reset/prepare', { data: {} });
  expect(prepared.ok()).toBeTruthy();
  const applied = await request.post('/api/database/reset/apply', {
    data: { resetToken: (await prepared.json()).resetToken, confirmation: 'RESET INVENTORY' }
  });
  expect(applied.ok()).toBeTruthy();
}

async function addPhoto(request, itemId) {
  const response = await request.post(`/api/items/${itemId}/photos`, {
    multipart: { photos: { name: 'sample-photo.png', mimeType: 'image/png', buffer: photo } }
  });
  expect(response.ok()).toBeTruthy();
}

test('resets the inventory from the Danger Zone after reviewing the impact and confirming', async ({ page, request }) => {
  await resetThroughApi(request);
  const cameras = await createCategory(request, unique('Reset cameras'), [{ name: 'Brand', type: 'text' }, { name: 'Year', type: 'number' }]);
  const books = await createCategory(request, unique('Reset books'), [{ name: 'Author', type: 'text' }]);
  const camerasFields = await (await request.get(`/api/categories/${cameras.id}/fields`)).json();
  const camera = await createItem(request, {
    name: unique('Reset camera'), category_id: cameras.id, field_values: { [camerasFields[0].id]: 'Zenit', [camerasFields[1].id]: '1978' }
  });
  const lens = await createItem(request, { name: unique('Reset lens'), category_id: cameras.id, parent_item_id: camera.id });
  await createItem(request, { name: unique('Reset book'), category_id: books.id });
  await addPhoto(request, camera.id);
  await addPhoto(request, lens.id);

  await page.goto('/data');
  // A fresh page can keep the pointer at (0, 0), which expands the folded sidebar over the content.
  await page.mouse.move(600, 400);
  await expect(page.getByRole('heading', { name: 'Danger Zone' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Inventory Database' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reset Inventory Database' });
  await expect(dialog.getByRole('list', { name: 'Data that will be removed' }).getByRole('listitem')).toHaveText([
    '3 items', '2 categories', '3 custom fields', '2 custom field values', '2 photos'
  ]);

  // The destructive button needs both the acknowledgement and the exact phrase.
  const resetButton = dialog.getByRole('button', { name: 'Reset Database' });
  const phrase = dialog.getByLabel('Type RESET INVENTORY to confirm');
  await expect(resetButton).toBeDisabled();
  await dialog.getByLabel('I understand that all inventory data will be permanently removed.').check();
  await expect(resetButton).toBeDisabled();
  await phrase.fill('reset inventory');
  await expect(resetButton).toBeDisabled();
  await phrase.fill('RESET INVENTORY');
  await expect(resetButton).toBeEnabled();

  await resetButton.click();
  await expect(page.getByText('Database reset completed.')).toBeVisible();
  await expect(page.getByText('Inventory Atlas Lite is ready for a fresh inventory.')).toBeVisible();
  await expect(page.getByText(/pre-reset-.*\.sqlite/)).toBeVisible();

  // The page reloads itself into the now empty items list.
  await page.waitForURL('**/items', { timeout: 15000 });
  await expect(page.getByText('No items yet')).toBeVisible();

  // The application stays usable: a new category can be created right away.
  const fresh = unique('After reset');
  await page.goto('/categories');
  await page.mouse.move(600, 400);
  await page.getByPlaceholder('New category name').fill(fresh);
  await page.getByPlaceholder('New category name').press('Enter');
  await expect(page.getByRole('button').filter({ hasText: fresh })).toContainText('0 items · 0 fields');
  await expect(page.getByRole('button').filter({ hasText: cameras.name })).toHaveCount(0);
});
