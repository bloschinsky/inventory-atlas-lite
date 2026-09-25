import { expect, test } from '@playwright/test';
import { createCategory, setAiEnabled, unique } from './helpers.js';

test.beforeEach(async ({ request }) => { await setAiEnabled(request, true); });

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
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type, { ignoreCase: true });
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
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type, { ignoreCase: true });
  }
  await expect(entry).toContainText('0 items · 4 fields');
});

test('insert template fills the batch editor with the canonical example and protects existing JSON', async ({ page, request }) => {
  const categoryName = unique('Template Cards');
  await createCategory(request, categoryName);
  await page.goto('/categories');
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);

  const entry = page.getByRole('button').filter({ hasText: categoryName });
  await entry.click();
  await page.getByRole('button', { name: 'Batch Add Fields' }).click();

  const dialog = page.getByRole('dialog');
  const editor = dialog.getByLabel('Field definition JSON');
  const insert = dialog.getByRole('button', { name: 'Insert Template' });
  await expect(insert).toBeVisible();

  // An empty editor is filled without a confirmation, and the inserted document is editable.
  await insert.click();
  await expect(editor).toBeFocused();
  const template = await editor.inputValue();
  expect(JSON.parse(template)).toEqual({
    version: 1,
    fields: [
      { name: 'Brand', type: 'text', required: false },
      { name: 'Model', type: 'text', required: false },
      { name: 'Release Year', type: 'number', required: false }
    ]
  });

  // The inserted document passes the existing preview parser unchanged.
  await dialog.getByRole('button', { name: 'Preview' }).click();
  const row = index => dialog.getByRole('row').nth(index + 1);
  await expect(row(0).getByRole('textbox')).toHaveValue('Brand');
  await expect(row(2)).toContainText('New');
  await expect(dialog.getByRole('button', { name: /^Create \d+ Field/ })).toHaveText('Create 3 Fields');
  await dialog.getByRole('button', { name: 'Edit JSON' }).click();

  // Existing user content is only replaced after an explicit confirmation.
  const own = JSON.stringify({ version: 1, fields: [{ name: 'Bus', type: 'text', required: false }] }, null, 2);
  await editor.fill(own);
  page.once('dialog', confirmation => confirmation.dismiss());
  await insert.click();
  await expect(editor).toHaveValue(own);

  page.once('dialog', confirmation => confirmation.accept());
  await insert.click();
  await expect(editor).toHaveValue(template);

  // AI mode describes the fields in natural language, so the JSON template makes no sense there.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'AI Add Fields' }).click();
  await expect(dialog.getByLabel('Field description')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Insert Template' })).toBeHidden();
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
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AI_PROVIDER_REQUEST_FAILED', params: { provider: 'OpenAI', status: 503 } } }) });
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
  await expect(dialog.getByRole('alert')).toHaveText('OpenAI could not complete the request (HTTP 503). Try again later.');
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
    await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(type, { ignoreCase: true });
  }
  await expect(entry).toContainText('0 items · 3 fields');
  expect(descriptions).toEqual([prompt, prompt]);
});
