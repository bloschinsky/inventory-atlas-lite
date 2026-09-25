import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Provider support is exercised without any live or paid API: the adapters talk to a local stub
// server, and the AI features run against a mocked provider through the same abstraction.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-ai-providers-test-'));

const { AI_PROVIDERS, aiProvider, isLocalNetworkHost, normalizeBaseUrl } = await import('../shared/aiProviders.js');
const { applySchema } = await import('../server/src/db.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { AiSettingsService } = await import('../server/src/services/aiSettingsService.js');
const { AiProviderService } = await import('../server/src/services/aiProviderService.js');
const { AiFieldService } = await import('../server/src/services/aiFieldService.js');
const { AiItemAnalysisService } = await import('../server/src/services/aiItemAnalysisService.js');
const { AiProviderHttp } = await import('../server/src/integrations/aiProviderHttp.js');
const { OpenAiProvider } = await import('../server/src/integrations/openAiProvider.js');
const { OpenAiCompatibleProvider, parseJsonText } = await import('../server/src/integrations/openAiCompatibleProvider.js');

const settingsPath = () => path.join(process.env.DATA_DIR, `ai-settings-${Math.random().toString(36).slice(2)}.json`);
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

// Rejects with the expected HTTP status and `expected`: a stable error code, or the full { code, params } body.
const matches = (error, expected) => {
  if (typeof expected === 'string') assert.equal(error.code, expected);
  else assert.deepEqual({ code: error.code, params: error.params }, expected);
};
const rejects = (promise, status, expected) => assert.rejects(promise, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  matches(error, expected);
  return true;
});

/*
  A minimal OpenAI-compatible server. Each test sets `stub.reply` to answer a request; every request
  is recorded with its path, Authorization header, and parsed body.
*/
async function startStub() {
  const stub = { requests: [], reply: () => ({ status: 404, body: { error: '404 page not found' } }) };
  stub.server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk.toString();
    const request = { method: req.method, path: req.url, authorization: req.headers.authorization, body: raw ? JSON.parse(raw) : null };
    stub.requests.push(request);
    const answer = await stub.reply(request);
    if (answer === 'hang') return;
    res.statusCode = answer.status ?? 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
  });
  await new Promise(resolve => stub.server.listen(0, '127.0.0.1', resolve));
  stub.baseUrl = `http://127.0.0.1:${stub.server.address().port}/v1`;
  stub.close = () => new Promise(resolve => { stub.server.closeAllConnections(); stub.server.close(resolve); });
  return stub;
}

