import { expect, test } from '@playwright/test';
import { createCategory, createItem, openItemActions, unique } from './helpers.js';

const LOCALE_STORAGE_KEY = 'inventory-atlas.locale';

// The optional features are stubbed, so each test sees exactly the actions it expects.
const stubCapabilities = (page, { ai = true, urlImport = true } = {}) => page.route('/api/capabilities', route => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ ai: { enabled: ai, imageInput: true }, urlImport, instanceLabel: null })
}));
const menu = page => page.locator('#item-actions-menu');
// The visible menu entries, in order; the Transfer entry is hidden from the md breakpoint up.
const menuLabels = async page => (await menu(page).locator('.dropdown-item:visible').allInnerTexts()).map(label => label.trim());
// The visible Item details action buttons, in order.
const barLabels = async page => (await page.locator('.app-item-actions > .btn:visible, .app-item-actions > .dropdown > .btn')
  .allInnerTexts()).map(label => label.trim());

// The phone buttons stand side by side in one row, each a touch target of at least 44 px.
async function expectOneRow(buttons) {
  const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
  for (const box of boxes) {
    expect(box.y).toBe(boxes[0].y);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}
async function openItem(page, item) {
  await page.goto(`/items/${item.id}`);
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);
  await expect(page.getByRole('heading', { name: item.name, level: 1 })).toBeVisible();
}
async function newItem(request, data = {}) {
  const category = await createCategory(request, unique('Action Bar Gear'));
  return createItem(request, { name: unique('Action Bar Drill'), category_id: category.id, ...data });
}

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows Edit, Transfer, QR Code, and More, and groups every other action in More', async ({ page, request }) => {
    const item = await newItem(request);
    await stubCapabilities(page);
    await openItem(page, item);

    expect(await barLabels(page)).toEqual(['Edit', 'Transfer', 'QR Code', 'More']);
    const toggle = page.getByRole('button', { name: 'More actions' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await openItemActions(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // No duplicate Transfer shortcut in the menu; Delete is last, set apart, and red.
    expect(await menuLabels(page)).toEqual([
      'Fill from URL', 'Translate with AI', 'Duplicate', 'Save as template', 'Retire item', 'Delete item'
    ]);
    await expect(menu(page).getByRole('separator')).toHaveCount(2);
    await expect(menu(page).getByRole('button', { name: 'Delete item' })).toHaveClass(/text-danger/);

    // Escape closes the menu and returns focus to More; an outside click closes it too.
    await menu(page).getByRole('link', { name: 'Duplicate' }).focus();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(toggle).toBeFocused();
    // The keyboard opens it again and walks into it.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(menu(page).getByRole('link', { name: 'Fill from URL' })).toBeFocused();
    await page.getByRole('heading', { name: item.name, level: 1 }).click();
    await expect(menu(page)).toHaveCount(0);

    // Every entry keeps its destination or dialog.
    await openItemActions(page);
    await expect(menu(page).getByRole('link', { name: 'Fill from URL' })).toHaveAttribute('href', `/items/${item.id}/edit?import=url`);
    await expect(menu(page).getByRole('link', { name: 'Translate with AI' })).toHaveAttribute('href', `/items/${item.id}/edit?translate=item`);
    await expect(menu(page).getByRole('link', { name: 'Duplicate' })).toHaveAttribute('href', `/items/new?duplicate=${item.id}`);
    await expect(menu(page).getByRole('link', { name: 'Save as template' })).toHaveAttribute('href', `/templates/new?fromItem=${item.id}`);
    await menu(page).getByRole('button', { name: 'Retire item' }).click();
    const retire = page.getByRole('dialog', { name: `Retire ${item.name}` });
    await expect(retire).toBeVisible();
    await retire.getByRole('button', { name: 'Cancel' }).click();
    await expect(retire).toHaveCount(0);

    // Deleting still asks first; dismissing the confirmation keeps the item.
    await openItemActions(page);
    page.once('dialog', dialog => dialog.dismiss());
    await menu(page).getByRole('button', { name: 'Delete item' }).click();
    await expect(page.getByRole('heading', { name: item.name, level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Transfer', exact: true }).click();
    await expect(page.getByRole('dialog', { name: `Transfer ${item.name}` })).toBeVisible();
  });

  test('offers only the actions that fit the item and the enabled features', async ({ page, request }) => {
    await stubCapabilities(page, { ai: false, urlImport: false });
    const plain = await newItem(request);
    await openItem(page, plain);
    await openItemActions(page);
    expect(await menuLabels(page)).toEqual(['Duplicate', 'Save as template', 'Retire item', 'Delete item']);

    // A saved Source URL turns Fill from URL into Refresh from Source.
    await page.unroute('/api/capabilities');
    await stubCapabilities(page);
    const sourced = await newItem(request, { source_url: 'https://shop.example.com/drill' });
    await openItem(page, sourced);
    await openItemActions(page);
    await expect(menu(page).getByRole('link', { name: 'Fill from URL' })).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: 'Refresh from Source' }))
      .toHaveAttribute('href', `/items/${sourced.id}/edit?import=refresh`);

    // A lent item is returned from its Loan card, never lent a second time.
    const lent = await newItem(request);
    expect((await request.post(`/api/items/${lent.id}/transfers`, { data: { recipient: 'Volodia' } })).ok()).toBeTruthy();
    await openItem(page, lent);
    expect(await barLabels(page)).toEqual(['Edit', 'QR Code', 'More']);
    await expect(page.getByRole('button', { name: 'Mark as returned' })).toBeVisible();
    await openItemActions(page);
    await expect(menu(page).getByRole('button', { name: 'Transfer' })).toHaveCount(0);

    // A retired item can only be restored: no Transfer and no Retire.
    const retired = await newItem(request);
    expect((await request.patch(`/api/items/${retired.id}/lifecycle`, { data: { status: 'retired', reason: 'sold' } })).ok()).toBeTruthy();
    await openItem(page, retired);
    expect(await barLabels(page)).toEqual(['Edit', 'QR Code', 'More']);
    await openItemActions(page);
    expect(await menuLabels(page)).toEqual([
      'Fill from URL', 'Translate with AI', 'Duplicate', 'Save as template', 'Restore to inventory', 'Delete item'
    ]);
    await menu(page).getByRole('button', { name: 'Restore to inventory' }).click();
    await expect(page.getByRole('dialog', { name: `Restore ${retired.name}` })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true });

  for (const width of [320, 375, 390]) {
    test(`keeps Edit, QR Code, and More in one row at ${width} px and moves Transfer into More`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 800 });
      const item = await newItem(request, { name: unique('A rather long phone item name for the action bar') });
      await stubCapabilities(page);
      await openItem(page, item);

      expect(await barLabels(page)).toEqual(['Edit', 'QR Code', 'More']);
      const toggle = page.getByRole('button', { name: 'More actions' });
      await expectOneRow([page.getByRole('link', { name: 'Edit', exact: true }), page.getByRole('button', { name: 'QR Code' }), toggle]);

      await toggle.tap();
      expect(await menuLabels(page)).toEqual([
        'Transfer', 'Fill from URL', 'Translate with AI', 'Duplicate', 'Save as template', 'Retire item', 'Delete item'
      ]);
      const menuBox = await menu(page).boundingBox();
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      // A tap outside closes the menu; a tap on Transfer in it opens the same loan dialog.
      await page.getByRole('heading', { name: item.name, level: 1 }).tap();
      await expect(menu(page)).toHaveCount(0);
      await toggle.tap();
      await menu(page).getByRole('button', { name: 'Transfer' }).tap();
      await expect(page.getByRole('dialog', { name: `Transfer ${item.name}` })).toBeVisible();
    });
  }
});

test.describe('in Ukrainian on a dark phone', () => {
  test.use({ viewport: { width: 320, height: 800 }, colorScheme: 'dark' });

  test('labels the actions and the menu in Ukrainian', async ({ page, request }) => {
    await page.addInitScript(key => localStorage.setItem(key, 'uk'), LOCALE_STORAGE_KEY);
    const item = await newItem(request);
    await stubCapabilities(page);
    await openItem(page, item);
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');

    expect(await barLabels(page)).toEqual(['Редагувати', 'QR-код', 'Більше']);
    // The longer Ukrainian labels still fit one row on the narrowest phone.
    await expectOneRow([
      page.getByRole('link', { name: 'Редагувати', exact: true }),
      page.getByRole('button', { name: 'QR-код' }),
      page.getByRole('button', { name: 'Більше дій' })
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await openItemActions(page, 'Більше дій');
    expect(await menuLabels(page)).toEqual([
      'Передати', 'Заповнити з URL', 'Перекласти з AI', 'Дублювати', 'Зберегти як шаблон', 'Списати предмет', 'Видалити предмет'
    ]);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Більше дій' })).toBeFocused();
  });
});
