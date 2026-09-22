import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createCategory, detail, setAiEnabled, unique } from './helpers.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');

// The AI entry points and the /items/ai route only exist while AI features are enabled.
test.beforeEach(async ({ request }) => { await setAiEnabled(request, true); });

test('uses AI suggestions in the normal editable Add Item form and saves only after confirmation', async ({ page, request }) => {
  const categoryName = unique('AI Cameras');
  const category = await createCategory(request, categoryName, [
    { name: 'Brand', type: 'text' },
    { name: 'Insured', type: 'boolean' }
  ]);
  const fields = await (await request.get(`/api/categories/${category.id}/fields`)).json();
  const brand = fields.find(field => field.name === 'Brand');
  const insured = fields.find(field => field.name === 'Insured');
  const suggestedName = unique('AI Rangefinder');
  let analyzeCalls = 0;
  let backgroundCalls = 0;

  await page.route('**/api/ai/items/analyze', async route => {
    analyzeCalls += 1;
    const requestBody = route.request().postDataBuffer();
    expect(requestBody).toBeTruthy();
    expect(requestBody.toString('latin1')).toContain('filename="sample-photo.png"');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        categoryId: category.id,
        confidence: 0.81,
        needsDetailedImageAnalysis: false,
        baseFields: {
          name: suggestedName,
          description: 'Visible camera body',
          condition: 'Used',
          location: null,
          purchase_date: null,
          purchase_price: null,
          serial_number: 'VISIBLE-123'
        },
        dynamicFields: { [brand.id]: 'Olympus', [insured.id]: '0' },
        warnings: ['Verify the model before saving.']
      })
    });
  });
  await page.route('**/api/images/remove-background', route => {
    backgroundCalls += 1;
    return route.abort();
  });

  await page.goto('/items');
  await page.getByRole('link', { name: 'AI Add Item' }).first().click();
  await page.getByLabel('Item photo (optional)').setInputFiles(fixture);
  await expect(page.getByLabel('Remove background')).not.toBeChecked();
  await page.getByLabel('Item description (optional)').fill('This may be an older rangefinder.');
  await page.getByRole('button', { name: 'Create Draft' }).click();

  await expect(page).toHaveURL('/items/new');
  await expect(page.getByRole('heading', { name: 'Review AI item' })).toBeVisible();
  await expect(page.getByText('AI confidence: 81%.')).toBeVisible();
  await expect(page.getByText('Verify the model before saving.')).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue(suggestedName);
  await expect(page.getByLabel('Category *')).toHaveValue(String(category.id));
  await expect(page.getByLabel('Brand')).toHaveValue('Olympus');
  await expect(page.getByLabel('Insured')).toHaveValue('0');
  await expect(page.getByText('1 photo ready to upload.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'sample-photo.png' })).toBeVisible();
  expect(analyzeCalls).toBe(1);
  expect(backgroundCalls).toBe(0);

  const beforeSave = await request.get(`/api/items?search=${encodeURIComponent(suggestedName)}`);
  expect((await beforeSave.json()).pagination.total).toBe(0);

  await page.getByLabel('Condition').fill('Good');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.getByRole('heading', { name: suggestedName })).toBeVisible();
  await expect(detail(page, 'Condition')).toHaveText('Good');
  await expect(detail(page, 'Brand')).toHaveText('Olympus');
  await expect(page.getByRole('img', { name: 'sample-photo.png' })).toBeVisible();
});

test('uses the original for analysis and the local white-background result as the final photo', async ({ page, request }) => {
  const category = await createCategory(request, unique('AI Processed Photos'));
  const suggestedName = unique('Processed item');
  const processedJpeg = await sharp(fixture).flatten({ background: '#ffffff' }).jpeg().toBuffer();
  let analyzedOriginal = false;
  let processedOriginal = false;

  await page.route('**/api/ai/items/analyze', async route => {
    analyzedOriginal = route.request().postDataBuffer().toString('latin1').includes('filename="sample-photo.png"');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        categoryId: category.id,
        confidence: 0.9,
        baseFields: { name: suggestedName },
        dynamicFields: {},
        warnings: []
      })
    });
  });
  await page.route('**/api/images/remove-background', async route => {
    processedOriginal = route.request().postDataBuffer().toString('latin1').includes('filename="sample-photo.png"');
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: processedJpeg });
  });

  await page.goto('/items/ai');
  // Linux Chromium can begin over the folded-hover sidebar, which intentionally overlays the page.
  await page.mouse.move(600, 400);
  await page.getByLabel('Item photo (optional)').setInputFiles(fixture);
  await page.getByLabel('Remove background').check();
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await expect(page).toHaveURL('/items/new');
  await expect(page.getByRole('img', { name: 'sample-photo-background-removed.jpg' })).toBeVisible();
  expect(analyzedOriginal).toBe(true);
  expect(processedOriginal).toBe(true);

  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.getByRole('img', { name: 'sample-photo-background-removed.jpg' })).toBeVisible();
});

test('keeps the AI draft and original photo when local background removal fails', async ({ page, request }) => {
  const category = await createCategory(request, unique('AI Background Fallback'));
  await page.route('**/api/ai/items/analyze', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      categoryId: category.id,
      confidence: 0.7,
      baseFields: { name: unique('Fallback item') },
      dynamicFields: {},
      warnings: []
    })
  }));
  await page.route('**/api/images/remove-background', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Local processing failed.' })
  }));

  await page.goto('/items/ai');
  // Linux Chromium can begin over the folded-hover sidebar, which intentionally overlays the page.
  await page.mouse.move(600, 400);
  await page.getByLabel('Item photo (optional)').setInputFiles(fixture);
  await page.getByLabel('Remove background').check();
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await expect(page).toHaveURL('/items/new');
  await expect(page.getByRole('alert')).toContainText('Background removal failed. The original photo will be used instead.');
  await expect(page.getByRole('img', { name: 'sample-photo.png' })).toBeVisible();
});

