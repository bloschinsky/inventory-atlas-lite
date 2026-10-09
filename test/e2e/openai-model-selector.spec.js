import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { setAiEnabled, unique } from './helpers.js';

/*
  An OpenAI /models stand-in behind the real backend, so discovery, grouping, the server-side cache,
  and the selector run end to end without contacting OpenAI. Each test saves its own key, which is
  its own cache entry on the shared test server.
*/
let stub;
let listed;
let modelRequests;
let failWith;

const listing = ids => ids.map((id, index) => ({ id, object: 'model', created: 1_800_000_000 + index }));
const initialIds = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-luna', 'gpt-6.1-sol', 'o3', 'whisper-1', 'text-embedding-3-small'];

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url !== '/v1/models') { res.statusCode = 404; res.end('{}'); return; }
    modelRequests += 1;
    if (failWith) { res.statusCode = failWith; res.end(JSON.stringify({ error: { message: 'Incorrect API key provided.' } })); return; }
    res.end(JSON.stringify({ object: 'list', data: listing(listed) }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
});

test.beforeEach(() => { listed = [...initialIds]; modelRequests = 0; failWith = 0; });
test.afterEach(async ({ request }) => { await setAiEnabled(request, false); });
test.afterAll(() => new Promise(resolve => stub.close(resolve)));

async function openAiSettings(page, request, model = 'gpt-5.6-terra') {
  const baseUrl = `http://127.0.0.1:${stub.address().port}/v1`;
  const response = await request.put('/api/settings/ai', {
    data: { enabled: true, provider: 'openai', baseUrl, model, apiKey: `sk-${unique('selector').replace(/\W/g, '')}` }
  });
  expect(response.ok()).toBeTruthy();
  await page.goto('/settings/ai');
  // Headless Chromium on Linux may initialize its pointer over the folded-hover sidebar.
  await page.mouse.move(600, 400);
}

// Option groups have no accessible role inside a native select, so they are found by their visible label.
const groupOptions = (page, name, model = 'Model') => page.getByLabel(model, { exact: true }).locator(`optgroup[label="${name}"] option`);

