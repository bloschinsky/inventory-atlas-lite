import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { createCategory, setAiEnabled, unique } from './helpers.js';

/*
  A local OpenAI-compatible stub stands in for Ollama, LM Studio, or any other compatible server, so
  the real backend is exercised end to end without a live provider. It records what reached it.
*/
let stub;
let requests;

test.beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk.toString();
    requests.push({ path: req.url, authorization: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') {
      res.end(JSON.stringify({ data: [
        { id: 'vision-model', name: 'Vision Model', architecture: { input_modalities: ['text', 'image'] } },
        { id: 'text-model', name: 'Text Model', architecture: { input_modalities: ['text'] } }
      ] }));
      return;
    }
    // Answered the way many local models do: the JSON document inside a code fence.
    const document = { version: 1, fields: [{ name: 'Interface', type: 'text', required: false }, { name: 'Release Year', type: 'number', required: false }] };
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `\`\`\`json\n${JSON.stringify(document)}\n\`\`\`` } }] }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
});

test.beforeEach(() => { requests = []; });
// The AI settings are shared by the whole suite, so the default OpenAI configuration is restored.
test.afterEach(async ({ request }) => { await setAiEnabled(request, false); });
test.afterAll(() => new Promise(resolve => stub.close(resolve)));

test('configures a custom OpenAI-compatible provider and uses its model for AI features', async ({ page, request }) => {
  const baseUrl = `http://127.0.0.1:${stub.address().port}/v1`;
  const categoryName = unique('Provider Cards');
  const category = await createCategory(request, categoryName);

  await page.goto('/settings');
  // Headless Chromium on Linux may initialize its pointer over the folded-hover sidebar.
  await page.mouse.move(600, 400);
  const provider = page.getByLabel('Provider');
  const baseUrlInput = page.getByLabel('Base URL');

  // Each preset fills in its own default address.
  await provider.selectOption('ollama');
  await expect(baseUrlInput).toHaveValue('http://localhost:11434/v1');
  await provider.selectOption('lmstudio');
  await expect(baseUrlInput).toHaveValue('http://localhost:1234/v1');
  await provider.selectOption('openrouter');
  await expect(baseUrlInput).toHaveValue('https://openrouter.ai/api/v1');
  await provider.selectOption('custom');
  await expect(baseUrlInput).toHaveValue('');

  await page.getByLabel('Display name').fill('Test Gateway');
  await baseUrlInput.fill(baseUrl);
  await page.getByLabel('API key', { exact: true }).fill('sk-gateway-browser-secret');

  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Connected' })).toHaveText('Connected to Test Gateway. 2 models are available.');
  await page.getByRole('button', { name: 'Refresh models' }).click();
  const model = page.getByLabel('Model', { exact: true });
  await expect(model).toContainText('Text Model (text only)');
  await model.selectOption('vision-model');
  await page.getByLabel('Enable AI features').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('AI settings saved.');
  await expect(page.getByText('Saved key: ••••••••cret.')).toBeVisible();

  const saved = await (await request.get('/api/settings/ai')).json();
  expect(saved).toMatchObject({ enabled: true, provider: 'custom', displayName: 'Test Gateway', baseUrl, model: 'vision-model', hasApiKey: true });
  expect(JSON.stringify(saved)).not.toContain('sk-gateway-browser-secret');
  expect(requests.filter(entry => entry.path === '/v1/models').every(entry => entry.authorization === 'Bearer sk-gateway-browser-secret')).toBe(true);

  // AI Add Fields now goes through the configured provider and model.
  await page.goto('/categories');
  await page.mouse.move(600, 400);
  await page.getByRole('button').filter({ hasText: categoryName }).click();
  await page.getByRole('button', { name: 'AI Add Fields' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Field description').fill('Fields for vintage expansion cards.');
  await dialog.getByRole('button', { name: 'Generate Fields' }).click();
  await expect(dialog.getByRole('row').nth(1).getByRole('textbox')).toHaveValue('Interface');
  await expect(dialog.getByRole('row').nth(2).getByRole('textbox')).toHaveValue('Release Year');

  const generation = requests.find(entry => entry.path === '/v1/chat/completions');
  expect(generation.body.model).toBe('vision-model');
  expect(generation.authorization).toBe('Bearer sk-gateway-browser-secret');
  // Nothing is created before the review is confirmed.
  expect((await (await request.get(`/api/categories/${category.id}/fields`)).json()).length).toBe(0);
});

test('hides photo analysis when the configured model is text-only', async ({ page, request }) => {
  const baseUrl = `http://127.0.0.1:${stub.address().port}/v1`;
  const response = await request.put('/api/settings/ai', {
    data: { enabled: true, provider: 'ollama', baseUrl, model: 'text-model', imageInput: 'unsupported' }
  });
  expect(response.ok()).toBeTruthy();

  await page.goto('/items/ai');
  await page.mouse.move(600, 400);
  await expect(page.getByText('The selected model does not support image input')).toBeVisible();
  await expect(page.getByLabel('Item photo (optional)')).toHaveCount(0);
  await expect(page.getByLabel('Item description (optional)')).toBeVisible();
});
