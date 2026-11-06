import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolError } from '../src/errors.js';
import { createHttpApp } from '../src/httpServer.js';
import { createLogger } from '../src/logger.js';

const config = { listen: { host: '127.0.0.1', allowedHosts: ['127.0.0.1', 'localhost', '[::1]'] }, maxSessions: 2, sessionIdleMs: 60000 };
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

async function serve(atlas) {
  const { app, close, sessions } = createHttpApp({ config, atlas, logger: createLogger('error', () => {}) });
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${listener.address().port}`;
  const stop = async () => {
    await close();
    listener.closeAllConnections();
    await new Promise(resolve => listener.close(resolve));
  };
  return { base, sessions, stop };
}

// Opens a session the way a client does: initialize, then the initialized notification.
async function open(base) {
  const response = await fetch(`${base}/mcp`, { method: 'POST', headers: HEADERS,
    body: rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }) });
  await response.text();
  if (!response.ok) return { status: response.status };
  const id = response.headers.get('mcp-session-id');
  const headers = { ...HEADERS, 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' };
  await (await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).text();
  return { status: response.status, id, headers };
}

test('a client that disconnects mid-call cancels the Atlas request', async () => {
  const seen = { started: false, aborted: false };
  const atlas = {
    get: (_segments, _query, { signal } = {}) => new Promise((_resolve, reject) => {
      seen.started = true;
      signal.addEventListener('abort', () => { seen.aborted = true; reject(new ToolError('cancelled')); });
    })
  };
  const server = await serve(atlas);
  try {
    const session = await open(server.base);
    const controller = new AbortController();
    const call = fetch(`${server.base}/mcp`, { method: 'POST', headers: session.headers, signal: controller.signal,
      body: rpc(2, 'tools/call', { name: 'get_inventory_summary', arguments: {} }) }).then(response => response.text());
    while (!seen.started) await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(call);
    while (!seen.aborted) await new Promise(resolve => setImmediate(resolve));
  } finally {
    await server.stop();
  }
});

test('open sessions are capped and a closed session is gone', async () => {
  const server = await serve({ get: async () => ({}) });
  try {
    const first = await open(server.base);
    const second = await open(server.base);
    assert.ok(first.id && second.id && first.id !== second.id);
    assert.equal((await open(server.base)).status, 503, 'a third session is refused');
    assert.equal((await fetch(`${server.base}/mcp`, { method: 'DELETE', headers: first.headers })).status, 200);
    assert.equal(server.sessions.size, 1);
    const reused = await fetch(`${server.base}/mcp`, { method: 'POST', headers: first.headers, body: rpc(3, 'tools/list') });
    assert.equal(reused.status, 404);
    assert.ok((await open(server.base)).id, 'the freed slot can be used again');
  } finally {
    await server.stop();
  }
});

test('health answers without contacting Atlas, readiness reports only a kind', async () => {
  let calls = 0;
  const server = await serve({ get: async () => { calls += 1; throw new ToolError('auth_rejected'); } });
  try {
    assert.deepEqual(await (await fetch(`${server.base}/healthz`)).json(), { status: 'ok' });
    assert.equal(calls, 0);
    const ready = await fetch(`${server.base}/readyz`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'not_ready', reason: 'auth_rejected' });
    await fetch(`${server.base}/readyz`);
    assert.equal(calls, 1, 'readiness is cached briefly');
    assert.equal((await fetch(`${server.base}/elsewhere`)).status, 404);
  } finally {
    await server.stop();
  }
});
