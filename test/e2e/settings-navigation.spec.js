import { expect, test } from '@playwright/test';

const sections = [
  ['/settings/interface', 'Interface'],
  ['/settings/database', 'Database'],
  ['/settings/cloud-backup', 'Cloud Backup'],
  ['/settings/ai', 'AI']
];

const localNav = page => page.getByRole('navigation', { name: 'Settings sections' });
const mainSettingsLink = page => page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Settings', exact: true });

/*
  Settings also loads the AI model list whenever an earlier spec left an API key saved. That list is
  answered here, so it never reaches a real provider.
*/
test.beforeEach(async ({ page }) => {
  await page.route('**/api/ai/models', route => route.fulfill({ json: { models: [] } }));
});

test('/settings opens the Interface section and every section has its own address', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL('/settings/interface');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  for (const [path, title] of sections) {
    await page.goto(path);
    await page.mouse.move(600, 400);
    await expect(page.getByRole('heading', { name: title, level: 2, exact: true })).toBeVisible();
    // Only the chosen section is rendered.
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);
    await expect(localNav(page).getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(localNav(page).locator('[aria-current="page"]')).toHaveCount(1);
    // The main Settings link stays the active page for every section.
    await expect(mainSettingsLink(page)).toHaveAttribute('aria-current', 'page');
  }

  // A refresh keeps the section; an unknown one falls back to the default.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'AI', level: 2, exact: true })).toBeVisible();
  await page.goto('/settings/unknown');
  await expect(page).toHaveURL('/settings/interface');
});

test('the desktop section list groups the sections and switches between them', async ({ page }) => {
  await page.goto('/settings/interface');
  await page.mouse.move(600, 400);
  const nav = localNav(page);
  await expect(nav.getByRole('group')).toHaveText([/General\s*Interface/, /Data\s*Database\s*Cloud Backup/, /Services\s*AI/]);
  // Phones get the selector instead; on a desktop it stays out of the way.
  await expect(page.getByLabel('Section', { exact: true })).toBeHidden();

  await nav.getByRole('link', { name: 'Cloud Backup', exact: true }).click();
  await expect(page).toHaveURL('/settings/cloud-backup');
  await expect(page.getByRole('region', { name: 'Cloud Backup' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Cloud Backup', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Interface', exact: true })).not.toHaveAttribute('aria-current');

  await nav.getByRole('link', { name: 'Database', exact: true }).click();
  await expect(page).toHaveURL('/settings/database');
  await expect(page.getByRole('region', { name: 'Database' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cloud Backup' })).toHaveCount(0);
});

test('phones choose the section from a compact selector instead of the side list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings/interface');
  await expect(localNav(page)).toBeHidden();
  const selector = page.getByLabel('Section', { exact: true });
  await expect(selector).toHaveValue('/settings/interface');
  await expect(selector.locator('optgroup')).toHaveCount(3);

  await selector.selectOption({ label: 'AI' });
  await expect(page).toHaveURL('/settings/ai');
  await expect(page.getByLabel('Enable AI features')).toBeVisible();
  await expect(selector).toHaveValue('/settings/ai');

  // The selector works from the keyboard alone.
  await selector.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL('/settings/cloud-backup');
  await expect(page.getByRole('region', { name: 'Cloud Backup' })).toBeVisible();
});
