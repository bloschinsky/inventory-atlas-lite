import { expect, test } from '@playwright/test';
import { unique } from './helpers.js';

/*
  The active database indicator in the application chrome and the optional instance label. The label
  comes from the server's ATLAS_INSTANCE_LABEL, which the suite's server does not set, so the tests
  that need one answer /api/capabilities themselves; restore keeping the label is covered against a
  real server in test/instance-label.test.js.
*/
const indicator = page => page.getByRole('link', { name: /^Active database:/ });
// The name in the desktop indicator while Settings covers the page, which is then inert and hidden from assistive technology.
const underSettings = page => page.locator('.app-database-bar .app-database-name');
const settingsDialog = page => page.getByRole('dialog', { name: 'Settings' });

async function rename(request, name) {
  expect((await request.put('/api/database/metadata', { data: { name } })).ok()).toBeTruthy();
}

// Serves the real capabilities with an instance label added, as a server with ATLAS_INSTANCE_LABEL would.
async function withInstanceLabel(page, instanceLabel) {
  await page.route('**/api/capabilities', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), instanceLabel } });
  });
}

const noSidewaysScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

let original;
test.beforeAll(async ({ request }) => {
  original = (await (await request.get('/api/database/metadata')).json()).name;
});
test.afterAll(async ({ request }) => {
  await rename(request, original);
});

test('the active database stays visible on every page beside the folded sidebar and opens its settings', async ({ page, request }) => {
  const name = unique('Workshop');
  await rename(request, name);

  await page.goto('/items?q=lamp');
  await page.mouse.move(600, 400);
  // Without an instance label the indicator is the database name alone.
  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${name}`);
  await expect(indicator(page)).toBeVisible();
  await expect(indicator(page)).toHaveAttribute('title', `${name} · Open database settings`);
  // The rail is folded, and the indicator sits beside it rather than inside it.
  const rail = await page.locator('aside.navbar-vertical').boundingBox();
  expect(rail.width).toBeLessThan(80);
  expect((await indicator(page).boundingBox()).x).toBeGreaterThanOrEqual(rail.x + rail.width);

  for (const path of ['/dashboard', '/hierarchy', '/checklists', '/data']) {
    await page.goto(path);
    await page.mouse.move(600, 400);
    await expect(indicator(page)).toHaveAccessibleName(`Active database: ${name}`);
  }

  // The keyboard opens Settings → Database over the page, and closing returns to that page as it was.
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByPlaceholder(/^Search name/).fill('lamp');
  const covered = page.url();
  await indicator(page).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/settings/database');
  await expect(settingsDialog(page).getByLabel('Database name')).toHaveValue(name);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(covered);
  await expect(settingsDialog(page)).toHaveCount(0);
  await expect(page.getByPlaceholder(/^Search name/)).toHaveValue('lamp');
  await expect(indicator(page)).toBeFocused();
});

test('a rename updates the indicator at once, and a refused rename leaves it alone', async ({ page, request }) => {
  const name = unique('Garage');
  await rename(request, name);
  await page.goto('/settings/database');
  await page.mouse.move(600, 400);
  const card = settingsDialog(page).getByRole('region', { name: 'Database' });
  await expect(card.getByLabel('Database name')).toHaveValue(name);

  const renamed = unique('Attic');
  await card.getByLabel('Database name').fill(renamed);
  // Typing alone changes nothing: only a saved name is the active database's name.
  await expect(underSettings(page)).toHaveText(name);
  await card.getByRole('button', { name: 'Save name' }).click();
  await expect(card.getByRole('status')).toHaveText('Database name saved.');
  await expect(underSettings(page)).toHaveText(renamed);

  // A name the server refuses never reaches the indicator.
  await page.route('**/api/database/metadata', route => (route.request().method() === 'PUT'
    ? route.fulfill({ status: 400, json: { error: { code: 'DATABASE_NAME_INVALID', params: {} } } })
    : route.fallback()));
  await card.getByLabel('Database name').fill(unique('Refused'));
  await card.getByRole('button', { name: 'Save name' }).click();
  await expect(card.getByRole('alert')).toBeVisible();
  await expect(underSettings(page)).toHaveText(renamed);

  // After closing, the page's indicator is reachable again and shows the saved name.
  await page.unroute('**/api/database/metadata');
  await card.getByLabel('Database name').fill(renamed);
  await page.keyboard.press('Escape');
  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${renamed}`);
});

