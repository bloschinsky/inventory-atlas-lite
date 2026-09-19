import { expect, test } from '@playwright/test';

test('the primary pages are reachable from the navigation bar', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Inventory Atlas Lite');
  await expect(page.getByRole('link', { name: 'Inventory Atlas Lite' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Items', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Categories & Fields' }).click();
  await expect(page).toHaveURL('/categories');
  await expect(page.getByRole('heading', { name: 'Categories & Fields' })).toBeVisible();
  // The sidebar marks the open page for assistive technology, not only with color.
  await expect(page.getByRole('link', { name: 'Categories & Fields' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Data / Backup' }).click();
  await expect(page).toHaveURL('/data');
  await expect(page.getByRole('heading', { name: 'Data / Backup' })).toBeVisible();

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Items', exact: true })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Add item' }).click();
  await expect(page).toHaveURL('/items/new');
  await expect(page.getByRole('heading', { name: 'Add item' })).toBeVisible();
});

test('the desktop sidebar rests folded and expands over the page on hover and on keyboard focus', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('aside.navbar-vertical');
  const label = page.locator('.navbar-vertical .nav-link-title', { hasText: 'Categories & Fields' });

  // Headless Chromium may initialize its pointer at (0, 0), directly over the sidebar.
  await page.mouse.move(600, 400);
  await expect.poll(async () => (await label.boundingBox()).width).toBe(0);
  const folded = (await sidebar.boundingBox()).width;
  const content = (await page.locator('.page-wrapper').boundingBox()).x;
  expect(folded).toBeLessThan(100);
  // Folded labels collapse to nothing, so only the icons are on screen.
  expect((await label.boundingBox()).width).toBe(0);

  await sidebar.hover();
  await expect.poll(async () => (await label.boundingBox()).width).toBeGreaterThan(0);
  await expect.poll(async () => (await sidebar.boundingBox()).width).toBeGreaterThan(folded);
  // The expanded rail overlays the page instead of pushing the content sideways.
  expect((await page.locator('.page-wrapper').boundingBox()).x).toBe(content);

  // Keyboard users reach the same labels without ever hovering.
  await page.mouse.move(600, 400);
  await expect.poll(async () => (await label.boundingBox()).width).toBe(0);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await label.boundingBox()).width).toBeGreaterThan(0);
});
