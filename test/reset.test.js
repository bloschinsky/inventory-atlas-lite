import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let port = 35000 + Math.floor(Math.random() * 1000);
let base = `http://127.0.0.1:${port}`;

// Every start claims a fresh port so a previous server socket can never block the next one.
async function startServer(dataDir, environment = {}) {
  port += 1;
  base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/src/index.js', '--production'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...environment }, stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming ready.');
    try { if ((await fetch(`${base}/api/categories`)).ok) return child; } catch {
      // The server may still be starting; retry until the readiness deadline.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error('Server did not become ready.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}

const removeDir = dir => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function request(url, options) {
  const response = await fetch(`${base}${url}`, options);
  assert.ok(response.ok, `${options?.method || 'GET'} ${url} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const prepareReset = async () => {
  const response = await fetch(`${base}/api/database/reset/prepare`, json('POST', {}));
  return { status: response.status, body: await response.json() };
};

const applyReset = async (resetToken, confirmation = 'RESET INVENTORY') => {
  const response = await fetch(`${base}/api/database/reset/apply`, json('POST', { resetToken, confirmation }));
  return { status: response.status, body: await response.json() };
};

const listDir = directory => (fs.existsSync(directory) ? fs.readdirSync(directory).sort() : []);
const preResetBackups = dataDir => listDir(path.join(dataDir, 'pre-reset-backups'));

// A small inventory with a row in every current table: nesting, a custom field value, and a photo.
async function seedInventory() {
  const category = await request('/api/categories', json('POST', { name: 'Photo gear' }));
  const brand = await request(`/api/categories/${category.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));
  const box = await request('/api/items', json('POST', { name: 'Box A', category_id: category.id, location: 'Garage' }));
  const lens = await request('/api/items', json('POST', {
    name: 'Helios 44-2', category_id: category.id, parent_item_id: box.id, field_values: { [brand.id]: 'KMZ' }
  }));
  const photos = new FormData();
  photos.append('photos', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'lens.png');
  await request(`/api/items/${lens.id}/photos`, { method: 'POST', body: photos });
  return { category };
}

const itemNames = async () => (await request('/api/items?pageSize=100')).items.map(item => item.name).sort();

// Reads a database file next to the running server; WAL mode allows a concurrent reader.
const inspect = (file, read) => {
  const connection = new Database(file, { readonly: true, fileMustExist: true });
  try { return read(connection); } finally { connection.close(); }
};
const userTables = connection => connection
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  .map(row => row.name);
const rowCounts = connection => Object.fromEntries(userTables(connection)
  .map(name => [name, connection.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count]));
const schema = connection => connection
  .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();

test('prepare reports the current counts and a short-lived token without changing anything', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-reset-prepare-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    await seedInventory();
    const filesBefore = listDir(dataDir);
    const before = await itemNames();

    const prepared = await prepareReset();
    assert.equal(prepared.status, 200);
    assert.deepEqual(prepared.body.counts, { categories: 1, items: 2, fields: 1, fieldValues: 1, photos: 1 });
    assert.match(prepared.body.resetToken, /^[0-9a-f]{64}$/);
    assert.equal(prepared.body.expiresInSeconds, 300);
    assert.ok(!JSON.stringify(prepared.body).includes(dataDir));

    // Preparing is read-only: no backup, no candidate, no change to the inventory.
    assert.deepEqual(listDir(dataDir), filesBefore);
    assert.deepEqual(await itemNames(), before);

    // Only a JSON body is accepted; a form post or a query string never reaches the reset.
    const form = await fetch(`${base}/api/database/reset/prepare`, { method: 'POST', body: new URLSearchParams({ a: '1' }) });
    assert.equal(form.status, 415);
    const query = new URLSearchParams({ resetToken: prepared.body.resetToken, confirmation: 'RESET INVENTORY' });
    const byQuery = await fetch(`${base}/api/database/reset/apply?${query}`, { method: 'POST' });
    assert.equal(byQuery.status, 415);
    assert.deepEqual(await itemNames(), before);
  } finally {
    if (server) await stopServer(server);
    await removeDir(dataDir);
  }
});