test('long names and labels are cut without overflow, and markup in them stays text', async ({ page, request }) => {
  const name = `<img src=x onerror="window.injected=1">${'Very long database name '.repeat(4)}`.slice(0, 100);
  await rename(request, name);
  await withInstanceLabel(page, '<b>STAGING-EU-WEST-1-LONG</b>');
  await page.goto('/items');
  await page.mouse.move(600, 400);

  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${name} Instance: <b>STAGING-EU-WEST-1-LONG</b>`);
  await expect(indicator(page).locator('img, b')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  const nameText = indicator(page).locator('.app-database-name');
  expect(await nameText.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await expect(indicator(page)).toHaveAttribute('title', `${name} · Instance: <b>STAGING-EU-WEST-1-LONG</b> · Open database settings`);
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.setViewportSize({ width: 320, height: 640 });
  await expect(indicator(page)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('a configured instance label shows beside the name as text, not as color alone', async ({ page, request }) => {
  const name = unique('PROD copy');
  await rename(request, name);
  await withInstanceLabel(page, 'TEST');
  await page.goto('/dashboard');
  await page.mouse.move(600, 400);
  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${name} Instance: TEST`);
  await expect(indicator(page).locator('.app-instance-label')).toHaveText('Instance: TEST');
  await expect(indicator(page).locator('.app-instance-label')).toBeVisible();
});

test('the restored database brings its own name while the instance label stays the instance\'s', async ({ page, request }) => {
  const prod = unique('PROD inventory');
  await rename(request, prod);
  const backup = await (await request.get('/api/backup')).body();
  const current = unique('TEST inventory');
  await rename(request, current);

  await withInstanceLabel(page, 'TEST');
  await page.goto('/data');
  await page.mouse.move(600, 400);
  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${current} Instance: TEST`);

  await page.getByLabel('Backup file').setInputFiles({ name: 'prod.sqlite', mimeType: 'application/octet-stream', buffer: backup });
  await page.getByRole('button', { name: 'Validate backup' }).click();
  await page.getByLabel('Type RESTORE to confirm').fill('RESTORE');
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByText('Backup restored successfully')).toBeVisible();
  // Shown before the page reloads itself, and again after it.
  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${prod} Instance: TEST`);
  await page.waitForURL('**/items', { timeout: 15000 });
  await expect(indicator(page)).toHaveAccessibleName(`Active database: ${prod} Instance: TEST`);
});

test('a failed metadata load shows a quiet unavailable state instead of a name', async ({ page }) => {
  await page.route('**/api/database/metadata', route => route.fulfill({ status: 503, json: { error: { code: 'MAINTENANCE_IN_PROGRESS', params: {} } } }));
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await expect(indicator(page)).toHaveAccessibleName('Active database: Database unavailable');
  await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
});

test.describe('on phones', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('the mobile header shows the database under the product name and opens its settings', async ({ page, request }) => {
    const name = unique('Basement');
    await rename(request, name);
    await withInstanceLabel(page, 'TEST');
    await page.goto('/items');

    const header = page.locator('header.navbar');
    await expect(header.getByRole('link', { name: 'Inventory Atlas Lite' })).toBeVisible();
    await expect(indicator(page)).toHaveAccessibleName(`Active database: ${name} Instance: TEST`);
    const brand = await header.getByRole('link', { name: 'Inventory Atlas Lite' }).boundingBox();
    const line = await indicator(page).boundingBox();
    expect(line.y).toBeGreaterThanOrEqual(brand.y + brand.height - 1);
    // Still a compact header, and nothing pushes the page sideways.
    expect((await header.boundingBox()).height).toBeLessThanOrEqual(72);
    expect(await noSidewaysScroll(page)).toBe(true);

    await indicator(page).click();
    await expect(page).toHaveURL('/settings/database');
    await expect(settingsDialog(page).getByLabel('Database name')).toHaveValue(name);
    await settingsDialog(page).getByRole('button', { name: 'Close settings' }).click();
    await expect(page).toHaveURL('/items');
  });
});

test('the indicator follows the Ukrainian interface and the dark mode', async ({ page, request }) => {
  const name = unique('Комора');
  await rename(request, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await withInstanceLabel(page, 'PROD');
  await page.goto('/items');
  await page.mouse.move(600, 400);

  // Only the labels are translated; the database name and the instance label are shown as they are.
  const uk = page.getByRole('link', { name: `Активна база даних: ${name} Екземпляр: PROD` });
  await expect(uk).toBeVisible();
  await expect(uk).toHaveAttribute('title', `${name} · Екземпляр: PROD · Відкрити налаштування бази даних`);
  const color = await uk.locator('.app-database-name').evaluate(node => getComputedStyle(node).color);
  // Light text on the dark surface.
  const channels = color.match(/\d+/g).slice(0, 3).map(Number);
  expect(Math.min(...channels)).toBeGreaterThan(150);
});
