import { expect, test } from '@playwright/test';
import { detail } from './helpers.js';

const repository = 'https://github.com/bloschinsky/inventory-atlas-lite';

test('the About dialog shows the build metadata and is operated with the keyboard', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'About' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'About' });
  await expect(dialog).toBeVisible();
  // Opening the dialog moves the focus into it.
  await expect(dialog.getByRole('button', { name: 'Close About' })).toBeFocused();

  await expect(dialog.getByText('Inventory Atlas Lite', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Developed by Artem Bloschinsky')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', repository);

  // The values belong to the build that is running, so only their presence is asserted.
  for (const label of ['Version', 'Build', 'Build date']) {
    await expect(detail(dialog, label)).not.toBeEmpty();
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the About dialog closes with its own button', async ({ page }) => {
  await page.goto('/categories');
  await page.getByRole('button', { name: 'About' }).click();

  const dialog = page.getByRole('dialog', { name: 'About' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  // The dialog is an overlay only: it never leaves the page that opened it.
  await expect(page).toHaveURL('/categories');
});

test('the About entry in the mobile drawer replaces it with the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();

  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await drawer.getByRole('button', { name: 'About' }).click();
  await expect(drawer).toBeHidden();

  const dialog = page.getByRole('dialog', { name: 'About' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', repository);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
