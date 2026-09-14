import { expect, test } from '@playwright/test';

test('the primary pages are reachable from the navigation bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Items', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Categories & Fields' }).click();
  await expect(page).toHaveURL('/categories');
  await expect(page.getByRole('heading', { name: 'Categories & Fields' })).toBeVisible();

  await page.getByRole('link', { name: 'Data / Backup' }).click();
  await expect(page).toHaveURL('/data');
  await expect(page.getByRole('heading', { name: 'Data / Backup' })).toBeVisible();

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: 'Add item' }).click();
  await expect(page).toHaveURL('/items/new');
  await expect(page.getByRole('heading', { name: 'Add item' })).toBeVisible();
});
