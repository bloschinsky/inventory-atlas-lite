import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

test('stores an item inside another one and links both directions', async ({ page, request }) => {
  const categoryName = unique('Storage');
  const category = await createCategory(request, categoryName);
  const boxName = unique('Box');
  await createItem(request, { name: boxName, category_id: category.id });
  const cableName = unique('Cable');

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(cableName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByPlaceholder('Search an item to store this one in…').fill(boxName);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: boxName }).click();
  await expect(page.getByText(boxName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: cableName })).toBeVisible();
  await expect(detail(page, 'Stored inside')).toHaveText(boxName);

  // Following the parent link shows the child under the container's contents.
  await detail(page, 'Stored inside').getByRole('link').click();
  await expect(page.getByRole('heading', { name: boxName })).toBeVisible();
  await expect(page.getByRole('link', { name: cableName })).toBeVisible();

  await page.getByRole('link', { name: cableName }).click();
  await expect(page.getByRole('heading', { name: cableName })).toBeVisible();
});
