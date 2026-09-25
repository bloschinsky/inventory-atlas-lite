import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let nextPort = 35000 + Math.floor(Math.random() * 1000);

async function startServer(dataDir) {
  const port = nextPort++;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/src/index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming ready.');
    try { if ((await fetch(`${base}/api/health`)).ok) return { child, base }; } catch {
      // Startup is asynchronous; keep polling within the short readiness deadline.
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

test('dashboard aggregates, filters, normalizes, and truncates inventory data', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-dashboard-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const get = async url => {
      const response = await fetch(`${server.base}${url}`);
      assert.equal(response.status, 200, `${url} returned ${response.status}`);
      return response.json();
    };
    const send = async (url, options) => {
      const response = await fetch(`${server.base}${url}`, options);
      assert.ok(response.ok, `${url} returned ${response.status}`);
      return response.json();
    };

    const empty = await get('/api/dashboard');
    assert.equal(empty.totalItems, 0);
    assert.deepEqual(empty.photoCoverage, { withPhotos: 0, withoutPhotos: 0, percentage: 0 });
    assert.deepEqual(empty.placement, { insideContainer: 0, directLocation: 0, unplaced: 0 });
    assert.deepEqual(empty.categoryDistribution, []);
    assert.deepEqual(empty.conditionDistribution, []);
    assert.deepEqual(empty.locationDistribution, []);
    assert.equal(empty.recentActivity.length, 31);
    assert.ok(empty.recentActivity.every(bucket => bucket.count === 0));
    assert.deepEqual(empty.fieldCoverage.map(field => field.percentage), [0, 0, 0, 0, 0, 0]);

    const categories = [];
    for (let index = 0; index < 8; index++) {
      categories.push(await send('/api/categories', json('POST', { name: `Category ${index + 1}` })));
    }
    const emptyCategory = await send('/api/categories', json('POST', { name: 'Empty category' }));
    const items = [];
    for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
      for (let count = 0; count < 8 - categoryIndex; count++) {
        const condition = [' Good ', 'good', 'GOOD', 'Fair', 'Poor', 'New', 'Used', 'Damaged', 'Unknown'][categoryIndex];
        items.push(await send('/api/items', json('POST', {
          name: `Item ${categoryIndex}-${count}`,
          category_id: categories[categoryIndex].id,
          condition,
          location: categoryIndex === 0 ? '  Shelf A  ' : '   '
        })));
      }
    }

    const container = items[0];
    const contained = items[1];
    await send(`/api/items/${contained.id}`, json('PUT', {
      name: contained.name,
      category_id: contained.category_id,
      condition: contained.condition,
      location: 'Legacy location',
      parent_item_id: container.id
    }));
    const form = new FormData();
    form.append('photos', new Blob([Buffer.from('8950', 'hex')], { type: 'image/png' }), 'one.png');
    form.append('photos', new Blob([Buffer.from('8951', 'hex')], { type: 'image/png' }), 'two.png');
    const photoResponse = await fetch(`${server.base}/api/items/${container.id}/photos`, { method: 'POST', body: form });
    assert.equal(photoResponse.status, 201);

    const database = new Database(path.join(dataDir, 'inventory.sqlite'));
    database.prepare("UPDATE items SET created_at = datetime('now', '-31 days') WHERE id = ?").run(items.at(-1).id);
    database.prepare("UPDATE items SET created_at = datetime('now', '-30 days', '+1 minute') WHERE id = ?").run(items.at(-2).id);
    database.close();

    const dashboard = await get('/api/dashboard');
    assert.equal(dashboard.totalItems, 36);
    assert.deepEqual(dashboard.photoCoverage, { withPhotos: 1, withoutPhotos: 35, percentage: 3 });
    assert.deepEqual(dashboard.placement, { insideContainer: 1, directLocation: 7, unplaced: 28 });
    assert.equal(Object.values(dashboard.placement).reduce((sum, count) => sum + count, 0), dashboard.totalItems);
    assert.equal(dashboard.addedLast30Days, 35);
    assert.equal(dashboard.recentActivity.reduce((sum, bucket) => sum + bucket.count, 0), 35);
    assert.deepEqual(dashboard.fieldCoverage.slice(0, 2), [
      { key: 'photos', count: 1, percentage: 3 },
      { key: 'placement', count: 8, percentage: 22 }
    ]);
    // The contained item inherits Shelf A from its container instead of its own Legacy location.
    assert.deepEqual(dashboard.locationDistribution, [
      { key: 'shelf a', label: 'Shelf A', count: 8 },
      { key: '__unknown__', label: 'Unknown', count: 28 }
    ]);
    assert.equal(dashboard.categoryDistribution.length, 7);
    assert.equal(dashboard.categoryDistribution.at(-1).label, 'Other');
    assert.equal(dashboard.categoryDistribution.at(-1).count, 3);
    assert.deepEqual(dashboard.conditionDistribution.slice(0, 2).map(row => [row.label, row.count]), [['Good', 21], ['Fair', 5]]);
    assert.equal(dashboard.conditionDistribution.at(-1).label, 'Other');

    const filtered = await get(`/api/dashboard?categoryId=${categories[7].id}`);
    assert.equal(filtered.totalItems, 1);
    assert.equal(filtered.categoryDistribution.find(row => row.categoryId === categories[7].id).selected, true);
    assert.equal(filtered.categoryDistribution.find(row => row.categoryId === categories[7].id).count, 1);
    assert.equal(filtered.conditionDistribution[0].label, 'Damaged');
    assert.equal(filtered.recentActivity.reduce((sum, bucket) => sum + bucket.count, 0), filtered.addedLast30Days);
    assert.deepEqual(filtered.locationDistribution, [{ key: '__unknown__', label: 'Unknown', count: 1 }]);

    const validEmpty = await get(`/api/dashboard?categoryId=${emptyCategory.id}`);
    assert.equal(validEmpty.totalItems, 0);
    assert.equal(validEmpty.categoryDistribution.find(row => row.categoryId === emptyCategory.id).selected, true);

    for (const [query, status] of [['categoryId=nope', 400], ['categoryId=1.5', 400], ['categoryId=999999', 404]]) {
      assert.equal((await fetch(`${server.base}/api/dashboard?${query}`)).status, status);
    }
  } finally {
    if (server) await stopServer(server.child);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('dashboard reports uncategorized rows in a compatible legacy database', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-dashboard-legacy-test-'));
  const databasePath = path.join(dataDir, 'inventory.sqlite');
  const legacy = new Database(databasePath);
  legacy.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE, created_at TEXT, updated_at TEXT);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category_id INTEGER, description TEXT, condition TEXT, location TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO items (uuid, name, category_id) VALUES ('uncategorized-uuid', 'Uncategorized item', NULL);
  `);
  legacy.close();
  let server;
  try {
    server = await startServer(dataDir);
    const response = await fetch(`${server.base}/api/dashboard`);
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.equal(dashboard.categoryDistribution[0].label, 'Uncategorized');
    assert.equal(dashboard.categoryDistribution[0].count, 1);
  } finally {
    if (server) await stopServer(server.child);
    await rm(dataDir, { recursive: true, force: true });
  }
});