const chat = content => ({ body: { choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });

test('the provider presets carry their default base URLs and key requirements', () => {
  assert.deepEqual(AI_PROVIDERS.map(({ id, defaultBaseUrl, apiKeyRequired }) => [id, defaultBaseUrl, apiKeyRequired]), [
    ['openai', 'https://api.openai.com/v1', true],
    ['openrouter', 'https://openrouter.ai/api/v1', true],
    ['ollama', 'http://localhost:11434/v1', false],
    ['lmstudio', 'http://localhost:1234/v1', false],
    ['custom', '', false]
  ]);
  assert.equal(aiProvider('anthropic-direct'), null);

  assert.equal(normalizeBaseUrl(' http://192.168.1.50:11434/v1/ '), 'http://192.168.1.50:11434/v1');
  assert.equal(normalizeBaseUrl('https://openrouter.ai/api/v1'), 'https://openrouter.ai/api/v1');
  assert.throws(() => normalizeBaseUrl(''), { code: 'BASE_URL_REQUIRED', status: 400 });
  assert.throws(() => normalizeBaseUrl('localhost:11434'), { code: 'BASE_URL_PROTOCOL' });
  assert.throws(() => normalizeBaseUrl('ftp://example.com/v1'), { code: 'BASE_URL_PROTOCOL' });
  assert.throws(() => normalizeBaseUrl('not a url'), { code: 'BASE_URL_INVALID' });
  assert.throws(() => normalizeBaseUrl('https://user:secret@example.com/v1'), { code: 'BASE_URL_CREDENTIALS' });
  assert.throws(() => normalizeBaseUrl('https://example.com/v1?key=1'), { code: 'BASE_URL_QUERY' });

  for (const host of ['localhost', '127.0.0.1', '192.168.1.50', '10.0.0.2', '172.20.0.1', 'nas.local', 'ollama', '[::1]', '[fd00::5]']) {
    assert.equal(isLocalNetworkHost(host), true, host);
  }
  for (const host of ['openrouter.ai', '8.8.8.8', '172.40.0.1', 'fcbank.com', '[2001:db8::1]']) assert.equal(isLocalNetworkHost(host), false, host);
});

test('a settings file from before provider support keeps working as the OpenAI preset', () => {
  const service = new AiSettingsService({ settingsPath: settingsPath() });
  writeFileSync(service.settingsPath, JSON.stringify({ enabled: true, provider: 'openai', model: 'gpt-5.6-terra', apiKey: 'sk-legacy-key-1234' }));

  assert.deepEqual(service.publicSettings(), {
    enabled: true, provider: 'openai', displayName: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-terra',
    imageInput: 'auto', hasApiKey: true, apiKeyMasked: '••••••••1234'
  });
  assert.equal(service.requireUsableSettings('testing').apiKey, 'sk-legacy-key-1234');
  // Saving the same OpenAI form again keeps the existing key without retyping it.
  assert.equal(service.write({ enabled: true, provider: 'openai', model: 'gpt-5.6-terra' }).hasApiKey, true);
});

test('each preset saves its default or overridden base URL with the key it requires', () => {
  const service = new AiSettingsService({ settingsPath: settingsPath() });
  const save = changes => service.write({ enabled: true, model: 'some-model', ...changes });

  // Keys are required by the hosted presets: enabling without one is stored as off.
  assert.equal(save({ provider: 'openrouter' }).enabled, false);
  assert.equal(service.publicSettings().baseUrl, 'https://openrouter.ai/api/v1');
  assert.throws(() => service.requireUsableSettings(), { status: 409, code: 'AI_API_KEY_MISSING', params: { provider: 'OpenRouter' } });
  const openRouter = save({ provider: 'openrouter', apiKey: 'sk-or-test-abcd' });
  assert.equal(openRouter.enabled, true);
  assert.equal(openRouter.apiKeyMasked, '••••••••abcd');
  assert.ok(!JSON.stringify(openRouter).includes('sk-or-test'));

  // Local presets need no key and accept a LAN address instead of localhost.
  const ollama = save({ provider: 'ollama', model: 'llava:13b' });
  assert.equal(ollama.enabled, true);
  assert.equal(ollama.baseUrl, 'http://localhost:11434/v1');
  assert.equal(save({ provider: 'ollama', baseUrl: 'http://192.168.1.50:11434/v1/' }).baseUrl, 'http://192.168.1.50:11434/v1');
  assert.equal(save({ provider: 'lmstudio', baseUrl: '' }).baseUrl, 'http://localhost:1234/v1');
  assert.equal(save({ provider: 'lmstudio', baseUrl: 'http://10.0.0.8:1234/v1' }).enabled, true);

  // A custom endpoint has no default address and carries its own display name.
  assert.throws(() => save({ provider: 'custom' }), { status: 400, code: 'BASE_URL_REQUIRED' });
  assert.throws(() => save({ provider: 'custom', baseUrl: 'file:///etc/passwd' }), { code: 'BASE_URL_PROTOCOL' });
  const custom = save({ provider: 'custom', displayName: 'vLLM on the NAS', baseUrl: 'https://nas.example.net/v1', imageInput: 'unsupported' });
  assert.deepEqual({ ...custom, hasApiKey: undefined }, {
    enabled: true, provider: 'custom', displayName: 'vLLM on the NAS', baseUrl: 'https://nas.example.net/v1', model: 'some-model',
    imageInput: 'unsupported', hasApiKey: undefined, apiKeyMasked: ''
  });
  assert.equal(service.requireUsableSettings('testing').label, 'vLLM on the NAS');

  assert.throws(() => save({ provider: 'gemini' }), { code: 'UNSUPPORTED_AI_PROVIDER' });
  assert.throws(() => save({ provider: 'ollama', imageInput: 'maybe' }), { code: 'INVALID_IMAGE_INPUT' });
});

test('a saved key belongs to its endpoint and is never sent to another one', () => {
  const service = new AiSettingsService({ settingsPath: settingsPath() });
  service.write({ enabled: true, provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'sk-openai-secret-0001' });

  // The model list and connection test reuse the saved key only for the same provider and address.
  assert.equal(service.connection({ provider: 'openai', baseUrl: 'https://api.openai.com/v1' }).apiKey, 'sk-openai-secret-0001');
  assert.throws(() => service.connection({ provider: 'openai', baseUrl: 'https://attacker.example/v1' }), error => error.status === 409);
  assert.equal(service.connection({ provider: 'ollama' }).apiKey, '');
  assert.equal(service.connection({ provider: 'openrouter', apiKey: 'sk-or-typed' }).apiKey, 'sk-or-typed');

  // Saving a different address without a new key drops the old one instead of carrying it over.
  const moved = service.write({ enabled: true, provider: 'openai', baseUrl: 'https://proxy.example/v1', model: 'gpt-5.6-luna' });
  assert.equal(moved.hasApiKey, false);
  assert.equal(moved.enabled, false);
  assert.ok(!readFileSync(service.settingsPath, 'utf8').includes('sk-openai-secret'));
});

test('the compatible adapter lists models with capabilities and authenticates only when a key is set', async () => {
  const stub = await startStub();
  try {
    stub.reply = () => ({ body: { data: [
      { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o-mini', architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['response_format'] },
      { id: 'mistral/text-only', name: 'Mistral: Text Only', architecture: { input_modalities: ['text'] }, supported_parameters: ['temperature'] },
      { id: 'local-model' },
      { id: 'local-model' }
    ] } });
    const openRouter = new OpenAiCompatibleProvider({ label: 'OpenRouter', baseUrl: stub.baseUrl, apiKey: 'sk-or-key' });
    assert.deepEqual(await openRouter.listModels(), [
      { id: 'local-model', label: 'local-model', imageInput: null, structuredOutput: null },
      { id: 'mistral/text-only', label: 'Mistral: Text Only', imageInput: false, structuredOutput: false },
      { id: 'openai/gpt-4o-mini', label: 'OpenAI: GPT-4o-mini', imageInput: true, structuredOutput: true }
    ]);
    assert.deepEqual(stub.requests.at(-1), { method: 'GET', path: '/v1/models', authorization: 'Bearer sk-or-key', body: null });
    assert.deepEqual(await openRouter.modelCapabilities('mistral/text-only'), { imageInput: false, structuredOutput: false });
    assert.deepEqual(await openRouter.modelCapabilities('not-listed'), { imageInput: null, structuredOutput: null });

    const ollama = new OpenAiCompatibleProvider({ label: 'Ollama', baseUrl: stub.baseUrl, apiKey: '' });
    await ollama.listModels();
    assert.equal(stub.requests.at(-1).authorization, undefined);

    // Listing is optional: an endpoint without it reports a clear, recognizable error.
    stub.reply = () => ({ status: 404, body: '404 page not found' });
    await assert.rejects(ollama.listModels(), error => error.listUnsupported === true && error.code === 'AI_MODEL_LIST_UNSUPPORTED');
    stub.reply = () => ({ body: { object: 'list' } });
    await rejects(ollama.listModels(), 502, { code: 'AI_INVALID_MODEL_LIST', params: { provider: 'Ollama' } });
    stub.reply = () => ({ status: 401, body: { error: { message: 'Invalid token' } } });
    await rejects(openRouter.listModels(), 502, { code: 'AI_PROVIDER_KEY_REJECTED', params: { provider: 'OpenRouter' } });
    await rejects(ollama.listModels(), 502, { code: 'AI_PROVIDER_KEY_REQUIRED', params: { provider: 'Ollama' } });
  } finally {
    await stub.close();
  }
});

test('the connection test reports reachable, unlisted, and unreachable endpoints', async () => {
  const stub = await startStub();
  const service = new AiProviderService({
    aiSettingsService: new AiSettingsService({ settingsPath: settingsPath() }),
    createProvider: connection => new OpenAiCompatibleProvider(connection)
  });
  try {
    stub.reply = () => ({ body: { data: [{ id: 'llava:13b' }, { id: 'qwen2.5:7b' }] } });
    const connected = await service.testConnection({ provider: 'ollama', baseUrl: stub.baseUrl });
    assert.deepEqual(connected.notice, { code: 'AI_CONNECTED', params: { provider: 'Ollama', count: 2 } });
    assert.deepEqual(connected.models.map(model => model.id), ['llava:13b', 'qwen2.5:7b']);

    stub.reply = () => ({ status: 404, body: 'Not Found' });
    const unlisted = await service.testConnection({ provider: 'custom', displayName: 'My Gateway', baseUrl: stub.baseUrl });
    assert.deepEqual(unlisted.notice, { code: 'AI_CONNECTED_NO_MODEL_LIST', params: { provider: 'My Gateway' } });
    // A failed list keeps the provider usable with a manually entered model ID.
    await rejects(service.listModels({ provider: 'custom', baseUrl: stub.baseUrl }), 502, 'AI_MODEL_LIST_UNSUPPORTED');

    await rejects(service.testConnection({ provider: 'openrouter', baseUrl: stub.baseUrl }), 409, { code: 'AI_API_KEY_REQUIRED', params: { provider: 'OpenRouter' } });
    await rejects(service.testConnection({ provider: 'custom', baseUrl: 'localhost:1234' }), 400, 'BASE_URL_PROTOCOL');
  } finally {
    await stub.close();
  }
  // Nothing listens there any more, which is how a wrong host or a stopped server looks.
  await rejects(service.testConnection({ provider: 'lmstudio', baseUrl: stub.baseUrl }), 502, 'AI_PROVIDER_UNREACHABLE');
});

test('the compatible adapter generates structured data and normalizes provider failures', async () => {
  const stub = await startStub();
  const provider = new OpenAiCompatibleProvider({ label: 'LM Studio', baseUrl: stub.baseUrl, apiKey: '' });
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
  const generate = (changes = {}) => provider.generateStructuredData({
    model: 'qwen2.5-vl-7b', instructions: 'Answer.', input: '{"question":"ok?"}', image: null,
    schemaName: 'answer', schema, task: 'answer the question', ...changes
  });
  try {
    stub.reply = () => chat('```json\n{"ok": true}\n```');
    assert.deepEqual(await generate(), { data: { ok: true }, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const sent = stub.requests.at(-1);
    assert.equal(sent.path, '/v1/chat/completions');
    assert.equal(sent.body.model, 'qwen2.5-vl-7b');
    assert.equal(sent.body.response_format.type, 'json_schema');
    assert.deepEqual(sent.body.response_format.json_schema.schema, schema);
    assert.match(sent.body.messages[0].content, /matches this JSON Schema/);
    assert.equal(sent.body.messages[1].content, '{"question":"ok?"}');

    // An endpoint without the JSON-schema response format gets one retry with the prompt alone.
    stub.requests.length = 0;
    stub.reply = request => (request.body.response_format
      ? { status: 400, body: { error: { message: "'response_format.type' must be 'json_object' or 'text'" } } }
      : chat('Here it is: {"ok": false}'));
    assert.deepEqual((await generate()).data, { ok: false });
    assert.equal(stub.requests.length, 2);
    assert.equal(stub.requests[1].body.response_format, undefined);
    // Known lack of structured output skips the first attempt.
    stub.requests.length = 0;
    await generate({ structuredOutput: false });
    assert.equal(stub.requests.length, 1);

    // Vision input is sent in the chat-completions image format.
    stub.reply = () => chat('{"ok": true}');
    await generate({ image: { buffer: pngBytes, mimeType: 'image/png' } });
    const parts = stub.requests.at(-1).body.messages[1].content;
    assert.equal(parts[0].type, 'text');
    assert.equal(parts[1].type, 'image_url');
    assert.match(parts[1].image_url.url, /^data:image\/png;base64,/);

    stub.reply = () => ({ status: 400, body: { error: { message: 'Model does not support images. Please use a model that does.' } } });
    await rejects(generate({ image: { buffer: pngBytes, mimeType: 'image/png' } }), 422, 'AI_IMAGE_UNSUPPORTED');
    stub.reply = () => ({ status: 404, body: { error: { message: 'model "missing:7b" not found, try pulling it first' } } });
    await rejects(generate({ model: 'missing:7b' }), 502, { code: 'AI_MODEL_NOT_FOUND', params: { provider: 'LM Studio', model: 'missing:7b' } });
    stub.reply = () => ({ status: 404, body: '404 page not found' });
    await rejects(generate(), 502, 'AI_PROVIDER_NO_API');
    stub.reply = () => ({ status: 429, body: { error: { message: 'slow down' } } });
    await rejects(generate(), 503, { code: 'AI_PROVIDER_RATE_LIMITED', params: { provider: 'LM Studio' } });
    stub.reply = () => ({ status: 500, body: { error: { message: 'CUDA out of memory' } } });
    await rejects(generate(), 502, { code: 'AI_PROVIDER_REQUEST_FAILED', params: { provider: 'LM Studio', status: 500 } });
    stub.reply = () => chat('I cannot help with that.');
    await rejects(generate(), 502, 'AI_INVALID_RESPONSE');
    stub.reply = () => chat('');
    await rejects(generate(), 502, { code: 'AI_NO_RESULT', params: { provider: 'LM Studio' } });
    stub.reply = () => 'hang';
    await rejects(new AiProviderHttp({ label: 'LM Studio', baseUrl: stub.baseUrl, apiKey: '' }).send('models', { timeoutMs: 100 }), 504, 'AI_PROVIDER_TIMEOUT');
  } finally {
    await stub.close();
  }
  assert.deepEqual(parseJsonText('{"a":1}'), { a: 1 });
  assert.throws(() => parseJsonText('no json here'));
});

test('the OpenAI adapter keeps the Responses API, strict schema output, and the recommended models', async () => {
  const stub = await startStub();
  const provider = new OpenAiProvider({ label: 'OpenAI', baseUrl: stub.baseUrl, apiKey: 'sk-openai-test' });
  try {
    stub.reply = () => ({ body: { data: [{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-luna' }, { id: 'whisper-1' }] } });
    assert.deepEqual(await provider.listModels(), [
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', imageInput: true },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', imageInput: true }
    ]);

    stub.reply = () => ({ body: { output_text: '{"ok":true}', usage: { input_tokens: 3 } } });
    const result = await provider.generateStructuredData({
      model: 'gpt-5.6-luna', instructions: 'Answer.', input: 'text', image: { buffer: pngBytes, mimeType: 'image/png' },
      schemaName: 'answer', schema: { type: 'object' }, task: 'answer'
    });
    assert.deepEqual(result, { data: { ok: true }, usage: { input_tokens: 3 } });
    const sent = stub.requests.at(-1);
    assert.equal(sent.path, '/v1/responses');
    assert.equal(sent.authorization, 'Bearer sk-openai-test');
    assert.equal(sent.body.store, false);
    assert.equal(sent.body.text.format.strict, true);
    assert.equal(sent.body.input[0].content[1].detail, 'original');

    stub.reply = () => ({ status: 404, body: { error: { message: 'The model `gpt-9` does not exist or you do not have access to it.', code: 'model_not_found' } } });
    await rejects(provider.generateStructuredData({ model: 'gpt-9', instructions: '', input: '', schema: {}, task: 'answer' }), 502, { code: 'AI_MODEL_NOT_FOUND', params: { provider: 'OpenAI', model: 'gpt-9' } });
  } finally {
    await stub.close();
  }
});

// The AI features, built with a mocked provider behind the real provider service.
function buildFeatures({ settings, capabilities = { imageInput: null }, reply }) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  const aiSettingsService = new AiSettingsService({ settingsPath: settingsPath() });
  aiSettingsService.write({ enabled: true, model: 'mock-model', ...settings });
  const calls = [];
  const aiProviderService = new AiProviderService({
    aiSettingsService,
    createProvider: connection => ({
      modelCapabilities: async () => capabilities,
      generateStructuredData: async request => { calls.push({ connection, request }); return { data: reply(request), usage: null }; }
    })
  });
  return {
    calls,
    categoryService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    aiFieldService: new AiFieldService({ aiProviderService, categoryService, customFieldRepository }),
    aiItemAnalysisService: new AiItemAnalysisService({ aiProviderService, categoryRepository, customFieldRepository })
  };
}

const ollama = { provider: 'ollama', baseUrl: 'http://192.168.1.50:11434/v1' };

test('AI Add Fields runs through the provider abstraction and keeps its own validation', async () => {
  let answer = { version: 1, fields: [{ name: 'Bus', type: 'text', required: false }] };
  const { calls, categoryService, aiFieldService } = buildFeatures({ settings: ollama, reply: () => answer });
  const category = categoryService.create({ name: 'Expansion Cards' });

  assert.deepEqual(await aiFieldService.generateForCategory(category.id, 'Old PC cards'), answer);
  assert.equal(calls[0].connection.baseUrl, 'http://192.168.1.50:11434/v1');
  assert.equal(calls[0].connection.label, 'Ollama');
  assert.equal(calls[0].request.model, 'mock-model');
  assert.equal(calls[0].request.schemaName, 'field_definition_document');
  assert.equal(calls[0].request.image, null);
  assert.equal(JSON.parse(calls[0].request.input).categoryName, 'Expansion Cards');

  // The provider's answer is untrusted: a malformed document is rejected, never passed through.
  answer = { version: 1, fields: [{ name: 'Colour', type: 'select', options: ['Red'] }] };
  await rejects(aiFieldService.generateForCategory(category.id, 'Old PC cards'), 502, 'AI_INVALID_FIELDS');
  answer = 'plain text';
  await rejects(aiFieldService.generateForCategory(category.id, 'Old PC cards'), 502, 'AI_INVALID_FIELDS');
});

test('AI Add Item accepts text with any model and photos only with a model that can read them', async () => {
  const draft = categoryId => ({
    observedMarkings: [], categoryId, confidence: 0.8, needsDetailedImageAnalysis: false,
    baseFields: { name: 'Sound card', description: null, condition: null, location: null, purchase_date: null, purchase_price_amount: null, purchase_price_currency: null, serial_number: null },
    dynamicFields: [{ fieldId: 999999, value: 'dropped' }], warnings: []
  });
  let categoryId;
  const photo = { buffer: pngBytes, mimetype: 'image/png' };

  // Text flow through a compatible provider.
  const text = buildFeatures({ settings: { provider: 'lmstudio' }, reply: () => draft(categoryId) });
  categoryId = text.categoryService.create({ name: 'Audio Cards' }).id;
  const textDraft = await text.aiItemAnalysisService.analyze(null, 'Creative sound card');
  assert.equal(textDraft.baseFields.name, 'Sound card');
  assert.deepEqual(textDraft.dynamicFields, {});
  assert.equal(text.calls[0].request.image, null);

  // Vision flow: the provider reports image input for the model, so the photo is sent.
  const vision = buildFeatures({ settings: { provider: 'openrouter', apiKey: 'sk-or' }, capabilities: { imageInput: true }, reply: () => draft(categoryId) });
  categoryId = vision.categoryService.create({ name: 'Audio Cards' }).id;
  assert.equal((await vision.aiItemAnalysisService.analyze(photo, '')).categoryId, categoryId);
  assert.equal(vision.calls[0].request.image.mimeType, 'image/png');

  // A model known to be text-only is refused before anything reaches the provider.
  const textOnly = buildFeatures({ settings: { provider: 'openrouter', apiKey: 'sk-or' }, capabilities: { imageInput: false }, reply: () => draft(categoryId) });
  categoryId = textOnly.categoryService.create({ name: 'Audio Cards' }).id;
  await rejects(textOnly.aiItemAnalysisService.analyze(photo, 'A card'), 422, 'AI_IMAGE_UNSUPPORTED');
  assert.equal(textOnly.calls.length, 0);
  assert.equal((await textOnly.aiItemAnalysisService.analyze(null, 'A card')).baseFields.name, 'Sound card');

  // The user's own setting wins over detection, in both directions.
  const declared = buildFeatures({ settings: { ...ollama, imageInput: 'unsupported' }, capabilities: { imageInput: true }, reply: () => draft(categoryId) });
  categoryId = declared.categoryService.create({ name: 'Audio Cards' }).id;
  await rejects(declared.aiItemAnalysisService.analyze(photo, ''), 422, 'AI_IMAGE_UNSUPPORTED');
  const forced = buildFeatures({ settings: { ...ollama, imageInput: 'supported' }, capabilities: { imageInput: false }, reply: () => draft(categoryId) });
  categoryId = forced.categoryService.create({ name: 'Audio Cards' }).id;
  await forced.aiItemAnalysisService.analyze(photo, '');
  assert.equal(forced.calls.length, 1);

  // An invalid structured answer is rejected by the existing draft validation.
  const invalid = buildFeatures({ settings: ollama, reply: () => ({ name: 'Just a name' }) });
  invalid.categoryService.create({ name: 'Audio Cards' });
  await rejects(invalid.aiItemAnalysisService.analyze(null, 'A card'), 502, 'AI_INVALID_RESPONSE');
});
