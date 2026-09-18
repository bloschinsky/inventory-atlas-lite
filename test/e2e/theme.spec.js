import { expect, test } from '@playwright/test';

const themeOf = page => page.locator('html').getAttribute('data-bs-theme');

test.describe('a dark operating system', () => {
  test.use({ colorScheme: 'dark' });

  test('is followed on the first visit, even before any script runs', async ({ page }) => {
    // Blocking every script proves the color mode is applied by the inline head script,
    // so a stored dark mode can never flash light while the bundle loads.
    await page.route('**/*.js', route => route.abort());
    await page.goto('/');
    expect(await themeOf(page)).toBe('dark');
  });

  test('is overridden by an explicit light choice that survives a reload', async ({ page }) => {
    await page.goto('/');
    expect(await themeOf(page)).toBe('dark');

    // The toggle only shows once the folded desktop rail expands on hover.
    await page.locator('aside.navbar-vertical').hover();
    await page.getByRole('button', { name: 'Light mode' }).click();
    expect(await themeOf(page)).toBe('light');

    await page.reload();
    expect(await themeOf(page)).toBe('light');
    await page.locator('aside.navbar-vertical').hover();
    await expect(page.getByRole('button', { name: 'Light mode' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('a light operating system can be switched to dark for every page', async ({ page }) => {
  await page.goto('/');
  expect(await themeOf(page)).toBe('light');

  // The toggle only shows once the folded desktop rail expands on hover.
  await page.locator('aside.navbar-vertical').hover();
  await page.getByRole('button', { name: 'Dark mode' }).click();
  expect(await themeOf(page)).toBe('dark');

  await page.getByRole('link', { name: 'Categories & Fields' }).click();
  await expect(page).toHaveURL('/categories');
  expect(await themeOf(page)).toBe('dark');

  await page.reload();
  expect(await themeOf(page)).toBe('dark');
});