test('apply requires the exact phrase and a live, single-use reset token', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-reset-token-test-'));
  let server;
  try {
    server = await startServer(dataDir, { RESET_TOKEN_TTL_MS: '3000' });
    await seedInventory();
    const { body: { resetToken } } = await prepareReset();

    const missing = await applyReset(undefined);
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /token is missing/);
    for (const phrase of ['reset inventory', 'RESET', 'RESET INVENTORY ', '']) {
      const wrong = await applyReset(resetToken, phrase);
      assert.equal(wrong.status, 400);
      assert.match(wrong.body.error, /Type RESET INVENTORY to confirm/);
    }
    const invalid = await applyReset('a'.repeat(64));
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, /invalid or was already used/);
    assert.equal((await itemNames()).length, 2);
    assert.deepEqual(preResetBackups(dataDir), []);

    // Rejected attempts do not consume the token; the successful one does.
    assert.equal((await applyReset(resetToken)).status, 200);
    const replay = await applyReset(resetToken);
    assert.equal(replay.status, 400);
    assert.match(replay.body.error, /invalid or was already used/);

    // Preparing again invalidates an older token, so a stale dialog can never apply.
    const stale = (await prepareReset()).body.resetToken;
    const current = (await prepareReset()).body.resetToken;
    assert.match((await applyReset(stale)).body.error, /invalid or was already used/);

    await new Promise(resolve => setTimeout(resolve, 3200));
    const expired = await applyReset(current);
    assert.equal(expired.status, 400);
    assert.match(expired.body.error, /expired/);
    assert.match((await applyReset(current)).body.error, /invalid or was already used/);

    // Only the one successful reset wrote a backup.
    assert.equal(preResetBackups(dataDir).length, 1);
  } finally {
    if (server) await stopServer(server);
    await removeDir(dataDir);
  }
});

test('a reset swaps in a fresh current-schema database and keeps settings and backups', async () => {
  const referenceDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-reset-reference-test-'));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-reset-apply-test-'));
  let server;
  try {
    // The reference is what a brand-new installation of this version creates.
    await stopServer(await startServer(referenceDir));
    const freshSchema = inspect(path.join(referenceDir, 'inventory.sqlite'), schema);

    // Configuration and earlier backups outside the inventory database must survive the reset.
    const settings = JSON.stringify({ enabled: true, provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'sk-reset-test' });
    await writeFile(path.join(dataDir, 'ai-settings.json'), settings);
    await mkdir(path.join(dataDir, 'pre-restore-backups'));
    await writeFile(path.join(dataDir, 'pre-restore-backups', 'pre-restore-2026-01-01T00-00-00Z.sqlite'), 'earlier restore');
    await mkdir(path.join(dataDir, 'pre-reset-backups'));
    await writeFile(path.join(dataDir, 'pre-reset-backups', 'pre-reset-2026-01-01T00-00-00Z.sqlite'), 'earlier reset');

    server = await startServer(dataDir);
    await seedInventory();
    const activePath = path.join(dataDir, 'inventory.sqlite');
    // Every inventory table holds data, so the reset is proven against all of them.
    for (const [table, count] of Object.entries(inspect(activePath, rowCounts))) assert.ok(count > 0, `${table} was not seeded`);

    const { body: prepared } = await prepareReset();
    const applied = await applyReset(prepared.resetToken);
    assert.equal(applied.status, 200);
    assert.equal(applied.body.message, 'Database reset completed.');
    assert.deepEqual(applied.body.counts, { categories: 0, items: 0, fields: 0, fieldValues: 0, photos: 0 });
    assert.match(applied.body.safetyBackup, /^pre-reset-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z(-[0-9a-f]{4})?\.sqlite$/);
    assert.ok(!JSON.stringify(applied.body).includes(dataDir));

    // The active database is exactly the fresh schema, stamped with the current version, and empty.
    inspect(activePath, connection => {
      assert.deepEqual(schema(connection), freshSchema);
      assert.equal(connection.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(Number(connection.pragma('user_version', { simple: true })), 1);
      assert.ok(Object.values(rowCounts(connection)).every(count => count === 0));
    });
    assert.deepEqual(await itemNames(), []);
    assert.deepEqual(await request('/api/categories'), []);
    const health = await request('/api/health');
    assert.equal(health.database, 'ok');
    assert.equal(health.ready, true);
    assert.equal(health.resetting, false);

    // The pre-reset backup is a verified, self-contained copy of the removed inventory.
    assert.deepEqual(preResetBackups(dataDir), [applied.body.safetyBackup, 'pre-reset-2026-01-01T00-00-00Z.sqlite'].sort());
    const backupPath = path.join(dataDir, 'pre-reset-backups', applied.body.safetyBackup);
    assert.deepEqual(listDir(path.join(dataDir, 'pre-reset-backups')).filter(name => name.includes('-wal') || name.includes('-shm')), []);
    inspect(backupPath, connection => {
      assert.equal(connection.pragma('integrity_check', { simple: true }), 'ok');
      assert.deepEqual(rowCounts(connection), { categories: 1, custom_fields: 1, item_field_values: 1, item_photos: 1, items: 2 });
    });
    assert.equal(await readFile(path.join(dataDir, 'ai-settings.json'), 'utf8'), settings);
    assert.equal(await readFile(path.join(dataDir, 'pre-restore-backups', 'pre-restore-2026-01-01T00-00-00Z.sqlite'), 'utf8'), 'earlier restore');
    assert.equal(await readFile(path.join(dataDir, 'pre-reset-backups', 'pre-reset-2026-01-01T00-00-00Z.sqlite'), 'utf8'), 'earlier reset');
    assert.deepEqual(listDir(dataDir).filter(name => name.startsWith('reset-candidate-')), []);

    // Foreign keys are enforced on the reopened connection: deleting a category cascades to its fields.
    const doomed = await request('/api/categories', json('POST', { name: 'Doomed' }));
    await request(`/api/categories/${doomed.id}/fields`, json('POST', { name: 'Size', type: 'text' }));
    await request(`/api/categories/${doomed.id}`, { method: 'DELETE' });
    assert.equal(inspect(activePath, connection => connection.prepare('SELECT COUNT(*) AS count FROM custom_fields').get().count), 0);

    // New inventory can be created immediately and survives a restart.
    const { category } = await seedInventory();
    await stopServer(server);
    server = await startServer(dataDir);
    assert.deepEqual(await itemNames(), ['Box A', 'Helios 44-2']);
    assert.equal((await request('/api/categories')).find(row => row.id === category.id).name, 'Photo gear');
    assert.equal(preResetBackups(dataDir).length, 2);
  } finally {
    if (server) await stopServer(server);
    await removeDir(dataDir);
    await removeDir(referenceDir);
  }
});

