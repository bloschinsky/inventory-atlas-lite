import { expect, test } from './fixtures.js';
import { createCategory, createItem, detail, unique } from './helpers.js';

const searchBox = page => page.getByPlaceholder('Search name, description, serial number, transferred to, specific location or text fields…');
const newBadge = /bg-success-subtle text-success-emphasis/;
const usedBadge = /bg-secondary-subtle text-secondary-emphasis/;

// A new item and a used one, so every view shows both badges.
async function newAndUsedItems(request) {
  const category = await createCategory(request, unique('Lenses'));
  const token = unique('Badged');
  const fresh = await createItem(request, { name: `${token} fresh`, category_id: category.id, is_new: true });
  const worn = await createItem(request, { name: `${token} worn`, category_id: category.id, is_new: false });
  return { token, fresh, worn };
}

// WCAG contrast ratio between the badge text and the background it is seen on, as the browser resolved
// them: a translucent background (Tabler's -lt colors) is blended over the nearest opaque ancestor.
const contrastOf = badge => badge.evaluate(element => {
  // rgb() reports 0..255 channels; color-mix() resolves to color(srgb …) with 0..1 channels.
  const parse = color => {
    const values = color.replace(/^color\(srgb/, '').match(/[\d.]+/g).map(Number);
    const scale = color.startsWith('color(') ? 255 : 1;
    return { rgb: values.slice(0, 3).map(value => value * scale), alpha: values[3] ?? 1 };
  };
  const blend = (top, bottom) => top.rgb.map((value, i) => value * top.alpha + bottom[i] * (1 - top.alpha));
  const backdrop = node => {
    if (!node) return [255, 255, 255];
    const own = parse(getComputedStyle(node).backgroundColor);
    return own.alpha === 1 ? own.rgb : blend(own, backdrop(node.parentElement));
  };
  const luminance = rgb => {
    const [r, g, b] = rgb.map(value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const background = backdrop(element);
  const text = blend(parse(getComputedStyle(element).color), background);
  const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
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
  await expect(detail(page, 'New / Used')).toHaveText('New');
  await expect(detail(page, 'New / Used').locator('.badge')).toHaveClass(newBadge);

  await page.goto(`/items/${worn.id}`);
  await expect(detail(page, 'New / Used')).toHaveText('Used');
  await expect(detail(page, 'New / Used').locator('.badge')).toHaveClass(usedBadge);

  // Editing stays a plain checked/unchecked switch, never a badge.
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.mouse.move(600, 400);
  await expect(page.getByRole('checkbox', { name: 'New', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'New', exact: true }).check();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, 'New / Used')).toHaveText('New');
});

// A used, Excellent item with two-line notes and a new item with no grade or notes.
async function gradedAndPlainItems(request) {
  const category = await createCategory(request, unique('Optics'));
  const graded = await createItem(request, {
    name: unique('Graded'), category_id: category.id, is_new: false,
    condition_grade: 'excellent', condition_notes: 'Light scuff on the hood\nCaps included'
  });
  const plain = await createItem(request, { name: unique('Plain'), category_id: category.id, is_new: true });
  return { graded, plain };
}

const detailsTerms = page => page.locator('.card')
  .filter({ has: page.getByRole('heading', { name: 'Details', exact: true }) }).locator('dt');

test('the Details card labels Inventory, New / Used, and Condition apart', async ({ page, request }) => {
  const { graded, plain } = await gradedAndPlainItems(request);

  await page.goto(`/items/${graded.id}`);
  await expect(detail(page, 'Condition Notes')).toBeVisible();
  expect((await detailsTerms(page).allInnerTexts()).slice(0, 4)).toEqual(['Inventory', 'New / Used', 'Condition', 'Condition Notes']);
  await expect(page.locator('dt:text-is("New")')).toHaveCount(0);
  await expect(detail(page, 'Inventory')).toHaveText('Active');
  await expect(detail(page, 'Inventory').locator('.badge')).toHaveClass(/bg-primary-subtle text-primary-emphasis/);
  await expect(detail(page, 'New / Used')).toHaveText('Used');
  await expect(detail(page, 'New / Used').locator('.badge')).toHaveClass(usedBadge);
  await expect(detail(page, 'Condition')).toHaveText('Excellent');
  await expect(detail(page, 'Condition').locator('.badge')).toHaveClass(/condition-badge-green/);
  // The notes keep their own line break, directly below Condition.
  expect((await detail(page, 'Condition Notes').innerText()).trim()).toBe('Light scuff on the hood\nCaps included');

  await page.goto(`/items/${plain.id}`);
  await expect(detail(page, 'New / Used')).toHaveText('New');
  await expect(detail(page, 'New / Used').locator('.badge')).toHaveClass(newBadge);
  await expect(detail(page, 'Condition')).toHaveText('Not set');
  await expect(detail(page, 'Condition').locator('.badge')).toHaveClass(/condition-badge-unset/);
  await expect(page.locator('dt:text-is("Condition Notes")')).toHaveCount(0);
});

test('the badges are localized and readable in both color modes', async ({ page, request }) => {
  const { fresh, worn } = await newAndUsedItems(request);
  const retired = await createItem(request, { name: unique('Retired'), category_id: fresh.category_id });
  const response = await request.patch(`/api/items/${retired.id}/lifecycle`, { data: { status: 'retired', reason: 'sold' } });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => { if (!localStorage.getItem('inventory-atlas.locale')) localStorage.setItem('inventory-atlas.locale', 'uk'); });

  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('inventory-atlas-theme', value), theme);
    for (const [item, label, inventory] of [[fresh, 'Новий', 'Активний'], [worn, 'Вживаний', 'Активний'], [retired, 'Вживаний', 'Списаний']]) {
      await page.goto(`/items/${item.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-bs-theme', theme);
      for (const [term, text] of [['Новий / Вживаний', label], ['Інвентар', inventory]]) {
        const badge = detail(page, term).locator('.badge');
        await expect(badge).toHaveText(text);
        expect(await contrastOf(badge), `${text} in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
      }
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

  test('the Details labels stack above their badges without overflowing', async ({ page, request }) => {
    const { graded } = await gradedAndPlainItems(request);

    await page.goto(`/items/${graded.id}`);
    const term = page.locator('dt:text-is("New / Used")');
    await expect(detail(page, 'New / Used')).toHaveText('Used');
    const [termBox, valueBox] = [await term.boundingBox(), await detail(page, 'New / Used').boundingBox()];
    expect(valueBox.y).toBeGreaterThanOrEqual(termBox.y + termBox.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
