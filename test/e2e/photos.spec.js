import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, unique } from './helpers.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');

test('uploads a photo with a new item and shows it', async ({ page, request }) => {
  const categoryName = unique('Lenses');
  await createCategory(request, categoryName);
  const itemName = unique('Lens');

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Add photos').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Save item' }).click();

  const photo = page.getByRole('img', { name: 'sample-photo.png' });
  await expect(photo).toBeVisible();
  // The image is served back from SQLite, so it must actually decode in the browser.
  await expect.poll(() => photo.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByPlaceholder('Search name, description or serial number…').fill(itemName);
  await expect(page.getByRole('img', { name: itemName })).toBeVisible();
});
