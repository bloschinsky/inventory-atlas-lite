import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const sections = [
  ['/settings/interface', 'Interface'],
  ['/settings/database', 'Database'],
  ['/settings/cloud-backup', 'Cloud Backup'],
  ['/settings/ai', 'AI']
];

const dialog = page => page.getByRole('dialog', { name: 'Settings' });
const localNav = page => dialog(page).getByRole('navigation', { name: 'Settings sections' });
const closeButton = page => dialog(page).getByRole('button', { name: 'Close settings' });
// The main navigation sits behind the dialog while it is open, out of reach but still marked.
const mainSettingsLink = page => page.getByRole('navigation', { name: 'Main', exact: true, includeHidden: true })
  .getByRole('link', { name: 'Settings', exact: true, includeHidden: true });
// The page under the dialog: its heading, and a check that nothing of the dialog is left once it closes.
const pageHeading = page => page.locator('main h1');
const expectClosed = async page => {
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  await expect(page.locator('.page')).not.toHaveAttribute('inert');
};
const historyLength = page => page.evaluate(() => window.history.length);

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
  await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
  await expect(dialog(page).getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  for (const [path, title] of sections) {
    await page.goto(path);
    await page.mouse.move(600, 400);
    await expect(dialog(page).getByRole('heading', { name: title, level: 2, exact: true })).toBeVisible();
    // Only the chosen section is rendered.
    await expect(dialog(page).getByRole('heading', { level: 2 })).toHaveCount(1);
    await expect(localNav(page).getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(localNav(page).locator('[aria-current="page"]')).toHaveCount(1);
    // The main Settings link stays the active page for every section.
    await expect(mainSettingsLink(page)).toHaveAttribute('aria-current', 'page');
    // A directly opened address has no page of its own to cover, so the Dashboard is underneath.
    await expect(pageHeading(page)).toHaveText('Dashboard');
  }

  // A refresh keeps the section; an unknown one falls back to the default.
  await page.reload();
  await expect(dialog(page).getByRole('heading', { name: 'AI', level: 2, exact: true })).toBeVisible();
  await page.goto('/settings/unknown');
  await expect(page).toHaveURL('/settings/interface');

  // Closing a directly opened Settings address lands on the Dashboard under it.
  await closeButton(page).click();
  await expect(page).toHaveURL('/dashboard');
  await expectClosed(page);
});

