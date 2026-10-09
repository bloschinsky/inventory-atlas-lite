import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

// OpenAI model discovery runs against a local /models stub; no live or paid API is contacted.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-openai-models-test-'));

const { classifyOpenAiModels, compareGptVersions, gptVersion, isExcludedModel, knownOpenAiCapabilities } =
  await import('../server/src/integrations/openAiModelCatalog.js');
const { OpenAiProvider } = await import('../server/src/integrations/openAiProvider.js');
const { OpenAiCompatibleProvider } = await import('../server/src/integrations/openAiCompatibleProvider.js');
const { AiSettingsService } = await import('../server/src/services/aiSettingsService.js');
const { AiProviderService } = await import('../server/src/services/aiProviderService.js');
const { ModelListCache } = await import('../server/src/services/modelListCache.js');

const settingsPath = () => path.join(process.env.DATA_DIR, `ai-settings-${Math.random().toString(36).slice(2)}.json`);
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

// Generations from today's verified one to a later release no allowlist could have named in advance.
const RELEVANT = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6.9-luna', 'gpt-6.10-luna', 'gpt-9.2-orbit'];
const IRRELEVANT = [
  'text-embedding-3-large', 'omni-moderation-latest', 'whisper-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-transcribe',
  'gpt-image-1', 'dall-e-3', 'gpt-realtime', 'gpt-audio', 'davinci-002'
];
const UNKNOWN = ['o3', 'acme-research-model', 'ft:gpt-4o:acme::abc123', 'gpt-6.1-sol-2027-03-01'];
const listing = () => [...RELEVANT, ...IRRELEVANT, ...UNKNOWN].map((id, index) => ({ id, object: 'model', created: 1_800_000_000 + index }));

async function startStub() {
  const stub = { requests: [], reply: () => ({ body: { data: listing() } }) };
  stub.server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk.toString();
    stub.requests.push({ path: req.url, authorization: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
    const answer = stub.reply(req);
    res.statusCode = answer.status ?? 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(answer.body));
  });
  await new Promise(resolve => stub.server.listen(0, '127.0.0.1', resolve));
  stub.baseUrl = `http://127.0.0.1:${stub.server.address().port}/v1`;
  stub.modelRequests = () => stub.requests.filter(request => request.path === '/v1/models').length;
  stub.close = () => new Promise(resolve => { stub.server.closeAllConnections(); stub.server.close(resolve); });
  return stub;
}