test('groups discovered models, expands to all of them, and explains the selected one', async ({ page, request }) => {
  await openAiSettings(page, request);
  const model = page.getByLabel('Model', { exact: true });
  await expect(model).toHaveValue('gpt-5.6-terra');
  await expect(groupOptions(page, 'Recommended / Latest')).toHaveText([
    'GPT-6.1 Sol', 'GPT-5.6 Luna (verified)', 'GPT-5.6 Terra (verified)', 'GPT-5.6 Sol (verified)'
  ]);
  await expect(groupOptions(page, 'Previous generations')).toHaveText(['GPT-6 Luna']);
  await expect(page.getByText('Last checked')).toContainText('6 models offered.');
  await expect(model.getByRole('option', { name: 'o3' })).toHaveCount(0);
  await expect(model.getByRole('option', { name: /whisper|embedding/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Show all models (1 more)' }).click();
  await expect(groupOptions(page, 'Other models')).toHaveText(['o3']);
  await page.getByRole('button', { name: 'Show fewer models' }).click();
  await expect(model.getByRole('option', { name: 'o3' })).toHaveCount(0);

  // A verified model is described as such; a new one stays unknown rather than assumed.
  await expect(page.getByText('Model ID: gpt-5.6-terra')).toBeVisible();
  await expect(page.getByText('Verified with AI Add Item and AI Add Fields.')).toBeVisible();
  await expect(page.getByText('Vision: Supported · Structured output: Supported')).toBeVisible();
  await model.selectOption('gpt-6.1-sol');
  await expect(page.getByText('Model ID: gpt-6.1-sol')).toBeVisible();
  await expect(page.getByText('Vision: Unknown · Structured output: Unknown')).toBeVisible();
  await expect(page.getByText('Verified with AI Add Item and AI Add Fields.')).toHaveCount(0);
  // The manual Image input setting still applies and says that it takes precedence.
  await page.getByLabel('Image input').selectOption('supported');
  await expect(page.getByText('takes precedence over this information')).toBeVisible();

  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');
  expect(await (await request.get('/api/settings/ai')).json()).toMatchObject({ model: 'gpt-6.1-sol', imageInput: 'supported' });

  // The connection test separates what the provider returned from what is offered.
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Connected' }))
    .toHaveText('Connected to OpenAI. It returned 8 models; candidates for AI features: 6.');
});

test('uses the cached list on reopening, refreshes on request, and keeps a model the provider no longer lists', async ({ page, request }) => {
  await openAiSettings(page, request);
  await expect(groupOptions(page, 'Recommended / Latest')).toHaveCount(4);
  expect(modelRequests).toBe(1);

  // Reopening Settings within a day does not ask the provider again.
  await page.reload();
  await expect(groupOptions(page, 'Recommended / Latest')).toHaveCount(4);
  expect(modelRequests).toBe(1);

  // A new generation appears on Refresh, and the saved model that disappeared stays selected.
  listed = ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-6.2-luna', 'gpt-6.1-sol'];
  await page.getByRole('button', { name: 'Refresh models' }).click();
  await expect(groupOptions(page, 'Recommended / Latest')).toHaveText(['GPT-6.2 Luna', 'GPT-5.6 Luna (verified)', 'GPT-5.6 Sol (verified)']);
  expect(modelRequests).toBe(2);
  const model = page.getByLabel('Model', { exact: true });
  await expect(model).toHaveValue('gpt-5.6-terra');
  await expect(model.locator('option:checked')).toHaveText('gpt-5.6-terra (not in the provider\'s list)');
  await expect(page.getByText('This model is not in the provider\'s current list.')).toBeVisible();
  // Refresh never saves anything.
  expect((await (await request.get('/api/settings/ai')).json()).model).toBe('gpt-5.6-terra');

  // A failed refresh keeps the last list, labelled, and the selection as it was.
  failWith = 401;
  await page.getByRole('button', { name: 'Refresh models' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not refresh the model list.' }))
    .toContainText('OpenAI rejected the API key.');
  await expect(page.getByRole('alert').filter({ hasText: 'Could not refresh the model list.' })).toContainText('Showing the list last checked');
  await expect(groupOptions(page, 'Recommended / Latest')).toHaveCount(3);
  await expect(model).toHaveValue('gpt-5.6-terra');

  // Another key is another connection: its list is never borrowed, and its failure is reported.
  await page.getByLabel('API key', { exact: true }).fill('sk-another-account-key');
  await expect(page.getByText('The connection has changed. Refresh models to load the list for it.')).toBeVisible();
  await expect(groupOptions(page, 'Recommended / Latest')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh models' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load the model list.' })).toBeVisible();
  await expect(model).toHaveValue('gpt-5.6-terra');
});

test('shows all candidates when none is recommended', async ({ page, request }) => {
  listed = ['o3', 'acme-research-model', 'whisper-1'];
  await openAiSettings(page, request, 'gpt-5.6-luna');
  await expect(page.getByText('No recommended GPT models were found for this connection')).toBeVisible();
  await expect(groupOptions(page, 'Other models')).toHaveText(['acme-research-model', 'o3']);
  await expect(page.getByRole('button', { name: /Show all models/ })).toHaveCount(0);
});

test.describe('on a phone in Ukrainian and dark mode', () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });

  test('the model selector stays usable and translated', async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
    await openAiSettings(page, request);
    const model = page.getByLabel('Модель', { exact: true });
    await expect(model).toHaveValue('gpt-5.6-terra');
    await expect(groupOptions(page, 'Рекомендовані / найновіші', 'Модель')).toHaveCount(4);
    await page.getByRole('button', { name: 'Показати всі моделі (ще 1)' }).click();
    await expect(groupOptions(page, 'Інші моделі', 'Модель')).toHaveText(['o3']);
    await expect(page.getByText('Зір: Підтримується · Структуровані відповіді: Підтримується')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Оновити моделі' })).toBeVisible();
    // Nothing in the selector widens the page past the phone screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