test('keeps the selected image and description after a recoverable draft error', async ({ page }) => {
  await page.route('**/api/ai/items/analyze', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'OpenAI rate limit reached. Try again later.' })
  }));
  await page.goto('/items/ai');
  await page.getByLabel('Item photo (optional)').setInputFiles(fixture);
  await page.getByLabel('Item description (optional)').fill('Keep this hint');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await expect(page.getByRole('alert')).toContainText('rate limit');
  await expect(page.getByLabel('Item description (optional)')).toHaveValue('Keep this hint');
  await expect(page.getByRole('img', { name: 'Selected item preview' })).toBeVisible();
});

test('configures AI while returning only a masked API key state to the browser', async ({ page, request }) => {
  let modelRequests = 0;
  await page.route('**/api/ai/models', route => {
    modelRequests += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ models: [
        { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' }
      ] })
    });
  });
  await page.goto('/settings');
  // Headless Chromium on Linux may initialize its pointer over the folded-hover sidebar.
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Model')).toHaveValue('gpt-5.6-luna');
  await expect(page.getByLabel('Model')).toContainText('GPT-5.6 Terra');
  await page.getByLabel('Enable AI features').check();
  await page.getByLabel('Model').selectOption('custom');
  await expect(page.getByLabel('Custom model ID')).toHaveValue('gpt-5.6-luna');
  await page.getByLabel('Custom model ID').fill('gpt-4o-mini');
  await page.getByLabel('API key', { exact: true }).fill('sk-test-browser-secret');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');
  await expect(page.getByText('Saved key: ••••••••cret.')).toBeVisible();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect.poll(() => modelRequests).toBe(2);

  const settings = await (await request.get('/api/settings/ai')).json();
  expect(settings).toEqual({
    enabled: true,
    provider: 'openai',
    model: 'gpt-4o-mini',
    hasApiKey: true,
    apiKeyMasked: '••••••••cret'
  });
  expect(JSON.stringify(settings)).not.toContain('sk-test-browser-secret');
});

test('creates a reviewable draft from a description alone, without a photo or background removal', async ({ page, request }) => {
  const category = await createCategory(request, unique('AI Prompt Cards'), [{ name: 'Brand', type: 'text' }]);
  const fields = await (await request.get(`/api/categories/${category.id}/fields`)).json();
  const brand = fields.find(field => field.name === 'Brand');
  const suggestedName = unique('AI Prompt Card');
  let sentBody = '';
  let backgroundCalls = 0;

  await page.route('**/api/ai/items/analyze', async route => {
    sentBody = route.request().postDataBuffer().toString('latin1');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        categoryId: category.id,
        confidence: 0.64,
        needsDetailedImageAnalysis: false,
        baseFields: { name: suggestedName, condition: 'Used' },
        dynamicFields: { [brand.id]: 'Creative Labs' },
        warnings: []
      })
    });
  });
  await page.route('**/api/images/remove-background', route => {
    backgroundCalls += 1;
    return route.abort();
  });

  await page.goto('/items/ai');
  // Linux Chromium can begin over the folded-hover sidebar, which intentionally overlays the page.
  await page.mouse.move(600, 400);
  // Without a photo there is nothing to process locally, so the option is not offered.
  await expect(page.getByLabel('Remove background')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create Draft' })).toBeDisabled();

  await page.getByLabel('Item description (optional)').fill('Creative Sound Blaster Audigy LS PCI audio card.');
  await expect(page.getByRole('button', { name: 'Create Draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create Draft' }).click();

  await expect(page).toHaveURL('/items/new');
  await expect(page.getByRole('heading', { name: 'Review AI item' })).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue(suggestedName);
  await expect(page.getByLabel('Brand')).toHaveValue('Creative Labs');
  await expect(page.getByText('photo ready to upload.')).toHaveCount(0);
  expect(sentBody).toContain('Creative Sound Blaster Audigy LS PCI audio card.');
  expect(sentBody).not.toContain('filename="sample-photo.png"');
  expect(backgroundCalls).toBe(0);

  const beforeSave = await request.get(`/api/items?search=${encodeURIComponent(suggestedName)}`);
  expect((await beforeSave.json()).pagination.total).toBe(0);

  await page.getByLabel('Condition').fill('Good');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.getByRole('heading', { name: suggestedName })).toBeVisible();
  await expect(detail(page, 'Condition')).toHaveText('Good');
  await expect(page.getByText('No photos for this item yet.')).toBeVisible();
});

test('offers background removal only once a photo is selected and keeps the description after a failure', async ({ page }) => {
  await page.route('**/api/ai/items/analyze', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'OpenAI rate limit reached. Try again later.' })
  }));

  await page.goto('/items/ai');
  // Linux Chromium can begin over the folded-hover sidebar, which intentionally overlays the page.
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Item photo (optional)')).not.toHaveAttribute('required', /.*/);
  await expect(page.getByLabel('Remove background')).toHaveCount(0);

  await page.getByLabel('Item photo (optional)').setInputFiles(fixture);
  await expect(page.getByLabel('Remove background')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Draft' })).toBeEnabled();

  await page.getByLabel('Item description (optional)').fill('Keep this description');
  await page.getByRole('button', { name: 'Create Draft' }).click();
  await expect(page.getByRole('alert')).toContainText('rate limit');
  await expect(page.getByRole('alert')).not.toContainText('image');
  await expect(page.getByLabel('Item description (optional)')).toHaveValue('Keep this description');
  await expect(page.getByLabel('Remove background')).toBeVisible();
});