test('the desktop dialog opens over the page, switches sections in place, and closes back to the same page', async ({ page, request }) => {
  const category = await createCategory(request, unique('Settings Overlay'));
  const word = unique('Overlay');
  for (let index = 0; index < 12; index++) await createItem(request, { name: `${word} ${index}`, category_id: category.id });

  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/items');
  await page.mouse.move(600, 400);
  const searched = page.waitForResponse(response => response.url().includes('/api/items?') && response.url().includes('search='));
  await page.getByLabel('Search', { exact: true }).fill(word);
  await searched;
  await expect(page.getByRole('link', { name: `${word} 11`, exact: true }).first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolled = await page.evaluate(() => window.scrollY);
  // Marks the rendered page: the mark survives only if the page is never created again.
  await pageHeading(page).evaluate(node => { node.dataset.kept = 'yes'; });

  await mainSettingsLink(page).click();
  await page.mouse.move(900, 300);
  await expect(page).toHaveURL('/settings/interface');
  await expect(dialog(page)).toBeVisible();
  await expect(closeButton(page)).toBeFocused();
  // The page stays rendered and unchanged under the dialog, but out of reach.
  await expect(page.locator('.page')).toHaveAttribute('inert', '');
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue(word);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  // A large dialog with the grouped section list on the left.
  const box = await dialog(page).locator('.modal-dialog').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(850);
  expect(box.width).toBeLessThanOrEqual(950);
  expect(box.height).toBeLessThanOrEqual(500);
  await expect(localNav(page).getByRole('group')).toHaveText([/General\s*Interface/, /Data\s*Database\s*Cloud Backup/, /Services\s*AI/]);
  // Phones get the selector instead; on a desktop it stays out of the way.
  await expect(dialog(page).getByLabel('Section', { exact: true })).toBeHidden();

  // Sections replace the address, so they add no history entries of their own.
  const entries = await historyLength(page);
  await localNav(page).getByRole('link', { name: 'Cloud Backup', exact: true }).click();
  await expect(page).toHaveURL('/settings/cloud-backup');
  await expect(dialog(page).getByRole('region', { name: 'Cloud Backup' })).toBeVisible();
  await expect(localNav(page).getByRole('link', { name: 'Cloud Backup', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(localNav(page).getByRole('link', { name: 'Interface', exact: true })).not.toHaveAttribute('aria-current');
  await localNav(page).getByRole('link', { name: 'AI', exact: true }).click();
  await expect(page).toHaveURL('/settings/ai');
  await expect(dialog(page).getByLabel('Enable AI features')).toBeVisible();
  expect(await historyLength(page)).toBe(entries);

  // A long section scrolls inside the dialog, never the page behind it.
  const pane = dialog(page).locator('.app-settings-pane');
  expect(await pane.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await pane.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => pane.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await expect(closeButton(page)).toBeVisible();

  // The focus stays in the dialog.
  for (let step = 0; step < 25; step++) {
    await page.keyboard.press('Tab');
    expect(await dialog(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
  }

  await closeButton(page).click();
  await expect(page).toHaveURL('/items');
  await expectClosed(page);
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue(word);
  await expect(pageHeading(page)).toHaveAttribute('data-kept', 'yes');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  // The opener gets the focus back.
  await expect(mainSettingsLink(page)).toBeFocused();
});

test('Escape, Back, and Forward close and reopen the dialog over the page it was opened from', async ({ page }) => {
  await page.goto('/hierarchy');
  await page.mouse.move(600, 400);
  await mainSettingsLink(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(pageHeading(page)).toHaveText('Hierarchy');

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/hierarchy');
  await expectClosed(page);

  await page.goForward();
  await expect(page).toHaveURL('/settings/interface');
  await expect(dialog(page)).toBeVisible();
  await expect(pageHeading(page)).toHaveText('Hierarchy');

  await page.goBack();
  await expect(page).toHaveURL('/hierarchy');
  await expectClosed(page);

  // Another page in between: the dialog reopened by Forward covers that page, never a stale one.
  await page.getByRole('link', { name: 'Templates', exact: true }).click();
  await expect(pageHeading(page)).toHaveText('Templates');
  await mainSettingsLink(page).click();
  await expect(pageHeading(page)).toHaveText('Templates');
  await page.goBack();
  await expect(page).toHaveURL('/templates');
  await expectClosed(page);
  await page.goBack();
  await expect(page).toHaveURL('/hierarchy');
  await expectClosed(page);
});

test('a link to a Settings section opens it over the page that links to it', async ({ page }) => {
  await page.goto('/data');
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Cloud Backup in Settings' }).click();
  await expect(page).toHaveURL('/settings/cloud-backup');
  await expect(dialog(page).getByRole('region', { name: 'Cloud Backup' })).toBeVisible();
  await expect(pageHeading(page)).toHaveText('Data / Backup');
  await closeButton(page).click();
  await expect(page).toHaveURL('/data');
  await expectClosed(page);
});

test('unsaved changes are kept unless discarding them is confirmed', async ({ page, request }) => {
  const original = (await (await request.get('/api/database/metadata')).json()).name;
  const prompts = [];
  let answer = false;
  page.on('dialog', async prompt => { prompts.push(prompt.message()); await (answer ? prompt.accept() : prompt.dismiss()); });

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await mainSettingsLink(page).click();
  await localNav(page).getByRole('link', { name: 'Database', exact: true }).click();
  const name = dialog(page).getByLabel('Database name');
  await expect(name).toHaveValue(original);
  await name.fill(`${original} draft`);

  // Another section, the close button, Escape, and Back all ask, and declining keeps the edit.
  await localNav(page).getByRole('link', { name: 'Interface', exact: true }).click();
  await closeButton(page).click();
  await page.keyboard.press('Escape');
  await page.goBack();
  await expect.poll(() => prompts.length).toBe(4);
  expect(new Set(prompts)).toEqual(new Set(['Discard the unsaved changes in Settings?']));
  await expect(page).toHaveURL('/settings/database');
  await expect(name).toHaveValue(`${original} draft`);

  // An edit taken back is no change at all.
  await name.fill(original);
  await localNav(page).getByRole('link', { name: 'Interface', exact: true }).click();
  await expect(page).toHaveURL('/settings/interface');
  expect(prompts).toHaveLength(4);

  // A saved change asks nothing.
  await localNav(page).getByRole('link', { name: 'Database', exact: true }).click();
  const renamed = unique('Saved name');
  await name.fill(renamed);
  await dialog(page).getByRole('button', { name: 'Save name' }).click();
  await expect(dialog(page).getByRole('status')).toHaveText('Database name saved.');
  await closeButton(page).click();
  await expect(page).toHaveURL('/items');
  expect(prompts).toHaveLength(4);

  // Confirming discards the edit and closes.
  await mainSettingsLink(page).click();
  await localNav(page).getByRole('link', { name: 'Database', exact: true }).click();
  await dialog(page).getByLabel('Database name').fill(`${renamed} draft`);
  answer = true;
  await closeButton(page).click();
  await expect(page).toHaveURL('/items');
  await expectClosed(page);
  expect(prompts).toHaveLength(5);
  expect((await (await request.get('/api/database/metadata')).json()).name).toBe(renamed);

  await request.put('/api/database/metadata', { data: { name: original } });
});

test('phones get a full-screen dialog with the section selector, opened from the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/items');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('dialog', { name: 'Main navigation' }).getByRole('link', { name: 'Settings', exact: true }).click();

  await expect(page).toHaveURL('/settings/interface');
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.locator('.offcanvas-backdrop')).toHaveCount(0);
  await expect(closeButton(page)).toBeFocused();
  const box = await dialog(page).locator('.modal-content').boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(localNav(page)).toBeHidden();

  const selector = dialog(page).getByLabel('Section', { exact: true });
  await expect(selector).toHaveValue('/settings/interface');
  await expect(selector.locator('optgroup')).toHaveCount(3);
  const entries = await historyLength(page);
  await selector.selectOption({ label: 'AI' });
  await expect(page).toHaveURL('/settings/ai');
  await expect(dialog(page).getByLabel('Enable AI features')).toBeVisible();
  await expect(selector).toHaveValue('/settings/ai');
  expect(await historyLength(page)).toBe(entries);

  // The selector works from the keyboard alone.
  await selector.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL('/settings/cloud-backup');
  await expect(dialog(page).getByRole('region', { name: 'Cloud Backup' })).toBeVisible();

  // The section scrolls inside the dialog, and its last control can be reached.
  const pane = dialog(page).locator('.app-settings-pane');
  await dialog(page).getByRole('button', { name: 'Save schedule' }).scrollIntoViewIfNeeded();
  await expect(dialog(page).getByRole('button', { name: 'Save schedule' })).toBeInViewport();
  expect(await pane.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await closeButton(page).click();
  await expect(page).toHaveURL('/items');
  await expectClosed(page);
});

test('the dialog follows the dark mode and the Ukrainian interface', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await page.goto('/settings/interface');
  const uk = page.getByRole('dialog', { name: 'Налаштування' });
  await expect(uk.getByRole('button', { name: 'Закрити налаштування' })).toBeVisible();
  await expect(uk.getByRole('navigation', { name: 'Розділи налаштувань' })).toBeVisible();
  const background = await uk.locator('.modal-content').evaluate(node => getComputedStyle(node).backgroundColor);
  // A dark Tabler surface, not the light one.
  const channels = background.match(/\d+/g).slice(0, 3).map(Number);
  expect(Math.max(...channels)).toBeLessThan(100);
});
