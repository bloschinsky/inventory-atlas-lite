import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let port = 33000 + Math.floor(Math.random() * 1000);
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

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function request(url, options) {
  const response = await fetch(`${base}${url}`, options);
  assert.ok(response.ok, `${options?.method || 'GET'} ${url} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const uploadBackup = async (bytes, filename = 'inventory-2026-09-17.sqlite', extra = []) => {
  const body = new FormData();
  body.append('backup', new Blob([bytes]), filename);
  for (const [field, content, name] of extra) body.append(field, new Blob([content]), name);
  const response = await fetch(`${base}/api/restore/validate`, { method: 'POST', body });
  return { status: response.status, body: await response.json() };
};

const applyRestore = async (token, confirmation = 'RESTORE') =>
  fetch(`${base}/api/restore/apply`, json('POST', { restore_token: token, confirmation }));

const downloadBackup = async () => {
  const response = await fetch(`${base}/api/backup`);
  assert.ok(response.ok, `GET /api/backup returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const stagedFiles = dataDir => fs.readdirSync(path.join(dataDir, 'restore-staging'));
const safetyBackups = dataDir => {
  const directory = path.join(dataDir, 'pre-restore-backups');
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
};

// A small but complete inventory: a container, a nested item with a custom field value and a photo.
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
  return { category, brand, box, lens };
}

const itemNames = async () => (await request('/api/items?pageSize=100')).items.map(item => item.name).sort();

test('a downloaded backup is validated, summarized, and fully restored over newer data', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const { category, lens } = await seedInventory();
    const backup = await downloadBackup();

    // Everything created after the backup must be gone once it is restored.
    await request('/api/items', json('POST', { name: 'Temporary item', category_id: category.id }));
    assert.deepEqual(await itemNames(), ['Box A', 'Helios 44-2', 'Temporary item']);

    const validated = await uploadBackup(backup);
    assert.equal(validated.status, 200);
    assert.deepEqual(validated.body.summary, {
      categories: 1, items: 2, fields: 1, fieldValues: 1, photos: 1, schemaVersion: 1, migratedFrom: null
    });
    assert.equal(validated.body.filename, 'inventory-2026-09-17.sqlite');
    assert.equal(validated.body.size_bytes, backup.length);
    assert.ok(validated.body.restore_token.length >= 32);
    // No server path may leak to the browser.
    assert.ok(!JSON.stringify(validated.body).includes(dataDir));

    const applied = await applyRestore(validated.body.restore_token);
    assert.equal(applied.status, 200);
    const result = await applied.json();
    assert.equal(result.message, 'Backup restored successfully');
    assert.equal(result.summary.items, 2);
    assert.match(result.safety_backup, /^pre-restore-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z(-[0-9a-f]{4})?\.sqlite$/);
    assert.ok(!result.safety_backup.includes(path.sep));

    // Replacement, not a merge.
    assert.deepEqual(await itemNames(), ['Box A', 'Helios 44-2']);
    const restoredLens = await request(`/api/items/${lens.uuid}`);
    assert.equal(restoredLens.parent.name, 'Box A');
    assert.equal(restoredLens.photos.length, 1);
    assert.equal(restoredLens.fields.find(field => field.name === 'Brand').value, 'KMZ');

    // The safety backup is a self-contained, valid database of the replaced state.
    assert.deepEqual(safetyBackups(dataDir), [result.safety_backup]);
    const safety = new Database(path.join(dataDir, 'pre-restore-backups', result.safety_backup), { readonly: true });
    assert.equal(safety.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(safety.prepare('SELECT COUNT(*) AS count FROM items').get().count, 3);
    safety.close();

    // The staged upload is cleaned after a successful restore.
    assert.deepEqual(stagedFiles(dataDir), []);

    // The restored state is in the database file itself, not in a leftover WAL of the replaced one.
    const active = new Database(path.join(dataDir, 'inventory.sqlite'), { readonly: true });
    assert.equal(active.prepare('SELECT COUNT(*) AS count FROM items').get().count, 2);
    assert.equal(active.prepare("SELECT COUNT(*) AS count FROM items WHERE name = 'Temporary item'").get().count, 0);
    active.close();

    // A new download after the restore is a valid backup of the restored data.
    const afterRestore = await downloadBackup();
    assert.equal(afterRestore.subarray(0, 15).toString(), 'SQLite format 3');
    const downloadedPath = path.join(dataDir, 'after-restore.sqlite');
    await writeFile(downloadedPath, afterRestore);
    const downloaded = new Database(downloadedPath, { readonly: true });
    assert.equal(downloaded.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(downloaded.prepare('SELECT COUNT(*) AS count FROM items').get().count, 2);
    assert.equal(downloaded.prepare('SELECT COUNT(*) AS count FROM item_photos').get().count, 1);
    downloaded.close();

    // The restored data survives a restart.
    await stopServer(server);
    server = await startServer(dataDir);
    assert.deepEqual(await itemNames(), ['Box A', 'Helios 44-2']);
    assert.equal((await request(`/api/items/${lens.uuid}`)).photos.length, 1);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('invalid uploads are rejected and leave the active database untouched', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-invalid-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const { category } = await seedInventory();
    const backup = await downloadBackup();
    const before = await itemNames();

    const notSqlite = await uploadBackup(Buffer.from('This is a plain text file, not a database.'), 'notes.sqlite');
    assert.equal(notSqlite.status, 400);
    assert.match(notSqlite.body.error, /not a SQLite database/);

    const empty = await uploadBackup(Buffer.alloc(0));
    assert.equal(empty.status, 400);

    // A real backup with its pages overwritten keeps the header but fails the integrity check.
    const corrupted = Buffer.from(backup);
    corrupted.fill(0x7a, 8192, Math.min(corrupted.length, 24576));
    const corruptedResult = await uploadBackup(corrupted);
    assert.equal(corruptedResult.status, 400);
    assert.match(corruptedResult.body.error, /integrity check|could not be read|not an Inventory Atlas Lite backup/);

    // A valid SQLite database from an unrelated application.
    const unrelatedPath = path.join(dataDir, 'unrelated.sqlite');
    const unrelated = new Database(unrelatedPath);
    unrelated.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES (\'hello\')');
    unrelated.close();
    const unrelatedResult = await uploadBackup(await readFile(unrelatedPath), 'other-app.db');
    assert.equal(unrelatedResult.status, 400);
    assert.match(unrelatedResult.body.error, /not an Inventory Atlas Lite backup/);

    // An incomplete inventory schema: the photo table is missing.
    const incompletePath = path.join(dataDir, 'incomplete.sqlite');
    const incomplete = new Database(incompletePath);
    incomplete.exec(`
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE items (id INTEGER PRIMARY KEY, uuid TEXT, name TEXT, category_id INTEGER, description TEXT, condition TEXT, location TEXT);
      CREATE TABLE custom_fields (id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT, type TEXT);
      CREATE TABLE item_field_values (id INTEGER PRIMARY KEY, item_id INTEGER, field_id INTEGER, value TEXT);
    `);
    incomplete.close();
    const incompleteResult = await uploadBackup(await readFile(incompletePath));
    assert.equal(incompleteResult.status, 400);

    // A backup written by a newer schema version than this application knows.
    const newerPath = path.join(dataDir, 'newer.sqlite');
    await writeFile(newerPath, backup);
    const newer = new Database(newerPath);
    newer.pragma('user_version = 99');
    newer.close();
    const newerResult = await uploadBackup(await readFile(newerPath));
    assert.equal(newerResult.status, 400);
    assert.match(newerResult.body.error, /newer version/);

    // More than one uploaded file.
    const multiple = await uploadBackup(backup, 'first.sqlite', [['backup', backup, 'second.sqlite']]);
    assert.equal(multiple.status, 400);
    assert.match(multiple.body.error, /exactly one backup file/);

    // Nothing was staged or changed by any rejected upload.
    assert.deepEqual(stagedFiles(dataDir), []);
    assert.deepEqual(safetyBackups(dataDir), []);
    assert.deepEqual(await itemNames(), before);
    await request('/api/items', json('POST', { name: 'Still writable', category_id: category.id }));
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a backup from before schema versioning is migrated on the staged copy and restored', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-legacy-test-'));
  const legacyPath = path.join(dataDir, 'legacy-backup.sqlite');
  const legacy = new Database(legacyPath);
  // The original MVP schema: no purchase, serial, or nesting columns and no user_version.
  legacy.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT, description TEXT, condition TEXT,
      location TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE custom_fields (id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE, name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL CHECK(type IN ('text', 'number', 'date', 'boolean')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, name));
    CREATE TABLE item_field_values (id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE, value TEXT, UNIQUE(item_id, field_id));
    CREATE TABLE item_photos (id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, filename TEXT NOT NULL, mime_type TEXT NOT NULL,
      data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO categories (name) VALUES ('Legacy cameras');
    INSERT INTO items (uuid, name, category_id) VALUES ('11111111-1111-4111-8111-111111111111', 'Zenit E', 1);
  `);
  assert.equal(Number(legacy.pragma('user_version', { simple: true })), 0);
  legacy.close();

  let server;
  try {
    server = await startServer(dataDir);
    const category = await request('/api/categories', json('POST', { name: 'Current' }));
    await request('/api/items', json('POST', { name: 'Current item', category_id: category.id }));

    const validated = await uploadBackup(await readFile(legacyPath), 'inventory-2026-01-01.sqlite');
    assert.equal(validated.status, 200);
    assert.equal(validated.body.summary.items, 1);
    assert.equal(validated.body.summary.migratedFrom, 0);
    assert.equal(validated.body.summary.schemaVersion, 1);

    // The uploaded source file on disk is untouched by validation.
    const source = new Database(legacyPath, { readonly: true });
    assert.equal(Number(source.pragma('user_version', { simple: true })), 0);
    assert.equal(source.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'serial_number'), false);
    source.close();

    const applied = await applyRestore(validated.body.restore_token);
    assert.equal(applied.status, 200);
    assert.deepEqual(await itemNames(), ['Zenit E']);
    // The restored database carries the current schema, so current features keep working.
    const restored = await request('/api/items', json('POST', {
      name: 'Added after restore', category_id: 1, serial_number: 'SN-1'
    }));
    assert.equal(restored.serial_number, 'SN-1');
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('restore tokens are single-use, confirmed explicitly, and expire with their staged file', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-token-test-'));
  let server;
  try {
    server = await startServer(dataDir, { RESTORE_TOKEN_TTL_MS: '1200' });
    await seedInventory();
    const backup = await downloadBackup();

    assert.equal((await applyRestore(undefined)).status, 400);
    assert.equal((await applyRestore('')).status, 400);
    assert.equal((await applyRestore('a'.repeat(64))).status, 400);

    const first = await uploadBackup(backup);
    assert.equal((await applyRestore(first.body.restore_token, 'restore')).status, 400);
    assert.equal((await applyRestore(first.body.restore_token, '')).status, 400);
    assert.equal((await applyRestore(first.body.restore_token, 'yes')).status, 400);
    // A rejected confirmation must not consume the token.
    assert.equal((await applyRestore(first.body.restore_token)).status, 200);
    // Replaying the same token afterwards is refused.
    assert.equal((await applyRestore(first.body.restore_token)).status, 400);

    const expiring = await uploadBackup(backup);
    assert.equal(stagedFiles(dataDir).length, 1);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const expired = await applyRestore(expiring.body.restore_token);
    assert.equal(expired.status, 400);
    assert.match((await expired.json()).error, /expired/);
    // The staged file of an expired session is removed.
    assert.deepEqual(stagedFiles(dataDir), []);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('an upload above the configured limit is refused with 413', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-limit-test-'));
  let server;
  try {
    // 0.05 MB is far below any real backup, so the seeded database is already too large.
    server = await startServer(dataDir, { RESTORE_MAX_UPLOAD_MB: '0.05' });
    await seedInventory();
    const backup = await downloadBackup();
    assert.ok(backup.length > 0.05 * 1024 * 1024);

    const response = await uploadBackup(backup);
    assert.equal(response.status, 413);
    assert.match(response.body.error, /restore limit/);
    // The partially written upload is cleaned up.
    assert.deepEqual(stagedFiles(dataDir), []);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('a failure after the swap rolls the safety backup back automatically', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-rollback-test-'));
  let server;
  try {
    server = await startServer(dataDir, { RESTORE_TEST_FAILURE: 'after-swap' });
    const { category } = await seedInventory();
    const backup = await downloadBackup();
    await request('/api/items', json('POST', { name: 'Temporary item', category_id: category.id }));
    const before = await itemNames();

    const validated = await uploadBackup(backup);
    const applied = await applyRestore(validated.body.restore_token);
    assert.equal(applied.status, 500);
    const failure = await applied.json();
    assert.match(failure.error, /previous database was recovered/);
    assert.ok(!failure.error.includes(dataDir));

    // The original data is back and the application accepts writes again.
    assert.deepEqual(await itemNames(), before);
    await request('/api/items', json('POST', { name: 'Written after rollback', category_id: category.id }));
    assert.equal((await request('/api/restore/status')).ready, true);
    // The recovery copy is kept, and the staged upload is gone.
    assert.equal(safetyBackups(dataDir).length, 1);
    assert.deepEqual(stagedFiles(dataDir), []);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('restores are serialized and normal writes are refused during the swap', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-lock-test-'));
  let server;
  try {
    // The delay widens the maintenance window so the concurrent requests are observable.
    server = await startServer(dataDir, { RESTORE_TEST_DELAY_MS: '1500' });
    const { category } = await seedInventory();
    const backup = await downloadBackup();

    const first = await uploadBackup(backup);
    const second = await uploadBackup(backup);
    const running = applyRestore(first.body.restore_token);
    await new Promise(resolve => setTimeout(resolve, 300));

    const concurrent = await applyRestore(second.body.restore_token);
    assert.equal(concurrent.status, 409);

    const write = await fetch(`${base}/api/items`, json('POST', { name: 'During restore', category_id: category.id }));
    assert.equal(write.status, 503);
    const readiness = await request('/api/restore/status');
    assert.equal(readiness.ready, false);
    assert.equal(readiness.restoring, true);
    // A backup download must not overlap the swap either.
    assert.equal((await fetch(`${base}/api/backup`)).status, 503);

    assert.equal((await running).status, 200);
    assert.equal((await request('/api/restore/status')).ready, true);
    // The application is fully usable again afterwards.
    await request('/api/items', json('POST', { name: 'After restore', category_id: category.id }));
    assert.equal((await readdir(path.join(dataDir, 'restore-staging'))).length, 1);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('staged uploads from an interrupted run are cleared when the server starts', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-restore-staging-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    await seedInventory();
    const backup = await downloadBackup();
    const validated = await uploadBackup(backup);
    assert.equal(stagedFiles(dataDir).length, 1);

    // A restart is an interruption: the staged file and its token cannot survive it.
    await stopServer(server);
    server = await startServer(dataDir);
    assert.deepEqual(stagedFiles(dataDir), []);
    assert.equal((await applyRestore(validated.body.restore_token)).status, 400);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
