import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const searchBox = page => page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…');

// Two categories that each define a text field of the same unique name, so it becomes one column.
async function mergedFieldCategories(request) {
  const fieldName = unique('Maker');
  const categories = [];
  for (const prefix of ['Cameras', 'Amplifiers']) {
    const category = await createCategory(request, unique(prefix));
    const response = await request.post(`/api/categories/${category.id}/fields`, { data: { name: fieldName, type: 'text' } });
    expect(response.ok()).toBeTruthy();
    categories.push({ ...category, fieldId: (await response.json()).id });
  }
  return { fieldName, categories };
}

test('the Columns control shows, hides, keeps, and resets item columns', async ({ page, request }) => {
  const { fieldName, categories: [cameras, amplifiers] } = await mergedFieldCategories(request);
  const token = unique('Columned');
  await createItem(request, { name: `${token} camera`, category_id: cameras.id, serial_number: 'SN-CAM', field_values: { [cameras.fieldId]: 'Leica' } });
  await createItem(request, { name: `${token} amplifier`, category_id: amplifiers.id, field_values: { [amplifiers.fieldId]: 'Marantz' } });

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await searchBox(page).fill(token);
  const table = page.getByRole('table');
  await expect(table.getByRole('link', { name: `${token} camera`, exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Serial Number' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Columns' }).click();
  const picker = page.getByRole('group', { name: 'Visible columns' });
  await expect(picker.getByRole('checkbox', { name: 'Name' })).toBeChecked();
  await expect(picker.getByRole('checkbox', { name: 'Name' })).toBeDisabled();
  await picker.getByRole('checkbox', { name: 'Serial Number' }).check();
  await picker.getByRole('checkbox', { name: 'Condition' }).uncheck();
  await picker.getByRole('checkbox', { name: fieldName }).check();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  // One merged column carries the values of both categories.
  await expect(table.getByRole('columnheader', { name: 'Serial Number' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Condition' })).toHaveCount(0);
  await expect(table.getByRole('columnheader', { name: fieldName })).toHaveCount(1);
  await expect(table.getByRole('row').filter({ hasText: `${token} camera` })).toContainText('Leica');
  await expect(table.getByRole('row').filter({ hasText: `${token} camera` })).toContainText('SN-CAM');
  await expect(table.getByRole('row').filter({ hasText: `${token} amplifier` })).toContainText('Marantz');

  // The choice is a preference of this browser and survives a reload.
  await page.reload();
  await page.mouse.move(600, 400);
  await searchBox(page).fill(token);
  await expect(table.getByRole('row').filter({ hasText: `${token} amplifier` })).toContainText('Marantz');
  await expect(table.getByRole('columnheader', { name: 'Serial Number' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Condition' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(table.getByRole('columnheader', { name: 'Condition' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Serial Number' })).toHaveCount(0);
  await expect(table.getByRole('columnheader', { name: fieldName })).toHaveCount(0);
});

test('column headers sort the whole filtered list on the server, across pages', async ({ page, request }) => {
  const { fieldName, categories: [cameras, amplifiers] } = await mergedFieldCategories(request);
  const token = unique('Sorted');
  // Thirteen items: one more than a page. The maker order runs against the name order.
  for (let index = 0; index < 13; index++) {
    const category = index % 2 ? amplifiers : cameras;
    await createItem(request, {
      name: `${token} ${String(index).padStart(2, '0')}`,
      category_id: category.id,
      field_values: { [category.fieldId]: `Maker ${String.fromCharCode(90 - index)}` }
    });
  }

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('checkbox', { name: fieldName }).check();
  await page.keyboard.press('Escape');
  await searchBox(page).fill(token);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();

  const table = page.getByRole('table');
  const nameHeader = table.getByRole('columnheader', { name: 'Name' });
  const makerHeader = table.getByRole('columnheader', { name: fieldName });
  await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.getByRole('columnheader', { name: 'Photo' })).not.toHaveAttribute('aria-sort');
  await expect(table.getByRole('row').nth(1)).toContainText(`${token} 00`);

  await nameHeader.getByRole('button').click();
  await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(table.getByRole('row').nth(1)).toContainText(`${token} 12`);

  // A new column starts ascending and the list goes back to its first page.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await makerHeader.getByRole('button').click();
  await expect(makerHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(table.getByRole('row').nth(1)).toContainText('Maker N');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText('Maker Z');

  await makerHeader.getByRole('button').click();
  await expect(makerHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(table.getByRole('row').nth(1)).toContainText('Maker Z');

  // The category filter keeps the sort and narrows the list to one page.
  await page.getByLabel('Category').selectOption({ label: amplifiers.name });
  await expect(page.getByText('Page 1 of 2')).toBeHidden();
  await expect(table.getByRole('row')).toHaveCount(7);
  await expect(table.getByRole('row').nth(1)).toContainText('Maker Y');

  // Search finds an item by a custom value even when its column is hidden.
  await page.getByLabel('Category').selectOption({ label: 'All categories' });
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('checkbox', { name: fieldName }).uncheck();
  await page.keyboard.press('Escape');
  await searchBox(page).fill('Maker Q');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText(`${token} 09`);
});

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('cards show the chosen columns as labeled lines and sort with the compact control', async ({ page, request }) => {
    const { fieldName, categories: [cameras, amplifiers] } = await mergedFieldCategories(request);
    const token = unique('Carded');
    await createItem(request, { name: `${token} A`, category_id: cameras.id, serial_number: 'SN-1', field_values: { [cameras.fieldId]: 'Zeiss' } });
    await createItem(request, { name: `${token} B`, category_id: amplifiers.id, field_values: { [amplifiers.fieldId]: 'Accuphase' } });

    await page.goto('/items');
    await searchBox(page).fill(token);
    const cards = page.getByRole('listitem').filter({ hasText: token });
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText(cameras.name);
    await expect(cards.first()).not.toContainText('Serial Number');

    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('checkbox', { name: 'Serial Number' }).check();
    await page.getByRole('checkbox', { name: 'Category' }).uncheck();
    await page.getByRole('checkbox', { name: fieldName }).check();
    await page.getByRole('button', { name: 'Columns' }).click();

    await expect(cards.first()).toContainText('Serial Number: SN-1');
    await expect(cards.first()).toContainText(`${fieldName}: Zeiss`);
    await expect(cards.first()).not.toContainText(cameras.name);
    await expect(cards.nth(1)).toContainText(`${fieldName}: Accuphase`);

    // The compact control offers the visible sortable columns and flips the direction.
    const sort = page.getByLabel('Sort', { exact: true });
    await expect(sort.getByRole('option', { name: 'Category' })).toHaveCount(0);
    await sort.selectOption({ label: fieldName });
    await expect(cards.first()).toContainText(`${token} B`);
    await page.getByRole('button', { name: 'Ascending order' }).click();
    await expect(page.getByRole('button', { name: 'Descending order' })).toBeVisible();
    await expect(cards.first()).toContainText(`${token} A`);
  });
});
