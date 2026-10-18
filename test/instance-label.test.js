import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { INSTANCE_LABEL_MAX_LENGTH, normalizeInstanceLabel } from '../server/src/instanceLabel.js';
import { createCapabilityRoutes } from '../server/src/routes/capabilityRoutes.js';
import { startServer, stopServer } from './serverProcess.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('an absent or blank instance label means no label', () => {
  for (const value of [undefined, null, '', '   ', '\n\t', '\u200b', 42]) assert.equal(normalizeInstanceLabel(value), null, String(value));
});

test('an instance label is kept as text, cleaned of control characters, and cut to its limit', () => {
  assert.equal(normalizeInstanceLabel('TEST'), 'TEST');
  assert.equal(normalizeInstanceLabel('  Staging  2 '), 'Staging 2');
  assert.equal(normalizeInstanceLabel('PROD\r\nEU\u0000\u202e'), 'PROD EU');
  // Markup is ordinary text here; the client renders the label as text, never as HTML.
  assert.equal(normalizeInstanceLabel('<b>TEST</b>'), '<b>TEST</b>');
  const long = normalizeInstanceLabel('X'.repeat(200));
  assert.equal(long.length, INSTANCE_LABEL_MAX_LENGTH);
  // The limit counts characters, so an emoji is never split into a broken surrogate.
  assert.equal([...normalizeInstanceLabel('🧪'.repeat(30))].length, INSTANCE_LABEL_MAX_LENGTH);
  assert.equal(normalizeInstanceLabel(`${'A'.repeat(INSTANCE_LABEL_MAX_LENGTH - 1)} B`), 'A'.repeat(INSTANCE_LABEL_MAX_LENGTH - 1));
});

test('the capabilities response carries the configured label and nothing else from the environment', async () => {
  const handler = labels => {
    const router = createCapabilityRoutes({ aiSettingsService: { read: () => ({ enabled: false, imageInput: 'auto' }) }, ...labels });
    const layer = router.stack.find(entry => entry.route?.path === '/api/capabilities');
    let body;
    layer.route.stack[0].handle({}, { json: value => { body = value; } });
    return body;
  };
  assert.equal(handler({}).instanceLabel, null);
  assert.deepEqual(handler({ instanceLabel: 'TEST' }), { ai: { enabled: false, imageInput: true }, urlImport: false, instanceLabel: 'TEST' });
});

test('the instance label belongs to the running server and survives restoring a database named PROD', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-instance-label-'));
  const secret = 'never-exposed-secret-value';
  let server = await startServer(dataDir, { environment: { ATLAS_INSTANCE_LABEL: '  TEST\n', DROPBOX_APP_SECRET: secret } });
  try {
    const request = async (url, options) => {
      const response = await fetch(`${server.base}${url}`, options);
      assert.ok(response.ok, `${options?.method || 'GET'} ${url} returned ${response.status}`);
      return response.json();
    };
    const capabilities = await request('/api/capabilities');
    assert.equal(capabilities.instanceLabel, 'TEST');
    assert.ok(!JSON.stringify(capabilities).includes(secret));

    // A backup of a database named PROD, as if copied from the production instance.
    await request('/api/database/metadata', json('PUT', { name: 'PROD inventory' }));
    const backup = Buffer.from(await (await fetch(`${server.base}/api/backup`)).arrayBuffer());
    await request('/api/database/metadata', json('PUT', { name: 'Test inventory' }));

    const body = new FormData();
    body.append('backup', new Blob([backup]), 'prod.sqlite');
    const { restore_token: token } = await request('/api/restore/validate', { method: 'POST', body });
    await request('/api/restore/apply', json('POST', { restore_token: token, confirmation: 'RESTORE' }));
    assert.equal((await request('/api/database/metadata')).name, 'PROD inventory');
    assert.equal((await request('/api/capabilities')).instanceLabel, 'TEST');

    // The label is never written into the database: the same file under a server without one has none.
    await stopServer(server.child);
    server = await startServer(dataDir);
    assert.equal((await request('/api/database/metadata')).name, 'PROD inventory');
    assert.equal((await request('/api/capabilities')).instanceLabel, null);
  } finally {
    await stopServer(server.child);
    await rm(dataDir, { recursive: true, force: true });
  }
});
