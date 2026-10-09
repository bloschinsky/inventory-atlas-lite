import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

// Every Color field of this spec has the same name, so the Items view merges them into one column.
const FIELD = 'Color';
const color = (key, hex) => ({ key, hex });
const phone = { width: 390, height: 844 };

async function colorCategory(request) {
  const name = unique('Paints');
  const category = await createCategory(request, name, [{ name: FIELD, type: 'color' }]);
  const [field] = await (await request.get(`/api/categories/${category.id}/fields`)).json();
  return { ...category, name, fieldId: field.id };
}

test('a Color field is created in Categories and filled with presets, a custom HEX, and Clear', async ({ page, request }) => {
  const categoryName = unique('Fabrics');
  await createCategory(request, categoryName);
  await page.goto('/categories');
  await page.mouse.move(600, 400);
  await page.getByRole('button').filter({ hasText: categoryName }).click();
  await page.getByPlaceholder('Field name').fill(FIELD);
  await page.getByLabel('Field type').selectOption({ label: 'Color' });
  await page.getByPlaceholder('Field name').press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: FIELD })).toContainText('Color');

  const itemName = unique('Scarf');
  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  const group = page.getByRole('radiogroup', { name: FIELD });
  // The picker is the radio group with its preview and Clear below it.
  const picker = group.locator('..');
  await expect(group.getByRole('radio')).toHaveCount(13);
  // Nothing is chosen until the user picks a color.
  for (const radio of await group.getByRole('radio').all()) await expect(radio).not.toBeChecked();
  await expect(picker.getByText('Not set', { exact: true })).toBeVisible();

  // The arrow keys move through the swatches like any radio group.
  await group.getByText('Black', { exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'White' })).toBeChecked();
  await expect(group.getByRole('radio', { name: 'White' })).toBeFocused();
  await group.getByText('Brown', { exact: true }).click();
  await expect(page.getByText('Selected: Brown #795548')).toBeVisible();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  await expect(detail(page, FIELD)).toHaveText(/Brown\s+#795548/);
  await expect(detail(page, FIELD)).not.toContainText('{');

  // Custom: opening it alone chooses nothing; a typed HEX is the color.
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await expect(group.getByRole('radio', { name: 'Brown' })).toBeChecked();
  await group.getByText('Custom', { exact: true }).click();
  await expect(page.getByText('Pick a color or type its HEX code.')).toBeVisible();
  const hex = page.getByLabel('Custom color HEX code');
  await hex.fill('#12');
  await expect(hex).toHaveClass(/is-invalid/);
  await hex.fill('#a08c75');
  await expect(page.getByText('Selected: Custom #A08C75')).toBeVisible();
  await expect(page.getByLabel('Pick a custom color')).toHaveValue('#a08c75');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, FIELD)).toHaveText(/Custom\s+#A08C75/);

  // Clear saves the field as not set.
  await page.getByRole('link', { name: 'Edit' }).first().click();
  await expect(page.getByLabel('Custom color HEX code')).toHaveValue('#A08C75');
  await page.getByRole('button', { name: 'Clear' }).click();
  for (const radio of await group.getByRole('radio').all()) await expect(radio).not.toBeChecked();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, FIELD)).toHaveText('—');
});

