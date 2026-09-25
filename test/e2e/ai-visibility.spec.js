import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, setAiEnabled, testApiKey, unique } from './helpers.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');

// The shared test database always holds items from other specs, so the empty state of the Items
// page is the only part of this feature that needs a stubbed list.
const stubEmptyItems = page => page.route(
  url => url.pathname === '/api/items',
  route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [], pagination: { page: 1, pages: 1, total: 0 } })
  })
);

const aiAddItem = page => page.getByRole('link', { name: 'AI Add Item' });
const aiAddFields = page => page.getByRole('button', { name: 'AI Add Fields' });

// Clicking a sidebar link leaves the pointer on the expanded rail, which overlays the form below it.
async function openSettings(page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.mouse.move(600, 400);
}

async function openFields(page, categoryName) {
  await page.goto('/categories');
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);
  await page.getByRole('button').filter({ hasText: categoryName }).click();
}

test('hides every AI action and the AI page while AI features are disabled', async ({ page, request }) => {
  await setAiEnabled(request, false);
  const categoryName = unique('AI Hidden Fields');
  await createCategory(request, categoryName);
  await stubEmptyItems(page);

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('link', { name: 'Add item', exact: true })).toBeVisible();
  await expect(aiAddItem(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add your first item' })).toBeVisible();

  await openFields(page, categoryName);
  // Batch Add Fields is not an AI action and must stay available.
  await expect(page.getByRole('button', { name: 'Batch Add Fields' })).toBeVisible();
  await expect(aiAddFields(page)).toHaveCount(0);

  // A typed URL must not reach a page whose only purpose is an AI request.
  await page.goto('/items/ai');
  await expect(page).toHaveURL('/items');
  await expect(page.getByRole('heading', { name: 'Items', level: 1 })).toBeVisible();
});

test('keeps rejecting AI requests on the server while AI features are disabled', async ({ request }) => {
  await setAiEnabled(request, false);
  const category = await createCategory(request, unique('AI Guarded'));

  const analyze = await request.post('/api/ai/items/analyze', {
    multipart: { image: { name: 'sample-photo.png', mimeType: 'image/png', buffer: fs.readFileSync(fixture) } }
  });
  expect(analyze.status()).toBe(409);
  expect((await analyze.json()).error).toEqual({ code: 'AI_DISABLED', params: {} });

  const fields = await request.post(`/api/categories/${category.id}/fields/ai`, { data: { description: 'Anything' } });
  expect(fields.status()).toBe(409);
  expect((await fields.json()).error).toEqual({ code: 'AI_DISABLED', params: {} });
});

test('shows every AI action and allows the AI page while AI features are enabled', async ({ page, request }) => {
  await setAiEnabled(request, true);
  const categoryName = unique('AI Visible Fields');
  await createCategory(request, categoryName);
  await stubEmptyItems(page);

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await expect(aiAddItem(page)).toHaveCount(2);

  await openFields(page, categoryName);
  await expect(aiAddFields(page)).toBeVisible();

  await page.goto('/items/ai');
  await expect(page).toHaveURL('/items/ai');
  await expect(page.getByRole('heading', { name: 'AI Add Item' })).toBeVisible();
});

test('applies a saved Enable AI features change to the interface without a reload', async ({ page, request }) => {
  await setAiEnabled(request, true);
  // The account behind the saved key is never contacted from a test.
  await page.route('**/api/ai/models', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ models: [{ id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' }] })
  }));

  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const toggle = page.getByLabel('Enable AI features');
  await expect(toggle).toBeChecked();

  // An unsaved change must not reach the rest of the application.
  await toggle.uncheck();
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(aiAddItem(page).first()).toBeVisible();

  await openSettings(page);
  await page.getByLabel('Enable AI features').uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(page).toHaveURL('/items');
  await expect(aiAddItem(page)).toHaveCount(0);

  await openSettings(page);
  await page.getByLabel('Enable AI features').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(aiAddItem(page).first()).toBeVisible();
});

test('cannot enable AI features before an API key is saved', async ({ page, request }) => {
  // A fresh installation looks like this: AI off, no key, so the switch has nothing to enable.
  const cleared = await request.put('/api/settings/ai', {
    data: { enabled: true, provider: 'openai', model: 'gpt-5.6-luna', clearApiKey: true }
  });
  expect((await cleared.json()).enabled).toBe(false);
  await page.route('**/api/ai/models', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ models: [{ id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' }] })
  }));

  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const toggle = page.getByLabel('Enable AI features');
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeDisabled();
  await expect(page.getByText('Save an OpenAI API key below to enable AI features.')).toBeVisible();

  // A key typed in this form counts: it is stored by the same save as the switch.
  await page.getByLabel('API key', { exact: true }).fill(testApiKey);
  await expect(toggle).toBeEnabled();
  await toggle.check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');
  await expect(page.getByLabel('Enable AI features')).toBeChecked();

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(aiAddItem(page).first()).toBeVisible();

  // Removing the key turns AI off with it, without a reload.
  await openSettings(page);
  await page.getByLabel('Remove the saved API key').check();
  await expect(page.getByLabel('Enable AI features')).not.toBeChecked();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(aiAddItem(page)).toHaveCount(0);
});

test('stays usable when the capability request fails', async ({ page, request }) => {
  await setAiEnabled(request, true);
  await page.route('**/api/capabilities', route => route.abort());

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('heading', { name: 'Items', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add item', exact: true })).toBeVisible();
  // Unknown capabilities fail closed, so the AI actions stay hidden instead of failing later.
  await expect(aiAddItem(page)).toHaveCount(0);

  await page.getByRole('link', { name: 'Categories & Fields' }).click();
  await expect(page).toHaveURL('/categories');
  await expect(page.getByRole('heading', { name: 'Categories & Fields' })).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
});
