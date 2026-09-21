import { expect, test } from '@playwright/test';
import { createCategory, unique } from './helpers.js';

test('creates a category and its custom fields', async ({ page }) => {
  const categoryName = unique('Cameras');
  await page.goto('/categories');

  await page.getByPlaceholder('New category name').fill(categoryName);
  await page.getByPlaceholder('New category name').press('Enter');
  const entry = page.getByRole('button').filter({ hasText: categoryName });
  await expect(entry).toContainText('0 items · 0 fields');

  await entry.click();
  await expect(page.getByText(`Fields for ${categoryName}`)).toBeVisible();
  await expect(page.getByText('No custom fields.')).toBeVisible();

  for (const [name, type] of [['Brand', 'text'], ['Year', 'number']]) {
    await page.getByPlaceholder('Field name').fill(name);
    await page.getByLabel('Field type').selectOption(type);
    await page.getByPlaceholder('Field name').press('Enter');
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type);
  }

  // The category summary reflects both new fields once the list reloads.
  await expect(entry).toContainText('0 items · 2 fields');
});

test('batch add fields reviews a pasted document before creating the fields', async ({ page, request }) => {
  const categoryName = unique('Expansion Cards');
  await createCategory(request, categoryName, [{ name: 'Brand', type: 'text' }]);
  await page.goto('/categories');
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);

  const entry = page.getByRole('button').filter({ hasText: categoryName });
  await entry.click();
  await page.getByRole('button', { name: 'Batch Add Fields' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Field definition JSON').fill(JSON.stringify({
    version: 1,
    fields: [
      { name: 'Model', type: 'text', required: false },
      { name: 'Brand', type: 'text', required: false },
      { name: 'Bus', type: 'nonsense', required: false },
      { name: 'Release Year', type: 'number', required: false }
    ]
  }));
  await dialog.getByRole('button', { name: 'Preview' }).click();

  // Proposed names live in editable inputs, so the rows are checked in document order.
  const row = index => dialog.getByRole('row').nth(index + 1);
  await expect(row(0).getByRole('textbox')).toHaveValue('Model');
  await expect(row(0)).toContainText('New');
  await expect(row(1)).toContainText('Already exists');
  await expect(row(2)).toContainText('Invalid type');
  await expect(row(3)).toContainText('New');

  // Nothing can be created while a blocking row is still part of the batch.
  const create = dialog.getByRole('button', { name: /^Create \d+ Field/ });
  await expect(create).toBeDisabled();

  // The already existing field is dropped and the unsupported type is corrected in place.
  await dialog.getByRole('button', { name: 'Remove proposed field 2 from the batch' }).click();
  await dialog.getByLabel('Type of proposed field 2').selectOption('text');
  await expect(create).toHaveText('Create 3 Fields');
  await create.click();

  await expect(dialog).toBeHidden();
  for (const [name, type] of [['Model', 'text'], ['Bus', 'text'], ['Release Year', 'number']]) {
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type);
  }
  await expect(entry).toContainText('0 items · 4 fields');
});
