import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

test('suggests existing text field values and still accepts a new one', async ({ page, request }) => {
  const categoryName = unique('Cameras');
  const category = await createCategory(request, categoryName, [{ name: 'Brand', type: 'text' }, { name: 'Year', type: 'number' }]);
  const [brand] = await (await request.get(`/api/categories/${category.id}/fields`)).json();
  for (const value of ['Pentax', 'Pentax', 'Olympus']) {
    await createItem(request, { name: unique('Seed'), category_id: category.id, field_values: { [brand.id]: value } });
  }

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(unique('Rangefinder'));
  await page.getByLabel('Category *').selectOption({ label: categoryName });

  // Focusing the field offers the values already used for it, most used first.
  const brandInput = page.getByLabel('Brand');
  const options = page.getByRole('listbox').getByRole('option');
  await brandInput.click();
  await expect(options).toHaveText(['Pentax', 'Olympus']);

  // Other field types keep their existing controls.
  await expect(page.getByLabel('Year')).toHaveAttribute('type', 'number');

  // Typing filters the suggestions, and the keyboard can pick the highlighted one.
  await brandInput.fill('pe');
  await expect(options).toHaveText(['Pentax']);
  await brandInput.press('ArrowDown');
  await brandInput.press('Enter');
  await expect(brandInput).toHaveValue('Pentax');
  await expect(page.getByRole('listbox')).toBeHidden();

  // A completely new value can still be typed and saved.
  const newBrand = unique('Canon');
  await brandInput.fill(newBrand);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, 'Brand')).toHaveText(newBrand);

  // The value saved a moment ago is suggested for the next item and selectable with the mouse.
  const secondName = unique('Compact');
  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(secondName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Brand').click();
  await page.getByRole('option', { name: newBrand }).click();
  await expect(page.getByLabel('Brand')).toHaveValue(newBrand);
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: secondName })).toBeVisible();
  await expect(detail(page, 'Brand')).toHaveText(newBrand);
});
