import { expect, test } from '@playwright/test';
import { createCategory, unique } from './helpers.js';

const LOCALE_STORAGE_KEY = 'inventory-atlas.locale';
const WIDTHS = [320, 375, 390, 768, 1024, 1440];

// The optional features are stubbed, so each test sees exactly the entry points it expects.
const stubCapabilities = (page, { ai = true, urlImport = true } = {}) => page.route('/api/capabilities', route => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ ai: { enabled: ai, imageInput: true }, urlImport, instanceLabel: null })
}));
const menuToggle = (page, name = 'More ways to add an item') => page.getByRole('button', { name });
const menu = page => page.locator('#add-item-menu');
const menuLabels = page => menu(page).locator('.dropdown-item').allInnerTexts();

async function openItems(page) {
  await page.goto('/items');
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);
}

test('Add item keeps the AI quick action and lists every way to add an item', async ({ page, request }) => {
  const categoryName = unique('Add Menu Gear');
  await createCategory(request, categoryName);
  await stubCapabilities(page);
  await openItems(page);

  // AI Add Item is a visible shortcut, and the standalone Batch Add button is gone.
  const header = page.locator('.page-header');
  await expect(header.getByRole('link', { name: 'AI Add Item' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Batch Add from JSON' })).toHaveCount(0);

  const toggle = menuToggle(page);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect((await menuLabels(page)).map(label => label.trim()))
    .toEqual(['Blank item', 'From template…', 'From URL', 'AI Add Item', 'Batch Add from JSON']);
  await expect(menu(page).getByRole('separator')).toHaveCount(1);

  // Escape closes the menu and returns focus to its toggle; an outside click closes it too.
  await menu(page).getByRole('link', { name: 'Blank item' }).focus();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole('heading', { name: 'Items', level: 1 }).click();
  await expect(menu(page)).toHaveCount(0);

  // Batch Add opens the same dialog for the selected category; Cancel returns to the menu toggle.
  await page.getByLabel('Category').selectOption({ label: categoryName });
  await toggle.click();
  await menu(page).getByRole('button', { name: 'Batch Add from JSON' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Batch Add Items from JSON for ${categoryName}` })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // The AI entry of the menu opens the same page as the shortcut.
  await toggle.click();
  await menu(page).getByRole('link', { name: 'AI Add Item' }).click();
  await expect(page).toHaveURL('/items/ai');

  // The main part of the split button still opens the blank form at once.
  await openItems(page);
  await page.getByRole('link', { name: 'Add item', exact: true }).click();
  await expect(page).toHaveURL('/items/new');
});

test('Add item leaves out the features that are off and disables Batch Add without categories', async ({ page }) => {
  await stubCapabilities(page, { ai: false, urlImport: false });
  await page.route(url => url.pathname === '/api/categories', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await openItems(page);

  await expect(page.getByRole('link', { name: 'AI Add Item' })).toHaveCount(0);
  await menuToggle(page).click();
  expect((await menuLabels(page)).map(label => label.trim())).toEqual(['Blank item', 'From template…', 'Batch Add from JSON']);
  await expect(menu(page).getByRole('button', { name: 'Batch Add from JSON' })).toBeDisabled();
});

for (const locale of ['en', 'uk']) {
  test(`the Add item menu stays inside the viewport at every width (${locale})`, async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [LOCALE_STORAGE_KEY, locale]);
    await stubCapabilities(page);
    const toggleName = locale === 'uk' ? 'Інші способи додати предмет' : 'More ways to add an item';
    const shortcutName = locale === 'uk' ? 'Додати предмет з AI' : 'AI Add Item';

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await openItems(page);
      const shortcut = page.locator('.page-header').getByRole('link', { name: shortcutName });
      await expect(shortcut).toBeVisible();
      await menuToggle(page, toggleName).click();
      await expect(menu(page)).toBeVisible();

      const layout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const box = document.getElementById('add-item-menu').getBoundingClientRect();
        const truncated = [...document.querySelectorAll('#add-item-menu .dropdown-item, .page-header .btn')]
          .filter(element => element.scrollWidth > element.clientWidth).length;
        return { viewport, left: box.left, right: box.right, pageWidth: document.documentElement.scrollWidth, truncated };
      });
      expect(layout.left, `menu left edge at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(layout.right, `menu right edge at ${width}px`).toBeLessThanOrEqual(layout.viewport);
      expect(layout.pageWidth, `page width at ${width}px`).toBeLessThanOrEqual(layout.viewport);
      expect(layout.truncated, `truncated labels at ${width}px`).toBe(0);

      // Every entry is comfortable to tap.
      for (const item of await menu(page).locator('.dropdown-item').all()) {
        expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(width < 768 ? 32 : 24);
      }
      await page.keyboard.press('Escape');
    }
  });
}
