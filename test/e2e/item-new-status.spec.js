import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const searchBox = page => page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…');
const newBadge = /bg-success-subtle text-success-emphasis/;
const usedBadge = /bg-warning-subtle text-warning-emphasis/;

// A new item and a used one, so every view shows both badges.
async function newAndUsedItems(request) {
  const category = await createCategory(request, unique('Lenses'));
  const token = unique('Badged');
  const fresh = await createItem(request, { name: `${token} fresh`, category_id: category.id, is_new: true });
  const worn = await createItem(request, { name: `${token} worn`, category_id: category.id, is_new: false });
  return { token, fresh, worn };
}

// WCAG contrast ratio between the badge text and its own background, as the browser resolved them.
const contrastOf = badge => badge.evaluate(element => {
  const style = getComputedStyle(element);
  const channels = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luminance = color => {
    const [r, g, b] = channels(color).map(value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
});

test('the New column shows New and Used badges and still sorts by the boolean', async ({ page, request }) => {
  const { token } = await newAndUsedItems(request);

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('group', { name: 'Visible columns' }).getByRole('checkbox', { name: 'New', exact: true }).check();
  await page.keyboard.press('Escape');
  await searchBox(page).fill(token);

  const table = page.getByRole('table');
  const row = suffix => table.getByRole('row').filter({ hasText: `${token} ${suffix}` });
  // The cell holds only the badge: no Yes/No text beside it.
  await expect(row('fresh').getByRole('cell', { name: 'New', exact: true }).locator('.badge')).toHaveClass(newBadge);
  await expect(row('worn').getByRole('cell', { name: 'Used', exact: true }).locator('.badge')).toHaveClass(usedBadge);

  // Ascending puts false before true; the localized words play no part in the order.
  const header = table.getByRole('columnheader', { name: 'New', exact: true });
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.getByRole('row').nth(1)).toContainText(`${token} worn`);
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(table.getByRole('row').nth(1)).toContainText(`${token} fresh`);
});

test('Item Details shows the badge while the form keeps the New switch', async ({ page, request }) => {
  const { fresh, worn } = await newAndUsedItems(request);

  await page.goto(`/items/${fresh.id}`);
  await expect(detail(page, 'New')).toHaveText('New');
  await expect(detail(page, 'New').locator('.badge')).toHaveClass(newBadge);

  await page.goto(`/items/${worn.id}`);
  await expect(detail(page, 'New')).toHaveText('Used');
  await expect(detail(page, 'New').locator('.badge')).toHaveClass(usedBadge);

  // Editing stays a plain checked/unchecked switch, never a badge.
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.mouse.move(600, 400);
  await expect(page.getByRole('checkbox', { name: 'New', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'New', exact: true }).check();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, 'New')).toHaveText('New');
});

test('the badges are localized and readable in both color modes', async ({ page, request }) => {
  const { fresh, worn } = await newAndUsedItems(request);
  await page.addInitScript(() => { if (!localStorage.getItem('inventory-atlas.locale')) localStorage.setItem('inventory-atlas.locale', 'uk'); });

  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('inventory-atlas-theme', value), theme);
    for (const [item, label] of [[fresh, 'Новий'], [worn, 'Вживаний']]) {
      await page.goto(`/items/${item.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-bs-theme', theme);
      const badge = detail(page, 'Новий').locator('.badge');
      await expect(badge).toHaveText(label);
      expect(await contrastOf(badge), `${label} in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('item cards show the same badge when the New column is visible', async ({ page, request }) => {
    const { token } = await newAndUsedItems(request);

    await page.goto('/items');
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('checkbox', { name: 'New', exact: true }).check();
    await page.getByRole('button', { name: 'Columns' }).click();
    await searchBox(page).fill(token);

    const card = suffix => page.getByRole('listitem').filter({ hasText: `${token} ${suffix}` });
    await expect(card('fresh').getByText('New', { exact: true })).toHaveClass(newBadge);
    await expect(card('worn').getByText('Used', { exact: true })).toHaveClass(usedBadge);
    await expect(card('worn')).not.toContainText('New:');
  });
});
