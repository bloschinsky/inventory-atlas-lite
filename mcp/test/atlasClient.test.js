import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { AtlasClient } from '../src/atlasClient.js';
import { ToolError } from '../src/errors.js';

const TOKEN = `ial_${'c'.repeat(16)}_${'D'.repeat(43)}`;

// A scripted stand-in for Atlas: each test sets `handler`; every request is recorded.
async function stub() {
  const state = { requests: [], handler: (_req, res) => res.end('{}') };
  const server = http.createServer((req, res) => {
    state.requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    state.handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  state.base = `http://127.0.0.1:${server.address().port}`;
  state.close = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  return state;
}

const client = (base, overrides = {}) => new AtlasClient({
  baseUrl: base, token: TOKEN, timeoutMs: 1000, maxResponseBytes: 64 * 1024, maxConcurrency: 2, maxQueue: 1, ...overrides
});
const json = (status, body, headers = {}) => (_req, res) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const rejectsKind = (promise, kind) => assert.rejects(promise, error => error instanceof ToolError && error.kind === kind);

test('requests are GETs with the bearer token and encoded path parts', async () => {
  const atlas = await stub();
  try {
    atlas.handler = json(200, { ok: true });
    assert.deepEqual(await client(atlas.base).get(['items', '../security/users'], { search: 'a&b', page: 2, empty: '', none: undefined }), { ok: true });
    assert.deepEqual(atlas.requests, [{ method: 'GET', url: '/api/items/..%2Fsecurity%2Fusers?search=a%26b&page=2', authorization: `Bearer ${TOKEN}` }]);
    assert.ok(!Object.keys(client(atlas.base)).some(key => key.includes('authorization')), 'the token is not an enumerable property');
    assert.ok(!JSON.stringify(client(atlas.base)).includes(TOKEN));
  } finally {
    await atlas.close();
  }
});

test('Atlas statuses become safe error kinds without response text', async () => {
  const atlas = await stub();
  try {
    for (const [status, body, kind, headers] of [
      [401, { error: { code: 'AUTH_REQUIRED', params: {} } }, 'auth_rejected'],
      [403, { error: { code: 'AUTH_FORBIDDEN' } }, 'forbidden'],
      [404, { error: { code: 'ITEM_NOT_FOUND' } }, 'not_found'],
      [400, { error: { code: 'INVALID_HISTORY_CURSOR' } }, 'invalid_input'],
      [429, { error: { code: 'AUTH_LOGIN_THROTTLED' } }, 'rate_limited', { 'retry-after': '7' }],
      [503, { error: { code: 'DATABASE_MAINTENANCE' } }, 'upstream_unavailable'],
      [500, { leaked: `stack with ${TOKEN}` }, 'upstream_error']
    ]) {
      atlas.handler = json(status, body, headers);
      const error = await client(atlas.base).get(['items']).catch(caught => caught);
      assert.equal(error.kind, kind, String(status));
      assert.ok(!JSON.stringify(error.toJSON()).includes('stack'), 'no Atlas body text is passed on');
      if (status === 429) assert.equal(error.retryAfterSeconds, 7);
      if (status === 404) assert.equal(error.atlasCode, 'ITEM_NOT_FOUND');
    }
    atlas.handler = json(403, { error: { code: 'AUTH_HTTPS_REQUIRED' } });
    const https = await client(atlas.base).get(['items']).catch(caught => caught);
    assert.match(https.detail, /plain HTTP/);
  } finally {
    await atlas.close();
  }
});

test('an unreachable Atlas, a timeout, and non-JSON answers fail cleanly', async () => {
  const atlas = await stub();
  const { base } = atlas;
  atlas.handler = (_req, res) => { res.writeHead(200); res.end('<html>'); };
  await rejectsKind(client(base).get(['items']), 'upstream_error');
  atlas.handler = () => {};
  await rejectsKind(client(base, { timeoutMs: 500 }).get(['items']), 'upstream_unavailable');
  await atlas.close();
  await rejectsKind(client(base).get(['items']), 'upstream_unavailable');
});

test('redirects are never followed, so the token stays with Atlas', async () => {
  const atlas = await stub();
  try {
    atlas.handler = (_req, res) => { res.writeHead(302, { location: 'http://attacker.example/steal' }); res.end(); };
    await rejectsKind(client(atlas.base).get(['items']), 'upstream_unavailable');
    assert.equal(atlas.requests.length, 1);
  } finally {
    await atlas.close();
  }
});

test('answers above the size cap are refused, declared or streamed', async () => {
  const atlas = await stub();
  try {
    atlas.handler = json(200, { data: 'x'.repeat(100 * 1024) });
    await rejectsKind(client(atlas.base).get(['items']), 'response_too_large');
    atlas.handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"data":"');
      // An endless chunked body without a Content-Length, written as fast as the client reads it.
      const pump = () => { while (!res.destroyed && res.write('y'.repeat(16 * 1024))); };
      res.on('drain', pump);
      pump();
    };
    await rejectsKind(client(atlas.base).get(['items']), 'response_too_large');
  } finally {
    await atlas.close();
  }
});

test('concurrency is capped, the queue is bounded, and cancellation is honored', async () => {
  const atlas = await stub();
  try {
    const pending = [];
    atlas.handler = (_req, res) => pending.push(res);
    const atlasClient = client(atlas.base, { timeoutMs: 5000 });
    const first = atlasClient.get(['items']);
    const second = atlasClient.get(['items']);
    const cancel = new AbortController();
    const third = atlasClient.get(['items'], undefined, { signal: cancel.signal });
    await rejectsKind(atlasClient.get(['items']), 'rate_limited');
    while (pending.length < 2) await new Promise(resolve => setImmediate(resolve));
    assert.equal(atlas.requests.length, 2, 'only two requests reach Atlas at once');
    cancel.abort();
    await rejectsKind(third, 'cancelled');
    for (const res of pending) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[]'); }
    assert.deepEqual(await Promise.all([first, second]), [[], []]);
    assert.equal(atlasClient.active, 0);

    // A request already running at Atlas is aborted too.
    const running = new AbortController();
    const inFlight = atlasClient.get(['items'], undefined, { signal: running.signal });
    while (atlas.requests.length < 3) await new Promise(resolve => setImmediate(resolve));
    running.abort();
    await rejectsKind(inFlight, 'cancelled');
    await rejectsKind(atlasClient.get(['items'], undefined, { signal: AbortSignal.abort() }), 'cancelled');
    assert.equal(atlasClient.active, 0);
  } finally {
    await atlas.close();
  }
});

test('the deadline covers the wait for a slot: queued requests time out, leave the queue, and leak no slot', async () => {
  const atlas = await stub();
  try {
    const pending = [];
    atlas.handler = (_req, res) => pending.push(res);
    const atlasClient = client(atlas.base, { timeoutMs: 400, maxConcurrency: 1, maxQueue: 3 });
    const started = Date.now();
    // One request holds the only slot until its own deadline; three more wait behind it.
    const calls = Array.from({ length: 4 }, () => atlasClient.get(['items']).then(() => 'ok', error => error.kind));
    while (pending.length < 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal(atlasClient.waiting.length, 3);
    const outcomes = await Promise.all(calls);
    assert.deepEqual(outcomes, Array(4).fill('upstream_unavailable'));
    // Every waiter gave up on its own deadline, not one deadline after another.
    assert.ok(Date.now() - started < 1200, `the queue was not drained one deadline at a time (${Date.now() - started} ms)`);
    assert.equal(atlas.requests.length, 1, 'a waiter whose time ran out never reaches Atlas');
    assert.deepEqual([atlasClient.active, atlasClient.waiting.length], [0, 0]);

    // The client is not stuck: the next request gets a slot at once.
    atlas.handler = json(200, []);
    assert.deepEqual(await atlasClient.get(['items']), []);
    assert.deepEqual([atlasClient.active, atlasClient.waiting.length], [0, 0]);

    // A cancelled waiter beside a slot that frees at the same moment loses nothing either.
    atlas.handler = (_req, res) => pending.push(res);
    pending.length = 0;
    const holder = atlasClient.get(['items']);
    const cancel = new AbortController();
    const waiter = atlasClient.get(['items'], undefined, { signal: cancel.signal });
    while (pending.length < 1) await new Promise(resolve => setImmediate(resolve));
    cancel.abort();
    pending[0].writeHead(200, { 'content-type': 'application/json' });
    pending[0].end('[]');
    await rejectsKind(waiter, 'cancelled');
    assert.deepEqual(await holder, []);
    assert.deepEqual([atlasClient.active, atlasClient.waiting.length], [0, 0]);
  } finally {
    await atlas.close();
  }
});
