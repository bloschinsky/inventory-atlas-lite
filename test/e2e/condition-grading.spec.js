import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const GRADES = [
  { key: 'excellent', label: 'Excellent', badge: /\bcondition-badge-green\b/ },
  { key: 'good', label: 'Good', badge: /\bcondition-badge-blue\b/ },
  { key: 'fair', label: 'Fair', badge: /\bcondition-badge-yellow\b/ },
  { key: 'poor', label: 'Poor', badge: /\bcondition-badge-orange\b/ },
  { key: 'broken', label: 'Broken', badge: /\bcondition-badge-red\b/ }
];

/*
  WCAG contrast of every badge's text against its tinted background as painted over the surface
  behind it. Each color is resolved by painting it on a canvas, so color-mix() and light-dark() count
  exactly as the browser draws them.
*/
const badgeContrasts = page => page.locator('dl .badge').evaluateAll(badges => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const paint = (...colors) => {
    context.clearRect(0, 0, 1, 1);
    for (const color of colors) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    }
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const luminance = rgb => {
    const [r, g, b] = rgb.map(value => value / 255).map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return badges.map(badge => {
    const surface = getComputedStyle(badge.closest('.modal-content')).backgroundColor;
    const style = getComputedStyle(badge);
    const [light, dark] = [luminance(paint(surface, style.backgroundColor)), luminance(paint(surface, style.color))].sort((a, b) => b - a);
    return { label: badge.textContent.trim(), ratio: (light + 0.05) / (dark + 0.05) };
  });
});
const phone = { width: 390, height: 844 };

const helpDialog = page => page.getByRole('dialog', { name: 'Condition grading' });

// Every grade with its badge and definition, best first, and the Condition Notes hint below them.
async function expectHelpContent(dialog) {
  const badges = dialog.locator('dt .badge');
  await expect(badges).toHaveText(GRADES.map(grade => grade.label));
  for (const [index, grade] of GRADES.entries()) await expect(badges.nth(index)).toHaveClass(grade.badge);
  await expect(dialog.locator('dd').first()).toHaveText(
    'The item works correctly. The item has no significant damage. It can have very small signs of use.'
  );
  await expect(dialog.locator('dd').last()).toHaveText('The item does not work correctly. Repair or replacement is necessary.');
  await expect(dialog.getByText('Use Condition Notes for details that are not described by the grade.')).toBeVisible();
}

test('the info button beside Condition opens the grading help, which closes and returns the focus', async ({ page }) => {
  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  const help = page.getByRole('button', { name: 'Condition grading help' });
  await help.click();
  const dialog = helpDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close Condition grading' })).toBeFocused();
  await expectHelpContent(dialog);

  // The close button, Escape, and the backdrop all close it, and the focus goes back to the info button.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
  await help.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
  await help.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  // Every badge label stays readable in both color modes.
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(mode => document.documentElement.setAttribute('data-bs-theme', mode), scheme);
    await help.click();
    for (const { label, ratio } of await badgeContrasts(helpDialog(page))) {
      expect(ratio, `${label} badge contrast in ${scheme} mode`).toBeGreaterThanOrEqual(4.5);
    }
    await page.keyboard.press('Escape');
  }

  // The selector offers Not set and the five grades; the chosen one is shown as its badge.
  const select = page.getByLabel('Condition', { exact: true });
  await expect(select.locator('option')).toHaveText(['Not set', ...GRADES.map(grade => grade.label)]);
  await select.selectOption('broken');
  await expect(page.locator('.input-group-text .badge')).toHaveText('Broken');
  await expect(page.locator('.input-group-text .badge')).toHaveClass(/\bcondition-badge-red\b/);
});