test('a failing reset step aborts or rolls back and leaves the original inventory usable', async () => {
  const failures = [
    ['safety-backup', /safety backup of the current database could not be created/, 0],
    ['safety-verify', /safety backup of the current database failed verification/, 0],
    ['fresh-database', /fresh database could not be created/, 1],
    ['fresh-verify', /fresh database failed its integrity or schema check/, 1],
    ['swap', /while the database was being replaced\. The previous inventory was recovered/, 1],
    ['after-swap', /post-reset health check\. The previous inventory was recovered/, 1]
  ];
  for (const [step, message, backups] of failures) {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), `inventory-reset-${step}-test-`));
    let server;
    try {
      server = await startServer(dataDir, { RESET_TEST_FAILURE: step });
      const { category } = await seedInventory();
      const before = await itemNames();

      const { body: prepared } = await prepareReset();
      const applied = await applyReset(prepared.resetToken);
      assert.equal(applied.status, 500, step);
      assert.match(applied.body.error, message, step);
      assert.ok(!applied.body.error.includes(dataDir), step);

      // The original inventory is intact, and the application is ready and writable again.
      assert.deepEqual(await itemNames(), before, step);
      assert.equal((await request('/api/restore/status')).ready, true, step);
      await request('/api/items', json('POST', { name: `Written after ${step}`, category_id: category.id }));
      // Only a verified backup is kept; no half-written candidate is left behind.
      assert.equal(preResetBackups(dataDir).length, backups, step);
      assert.deepEqual(listDir(dataDir).filter(name => name.startsWith('reset-candidate-')), [], step);
      // A failed apply consumed its token.
      assert.match((await applyReset(prepared.resetToken)).body.error, /invalid or was already used/, step);
    } finally {
      if (server) await stopServer(server);
      await removeDir(dataDir);
    }
  }
});

test('a reset never overlaps a restore, a backup download, or normal writes', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-reset-lock-test-'));
  let server;
  try {
    // The delays widen both maintenance windows so the concurrent requests are observable.
    server = await startServer(dataDir, { RESET_TEST_DELAY_MS: '1500', RESTORE_TEST_DELAY_MS: '1500' });
    const { category } = await seedInventory();
    const download = await fetch(`${base}/api/backup`);
    const backup = Buffer.from(await download.arrayBuffer());
    const upload = new FormData();
    upload.append('backup', new Blob([backup]), 'inventory.sqlite');
    const restoreToken = (await request('/api/restore/validate', { method: 'POST', body: upload })).restore_token;
    const applyRestore = () => fetch(`${base}/api/restore/apply`, json('POST', { restore_token: restoreToken, confirmation: 'RESTORE' }));

    const { body: first } = await prepareReset();
    const running = applyReset(first.resetToken);
    await new Promise(resolve => setTimeout(resolve, 300));

    const status = await request('/api/restore/status');
    assert.equal(status.ready, false);
    assert.equal(status.resetting, true);
    assert.equal((await prepareReset()).status, 409);
    assert.equal((await applyRestore()).status, 409);
    assert.equal((await fetch(`${base}/api/items`, json('POST', { name: 'During reset', category_id: category.id }))).status, 503);
    assert.equal((await fetch(`${base}/api/backup`)).status, 503);
    assert.equal((await running).status, 200);
    assert.deepEqual(await itemNames(), []);

    // The other way round: a running restore blocks both reset steps.
    const { body: second } = await prepareReset();
    const restoring = applyRestore();
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal((await request('/api/restore/status')).restoring, true);
    assert.equal((await prepareReset()).status, 409);
    const blocked = await applyReset(second.resetToken);
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /Another database restore or reset is already running/);
    assert.equal((await restoring).status, 200);
    assert.deepEqual(await itemNames(), ['Box A', 'Helios 44-2']);
  } finally {
    if (server) await stopServer(server);
    await removeDir(dataDir);
  }
});
