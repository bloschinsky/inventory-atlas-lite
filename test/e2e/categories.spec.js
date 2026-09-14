import { expect, test } from '@playwright/test';
import { unique } from './helpers.js';

test('creates a category and its custom fields', async ({ page }) => {
  const categoryName = unique('Cameras');
  await page.goto('/categories');

  await page.getByPlaceholder('New category name').fill(categoryName);
  await page.getByPlaceholder('New category name').press('Enter');
  const entry = page.getByRole('button').filter({ hasText: categoryName });
  await expect(entry).toContainText('0 items · 0 fields');

  await entry.click();
  await expect(page.getByText(`Fields for ${categoryName}`)).toBeVisible();
  await expect(page.getByText('No custom fields.')).toBeVisible();

  for (const [name, type] of [['Brand', 'text'], ['Year', 'number']]) {
    await page.getByPlaceholder('Field name').fill(name);
    await page.getByLabel('Field type').selectOption(type);
    await page.getByPlaceholder('Field name').press('Enter');
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type);
  }

  // The category summary reflects both new fields once the list reloads.
  await expect(entry).toContainText('0 items · 2 fields');
});