test('the Items list shows, sorts, and filters a Color column on the server', async ({ page, request }) => {
  // Three categories share the merged Color column; few items each keeps the shared database's
  // category counts small for the Dashboard spec.
  const [first, second, third] = [await colorCategory(request), await colorCategory(request), await colorCategory(request)];
  const token = unique('Tinted');
  const add = (category, suffix, value) => createItem(request, {
    name: `${token} ${suffix}`, category_id: category.id, field_values: value ? { [category.fieldId]: value } : {}
  });
  await add(first, 'pink', color('pink', '#E886B2'));
  await add(first, 'tan', color('custom', '#A08C75'));
  await add(second, 'blank');
  await add(second, 'black', color('black', '#171717'));
  await add(third, 'brownish', color('custom', '#795548'));

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByLabel('Search', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('group', { name: 'Visible columns' }).getByRole('checkbox', { name: FIELD }).check();
  await page.keyboard.press('Escape');

  const table = page.getByRole('table');
  const header = table.getByRole('columnheader', { name: FIELD });
  await expect(table.getByRole('row').filter({ hasText: `${token} pink` })).toContainText('Pink');
  await expect(table.getByRole('row').filter({ hasText: `${token} tan` })).toContainText('Custom');
  await expect(table).not.toContainText('"hex"');

  const names = () => table.getByRole('row').locator('td.name-cell a');
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(names()).toHaveText([`${token} black`, `${token} pink`, `${token} brownish`, `${token} tan`, `${token} blank`]);
  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(names()).toHaveText([`${token} tan`, `${token} brownish`, `${token} pink`, `${token} black`, `${token} blank`]);

  // Custom is one group, whatever the HEX; Not set lists the items without a color.
  const filter = page.getByLabel(FIELD, { exact: true });
  await filter.selectOption({ label: 'Custom' });
  await expect(names()).toHaveText([`${token} tan`, `${token} brownish`]);
  await expect(page.getByText('2 items')).toBeVisible();
  await filter.selectOption({ label: 'Not set' });
  await expect(names()).toHaveText([`${token} blank`]);
  await filter.selectOption({ label: 'Pink' });
  await expect(names()).toHaveText([`${token} pink`]);
  await filter.selectOption({ label: 'All colors' });
  await expect(names()).toHaveCount(5);
});

test('a template keeps a color default and passes it to the new item', async ({ page, request }) => {
  const paints = await colorCategory(request);
  const templateName = unique('Green tin');
  await page.goto('/templates/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Template name *').fill(templateName);
  await page.getByLabel('Category *').selectOption({ label: paints.name });
  await page.getByRole('radiogroup', { name: FIELD }).getByText('Green', { exact: true }).click();
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page).toHaveURL('/templates');

  await page.getByRole('link', { name: `Use ${templateName}` }).click();
  await expect(page).toHaveURL(/\/items\/new\?template=\d+$/);
  await expect(page.getByRole('radiogroup', { name: FIELD }).getByRole('radio', { name: 'Green' })).toBeChecked();
  await expect(page.getByText('Selected: Green #2E9958')).toBeVisible();
});

test('swatches keep a visible outline and the checkmark in both color modes', async ({ page, request }) => {
  const paints = await colorCategory(request);
  const item = await createItem(request, { name: unique('Outlined'), category_id: paints.id, field_values: { [paints.fieldId]: color('white', '#FFFFFF') } });
  await page.goto(`/items/${item.id}/edit`);
  await page.mouse.move(600, 400);
  const group = page.getByRole('radiogroup', { name: FIELD });
  const swatch = name => group.locator('label').filter({ hasText: name }).locator('.color-option-swatch');
  for (const scheme of ['light', 'dark']) {
    await page.evaluate(mode => document.documentElement.setAttribute('data-bs-theme', mode), scheme);
    for (const name of ['White', 'Black']) {
      expect(await swatch(name).evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
    }
    // The selection is a checkmark, never the color alone.
    await expect(swatch('White').locator('svg')).toBeVisible();
    await expect(swatch('Black').locator('svg')).toHaveCount(0);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: phone });

  test('the picker fits the screen and the item cards show the color', async ({ page, request }) => {
    const paints = await colorCategory(request);
    const item = await createItem(request, { name: unique('Phone tin'), category_id: paints.id, field_values: { [paints.fieldId]: color('blue', '#2878D0') } });
    await page.goto(`/items/${item.id}/edit`);
    const group = page.getByRole('radiogroup', { name: FIELD });
    await expect(group.getByRole('radio', { name: 'Blue' })).toBeChecked();
    await group.getByText('Custom', { exact: true }).click();
    await expect(page.getByLabel('Custom color HEX code')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone.width);

    await page.goto('/items');
    await page.getByLabel('Search', { exact: true }).fill(item.name);
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('group', { name: 'Visible columns' }).getByRole('checkbox', { name: FIELD }).check();
    await page.keyboard.press('Escape');
    await expect(page.locator('.item-card').filter({ hasText: item.name })).toContainText(`${FIELD}: Blue`);
  });
});