test('the Items table shows Condition badges, sorts them by rank, and filters by grade', async ({ page, request }) => {
  const category = await createCategory(request, unique('Graded'));
  const token = unique('graded');
  const names = {};
  const created = [];
  for (const grade of [...GRADES.map(entry => entry.key), null]) {
    names[grade] = `${token} ${grade || 'unset'}`;
    created.push(await createItem(request, {
      name: names[grade], category_id: category.id, condition_grade: grade, condition_notes: grade ? null : 'Excellent box'
    }));
  }

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category', { exact: true }).selectOption(String(category.id));
  const table = page.getByRole('table');
  const row = name => table.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
  for (const grade of GRADES) {
    await expect(row(names[grade.key]).locator('.badge')).toHaveText(grade.label);
    await expect(row(names[grade.key]).locator('.badge')).toHaveClass(grade.badge);
  }
  // An unset grade is neutral and never looks like Broken; its notes never become a grade.
  await expect(row(names.null).locator('.badge')).toHaveText('Not set');
  await expect(row(names.null).locator('.badge')).toHaveClass(/\bcondition-badge-unset\b/);
  await expect(table.getByRole('columnheader', { name: 'Condition Notes' })).toHaveCount(0);

  // The rank orders the grades, not their labels, and Not set stays last.
  const nameLinks = table.locator('tbody .name-cell a');
  await table.getByRole('button', { name: 'Condition', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'Condition', exact: true })).toHaveAttribute('aria-sort', 'ascending');
  await expect(nameLinks).toHaveText(['broken', 'poor', 'fair', 'good', 'excellent', 'unset'].map(key => `${token} ${key}`));
  await table.getByRole('button', { name: 'Condition', exact: true }).click();
  await expect(nameLinks).toHaveText(['excellent', 'good', 'fair', 'poor', 'broken', 'unset'].map(key => `${token} ${key}`));

  // The Condition filter takes one grade or Not set.
  await page.getByLabel('Condition', { exact: true }).selectOption({ label: 'Fair' });
  await expect(nameLinks).toHaveText([names.fair]);
  await page.getByLabel('Condition', { exact: true }).selectOption({ label: 'Not set' });
  await expect(nameLinks).toHaveText([names.null]);

  // Condition Notes is a column of its own, offered in the Columns menu.
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('group', { name: 'Visible columns' }).getByRole('checkbox', { name: 'Condition Notes' }).check();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('columnheader', { name: 'Condition Notes' })).toBeVisible();
  await expect(row(names.null)).toContainText('Excellent box');

  await row(names.null).getByRole('link', { name: names.null, exact: true }).click();
  await expect(detail(page, 'Condition')).toHaveText('Not set');
  await expect(detail(page, 'Condition Notes')).toHaveText('Excellent box');

  // The suite shares one database: removing this category and its items keeps the Dashboard
  // category ranking that later specs rely on unchanged.
  for (const item of created) expect((await request.delete(`/api/items/${item.id}`)).ok()).toBeTruthy();
  expect((await request.delete(`/api/categories/${category.id}`)).ok()).toBeTruthy();
});

test.describe('narrow screens', () => {
  test.use({ viewport: phone });

  test('the grading help fits a phone and the item cards show the Condition badge', async ({ page, request }) => {
    const category = await createCategory(request, unique('Phone graded'));
    const itemName = unique('Phone torch');
    await createItem(request, { name: itemName, category_id: category.id, condition_grade: 'fair' });

    await page.goto('/items');
    await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(itemName);
    const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: itemName, exact: true }) });
    await expect(card.locator('.badge', { hasText: 'Fair' })).toHaveClass(/\bcondition-badge-yellow\b/);

    await page.goto('/items/new');
    await page.getByRole('button', { name: 'Condition grading help' }).click();
    const dialog = helpDialog(page);
    await expect(dialog).toBeVisible();
    await expectHelpContent(dialog);
    // The body scrolls inside the dialog when needed; the page itself never scrolls sideways.
    await expect(dialog.locator('.modal-body')).toHaveCSS('overflow-y', 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone.width);
    await dialog.getByRole('button', { name: 'Close', exact: true }).scrollIntoViewIfNeeded();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});
