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

test('AI add fields reviews the generated draft in the batch editor before creating the fields', async ({ page, request }) => {
  const categoryName = unique('AI Expansion Cards');
  const category = await createCategory(request, categoryName, [{ name: 'Brand', type: 'text' }]);
  const prompt = 'Suggest useful fields for vintage computer expansion cards.';
  const descriptions = [];
  let generateCalls = 0;

  await page.route(`**/api/categories/${category.id}/fields/ai`, async route => {
    generateCalls += 1;
    descriptions.push(JSON.parse(route.request().postData()).description);
    if (generateCalls === 1) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'OpenAI is unavailable. Try again later.' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        fields: [
          { name: 'Bus', type: 'text', required: false },
          { name: 'Brand', type: 'text', required: false },
          { name: 'Release Year', type: 'number', required: false }
        ]
      })
    });
  });

  await page.goto('/categories');
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);
  const entry = page.getByRole('button').filter({ hasText: categoryName });
  await entry.click();
  await page.getByRole('button', { name: 'AI Add Fields' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Field description').fill(prompt);
  await dialog.getByRole('button', { name: 'Generate Fields' }).click();

  // A failed call reports the reason and keeps the prompt, so it can be retried unchanged.
  await expect(dialog.getByRole('alert')).toContainText('OpenAI is unavailable.');
  await expect(dialog.getByLabel('Field description')).toHaveValue(prompt);
  await dialog.getByRole('button', { name: 'Generate Fields' }).click();

  // The generated fields land in the Phase 1 review, with the same statuses as a pasted document.
  const row = index => dialog.getByRole('row').nth(index + 1);
  await expect(row(0).getByRole('textbox')).toHaveValue('Bus');
  await expect(row(1)).toContainText('Already exists');
  const create = dialog.getByRole('button', { name: /^Create \d+ Field/ });
  await expect(create).toBeDisabled();

  await dialog.getByRole('button', { name: 'Remove proposed field 2 from the batch' }).click();
  await dialog.getByLabel('Name of proposed field 2').fill('Released');
  await expect(create).toHaveText('Create 2 Fields');

  // Nothing is saved before the explicit confirmation.
  expect((await (await request.get(`/api/categories/${category.id}/fields`)).json()).length).toBe(1);
  await create.click();

  await expect(dialog).toBeHidden();
  for (const [name, type] of [['Bus', 'text'], ['Released', 'number']]) {
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type);
  }
  await expect(entry).toContainText('0 items · 3 fields');
  expect(descriptions).toEqual([prompt, prompt]);
});