test('GPT versions compare numerically, not as text', () => {
  const sorted = ['gpt-6.9-luna', 'gpt-5.6-sol', 'gpt-6.10-luna', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-4o', 'gpt-4']
    .map(id => ({ id, version: gptVersion(id) }))
    .sort((a, b) => compareGptVersions(a.version, b.version))
    .map(model => model.id);
  assert.deepEqual(sorted, ['gpt-6.10-luna', 'gpt-6.9-luna', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-4o', 'gpt-4']);
  assert.deepEqual(gptVersion('gpt-6.10-luna'), { major: 6, minor: 10, name: '6.10', variant: 'luna', snapshot: false });
  assert.equal(gptVersion('gpt-6.1-sol-2027-03-01').snapshot, true);
  assert.equal(gptVersion('gpt-4-0613').snapshot, true);
  assert.equal(gptVersion('o3'), null);
  assert.equal(gptVersion('chatgpt-4o-latest'), null);
});

test('discovery follows the provider list, not a fixed allowlist, and groups newest first', () => {
  const models = classifyOpenAiModels(listing());
  const ids = models.map(model => model.id);

  // Every relevant and unknown candidate is offered once; nothing irrelevant is.
  assert.deepEqual([...ids].sort(), [...RELEVANT, ...UNKNOWN].sort());
  for (const id of IRRELEVANT) assert.equal(isExcludedModel(id), true, id);

  const group = name => models.filter(model => model.group === name).map(model => model.id);
  // The newest generation leads on its own.
  assert.deepEqual(group('recommended'), ['gpt-9.2-orbit']);
  // Older generations follow in numeric order: 6.10 before 6.9 before 6.1 before 6, and the verified
  // GPT-5.6 models keep their place by version instead of moving up.
  assert.deepEqual(group('previous'), [
    'gpt-6.10-luna', 'gpt-6.9-luna', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'
  ]);
  // The compact view stays small, and nothing is lost: the rest is under Show all.
  assert.ok(group('recommended').length + group('previous').length <= 9);
  // GPT snapshots first, then the rest by the provider's creation time, newest first.
  assert.deepEqual(group('other'), ['gpt-6.1-sol-2027-03-01', 'ft:gpt-4o:acme::abc123', 'acme-research-model', 'o3']);

  const orbit = models.find(model => model.id === 'gpt-9.2-orbit');
  assert.deepEqual(orbit, {
    id: 'gpt-9.2-orbit', label: 'GPT-9.2 Orbit', group: 'recommended', verified: false, imageInput: null, structuredOutput: null, created: 1_800_000_008
  });
  // A snapshot or an unknown ID keeps its raw ID as the label.
  assert.equal(models.find(model => model.id === 'gpt-6.1-sol-2027-03-01').label, 'gpt-6.1-sol-2027-03-01');
});

test('a verified model never ranks above a newer generation, and stays in the compact view', () => {
  const versions = models => models.filter(model => model.group !== 'other').map(model => model.label);
  // The listing that showed GPT-5.6 under Recommended above GPT-6 under Previous generations.
  const reported = classifyOpenAiModels(['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-6.1-sol']
    .map((id, index) => ({ id, created: 1_800_000_000 + index })));
  assert.deepEqual(reported.filter(model => model.group === 'recommended').map(model => model.id), ['gpt-6.1-sol']);
  assert.deepEqual(versions(reported), [
    'GPT-6.1 Sol', 'GPT-6 Luna', 'GPT-6 Sol', 'GPT-6 Astra', 'GPT-5.6 Luna', 'GPT-5.6 Terra', 'GPT-5.6 Sol', 'GPT-5.5 Pro', 'GPT-5.5'
  ]);
  // Every compact entry is the same or an older version than the one above it.
  const compact = reported.filter(model => model.group !== 'other').map(model => gptVersion(model.id));
  compact.slice(1).forEach((version, index) => assert.ok(compareGptVersions(compact[index], version) <= 0));

  // Many newer models never push the verified ones under Show all.
  const crowded = classifyOpenAiModels(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol',
    ...['7', '6.9', '6.8', '6.7'].flatMap(version => ['a', 'b', 'c'].map(variant => `gpt-${version}-${variant}`))].map(id => ({ id })));
  for (const id of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) assert.equal(crowded.find(model => model.id === id).group, 'previous', id);
  assert.equal(crowded.filter(model => model.group !== 'other').length, 9);
  // When the verified models are the newest generation, they are the recommended ones.
  assert.deepEqual(classifyOpenAiModels([{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-luna' }, { id: 'gpt-5.5' }]).map(model => [model.id, model.group]),
    [['gpt-5.6-luna', 'recommended'], ['gpt-5.6-sol', 'recommended'], ['gpt-5.5', 'previous']]);
});

test('discovery deduplicates, drops invalid IDs, and orders ties predictably', () => {
  const models = classifyOpenAiModels([
    { id: 'gpt-6-sol' }, { id: 'gpt-6-luna' }, { id: 'gpt-6-sol' }, null, { id: '' }, { id: 42 }, { id: ' gpt-6-terra ' }, { id: 'x'.repeat(201) }
  ]);
  assert.deepEqual(models.map(model => model.id), ['gpt-6-luna', 'gpt-6-sol']);
  assert.deepEqual(classifyOpenAiModels([{ id: 'gpt-6-sol' }, { id: 'gpt-6-luna' }]), classifyOpenAiModels([{ id: 'gpt-6-luna' }, { id: 'gpt-6-sol' }]));
  // Only irrelevant or unknown models: nothing is recommended, and everything usable is still there.
  assert.deepEqual(classifyOpenAiModels([{ id: 'whisper-1' }, { id: 'o3' }]).map(model => [model.id, model.group]), [['o3', 'other']]);
  assert.deepEqual(classifyOpenAiModels([]), []);
});

test('capabilities are known only for verified models and stay unknown otherwise', async () => {
  assert.deepEqual(knownOpenAiCapabilities('gpt-5.6-luna'), { imageInput: true, structuredOutput: true });
  assert.deepEqual(knownOpenAiCapabilities('gpt-6.1-sol'), { imageInput: null, structuredOutput: null });
  const provider = new OpenAiProvider({ label: 'OpenAI', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'sk' });
  // Asking needs no request, so it is free and works offline.
  assert.deepEqual(await provider.modelCapabilities('gpt-9.2-orbit'), { imageInput: null, structuredOutput: null });
});

function openAiService({ now = () => Date.parse('2026-10-09T12:00:00Z'), cache } = {}) {
  const aiSettingsService = new AiSettingsService({ settingsPath: settingsPath() });
  return new AiProviderService({
    aiSettingsService,
    modelListCache: cache ?? new ModelListCache({ now }),
    now,
    createProvider: connection => (connection.provider === 'openai' ? new OpenAiProvider(connection) : new OpenAiCompatibleProvider(connection))
  });
}

test('the OpenAI model list is cached for a day per connection, and Refresh bypasses it', async () => {
  const stub = await startStub();
  let clock = Date.parse('2026-10-09T12:00:00Z');
  const cache = new ModelListCache({ now: () => clock });
  const service = openAiService({ now: () => clock, cache });
  const form = { provider: 'openai', baseUrl: stub.baseUrl, apiKey: 'sk-first-secret' };
  try {
    const first = await service.listModels(form);
    assert.equal(first.cached, false);
    assert.equal(first.providerCount, listing().length);
    assert.equal(first.fetchedAt, '2026-10-09T12:00:00.000Z');
    assert.equal(stub.requests[0].authorization, 'Bearer sk-first-secret');

    // Opening Settings again within a day answers from the cache.
    clock += 23 * 60 * 60 * 1000;
    const again = await service.listModels(form);
    assert.equal(again.cached, true);
    assert.deepEqual(again.models, first.models);
    assert.equal(stub.modelRequests(), 1);

    // Refresh always asks the provider.
    assert.equal((await service.listModels(form, { refresh: true })).cached, false);
    assert.equal(stub.modelRequests(), 2);

    // Another key or another address never reuses this list.
    await service.listModels({ ...form, apiKey: 'sk-second-secret' });
    assert.equal(stub.modelRequests(), 3);
    await service.listModels({ ...form, baseUrl: `${stub.baseUrl}/` });
    assert.equal(stub.modelRequests(), 3, 'the same address, normalized, is the same connection');
    await service.listModels({ ...form, baseUrl: stub.baseUrl.replace('127.0.0.1', 'localhost') });
    assert.equal(stub.modelRequests(), 4);

    // After a day the list is fetched again.
    clock += 25 * 60 * 60 * 1000;
    assert.equal((await service.listModels(form)).cached, false);
    assert.equal(stub.modelRequests(), 5);

    // The cache holds no API key in its keys or values.
    const stored = JSON.stringify([...cache.entries]);
    assert.ok(!stored.includes('sk-first-secret') && !stored.includes('sk-second-secret'));
  } finally {
    await stub.close();
  }
});

test('a failed refresh answers the earlier list marked stale, and fails clearly without one', async () => {
  const stub = await startStub();
  const service = openAiService();
  const form = { provider: 'openai', baseUrl: stub.baseUrl, apiKey: 'sk-stale-secret' };
  try {
    const fresh = await service.listModels(form);
    stub.reply = () => ({ status: 401, body: { error: { message: 'Incorrect API key provided: sk-stale-secret' } } });
    const stale = await service.listModels(form, { refresh: true });
    assert.equal(stale.stale, true);
    assert.deepEqual(stale.models, fresh.models);
    assert.deepEqual(stale.error, { code: 'AI_PROVIDER_KEY_REJECTED', params: { provider: 'OpenAI' } });
    assert.ok(!JSON.stringify(stale).includes('sk-stale-secret'));

    // A connection never listed before has nothing to fall back on.
    await assert.rejects(service.listModels({ ...form, apiKey: 'sk-other' }), { code: 'AI_PROVIDER_KEY_REJECTED', status: 502 });
    stub.reply = () => ({ body: { object: 'list' } });
    await assert.rejects(service.listModels({ ...form, apiKey: 'sk-malformed' }), { code: 'AI_INVALID_MODEL_LIST' });
  } finally {
    await stub.close();
  }
  // Nothing answers there now: the cached list is kept and labelled, not erased.
  const offline = await service.listModels(form, { refresh: true });
  assert.equal(offline.stale, true);
  assert.equal(offline.error.code, 'AI_PROVIDER_UNREACHABLE');
});

test('the connection test tells provider models apart from offered candidates', async () => {
  const stub = await startStub();
  const service = openAiService();
  try {
    const result = await service.testConnection({ provider: 'openai', baseUrl: stub.baseUrl, apiKey: 'sk-test' });
    assert.deepEqual(result.notice, {
      code: 'AI_CONNECTED_CANDIDATES', params: { provider: 'OpenAI', count: listing().length, offered: RELEVANT.length + UNKNOWN.length }
    });
    assert.equal(result.models.length, RELEVANT.length + UNKNOWN.length);

    // Other providers keep their list uncached and their notice unchanged.
    const before = stub.modelRequests();
    await service.listModels({ provider: 'ollama', baseUrl: stub.baseUrl });
    await service.listModels({ provider: 'ollama', baseUrl: stub.baseUrl });
    assert.equal(stub.modelRequests(), before + 2);
    const ollama = await service.testConnection({ provider: 'ollama', baseUrl: stub.baseUrl });
    assert.equal(ollama.notice.code, 'AI_CONNECTED');
    assert.equal(ollama.models[0].group, undefined);
  } finally {
    await stub.close();
  }
});

test('a newly discovered OpenAI model receives photos at original detail and its refusal is reported', async () => {
  const stub = await startStub();
  const aiSettingsService = new AiSettingsService({ settingsPath: settingsPath() });
  aiSettingsService.write({ enabled: true, provider: 'openai', baseUrl: stub.baseUrl, model: 'gpt-9.2-orbit', apiKey: 'sk-orbit' });
  const service = new AiProviderService({ aiSettingsService, createProvider: connection => new OpenAiProvider(connection) });
  const request = { purpose: 'test', instructions: 'Answer.', input: 'text', schemaName: 'answer', schema: { type: 'object' }, task: 'answer' };
  try {
    stub.reply = () => ({ body: { output_text: '{"ok":true}' } });
    assert.deepEqual((await service.generateStructuredData({ ...request, image: { buffer: pngBytes, mimeType: 'image/png' } })).data, { ok: true });
    const sent = stub.requests.at(-1);
    assert.equal(sent.path, '/v1/responses');
    // The exact saved ID is sent, with no parameters a new generation might reject.
    assert.equal(sent.body.model, 'gpt-9.2-orbit');
    assert.deepEqual(Object.keys(sent.body).sort(), ['input', 'instructions', 'model', 'store', 'text']);
    assert.equal(sent.body.input[0].content[1].detail, 'original');
    assert.equal(sent.body.text.format.strict, true);

    // A model that turns out to be text-only is reported once, without a retry or another model.
    stub.requests.length = 0;
    stub.reply = () => ({ status: 400, body: { error: { message: 'Invalid content type. image_url is only supported by certain models.' } } });
    await assert.rejects(service.generateStructuredData({ ...request, image: { buffer: pngBytes, mimeType: 'image/png' } }), { code: 'AI_IMAGE_UNSUPPORTED', status: 422 });
    assert.equal(stub.requests.length, 1);
  } finally {
    await stub.close();
  }
});
