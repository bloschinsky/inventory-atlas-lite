import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let port = 32000 + Math.floor(Math.random() * 1000);
let base = `http://127.0.0.1:${port}`;

// Every start claims a fresh port so a previous server socket can never block the next one.
async function startServer(dataDir) {
  port += 1;
  base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/src/index.js', '--production'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 50; attempt++) {
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

async function request(url, options) {
  const response = await fetch(`${base}${url}`, options);
  assert.ok(response.ok, `${options?.method || 'GET'} ${url} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function failedStatus(url, options) {
  const response = await fetch(`${base}${url}`, options);
  assert.ok(!response.ok, `${options?.method || 'GET'} ${url} unexpectedly succeeded`);
  return response.status;
}

const saveItem = (item, changes) => json('PUT', { name: item.name, category_id: item.category_id, ...changes });

test('inventory acceptance path persists and produces a valid backup', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const category = await request('/api/categories', json('POST', { name: 'Cameras' }));
    const brand = await request(`/api/categories/${category.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));
    const year = await request(`/api/categories/${category.id}/fields`, json('POST', { name: 'Year', type: 'number' }));
    const item = await request('/api/items', json('POST', {
      name: 'Olympus Pen F', category_id: category.id, description: 'Half-frame camera',
      condition: 'Good', location: 'Cabinet A', field_values: { [brand.id]: 'Olympus', [year.id]: '1963' }
    }));

    const photoData = new FormData();
    photoData.append('photos', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'camera.png');
    const photos = await request(`/api/items/${item.id}/photos`, { method: 'POST', body: photoData });
    assert.equal(photos.length, 1);

    const list = await request(`/api/items?search=Olympus&categoryId=${category.id}`);
    assert.equal(list.pagination.total, 1);
    assert.ok(list.items[0].thumbnail_id);

    const backupResponse = await fetch(`${base}/api/backup`);
    assert.ok(backupResponse.ok);
    const backupPath = path.join(dataDir, 'checked-backup.sqlite');
    await writeFile(backupPath, Buffer.from(await backupResponse.arrayBuffer()));
    const backup = new Database(backupPath, { readonly: true });
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM items').get().count, 1);
    backup.close();

    await stopServer(server);
    server = await startServer(dataDir);
    const persisted = await request(`/api/items/${item.id}`);
    assert.equal(persisted.name, 'Olympus Pen F');
    assert.equal(persisted.photos.length, 1);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('item nesting keeps a valid hierarchy and survives restart and backup', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-nesting-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const category = await request('/api/categories', json('POST', { name: 'Storage' }));
    const create = name => request('/api/items', json('POST', { name, category_id: category.id }));
    const boxA = await create('Box A');
    const boxB = await create('Box B');
    const lens = await create('Helios 44-2');

    // Assign a parent, then read it back from both sides of the relationship.
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxA.id }));
    const nested = await request(`/api/items/${lens.id}`);
    assert.equal(nested.parent_item_id, boxA.id);
    assert.equal(nested.parent.name, 'Box A');
    const containerA = await request(`/api/items/${boxA.id}`);
    assert.deepEqual(containerA.children.map(child => child.name), ['Helios 44-2']);
    assert.equal(containerA.children[0].category_name, 'Storage');

    // Move to another container and then back to the top level.
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxB.id }));
    assert.equal((await request(`/api/items/${boxB.id}`)).children.length, 1);
    assert.equal((await request(`/api/items/${boxA.id}`)).children.length, 0);
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: null }));
    assert.equal((await request(`/api/items/${lens.id}`)).parent_item_id, null);

    // Parent candidates exclude the edited item and its descendants.
    await request(`/api/items/${boxB.id}`, saveItem(boxB, { parent_item_id: boxA.id }));
    const candidates = await request(`/api/items/parent-candidates?excludeId=${boxA.id}`);
    assert.deepEqual(candidates.map(candidate => candidate.name).sort(), ['Helios 44-2']);

    // Cycles are rejected: self-parenting, a direct cycle, and an indirect one.
    assert.equal(await failedStatus(`/api/items/${boxA.id}`, saveItem(boxA, { parent_item_id: boxA.id })), 400);
    assert.equal(await failedStatus(`/api/items/${boxA.id}`, saveItem(boxA, { parent_item_id: boxB.id })), 400);
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxB.id }));
    assert.equal(await failedStatus(`/api/items/${boxA.id}`, saveItem(boxA, { parent_item_id: lens.id })), 400);
    assert.equal(await failedStatus(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: 999999 })), 400);

    // A container with contents cannot be deleted until the contents are moved away.
    assert.equal(await failedStatus(`/api/items/${boxB.id}`, { method: 'DELETE' }), 409);
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: null }));
    await request(`/api/items/${boxB.id}`, { method: 'DELETE' });
    assert.equal((await request(`/api/items/${boxA.id}`)).children.length, 0);

    // The remaining hierarchy survives a backup and a restart.
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxA.id }));
    const backupResponse = await fetch(`${base}/api/backup`);
    assert.ok(backupResponse.ok);
    const backupPath = path.join(dataDir, 'nesting-backup.sqlite');
    await writeFile(backupPath, Buffer.from(await backupResponse.arrayBuffer()));
    const backup = new Database(backupPath, { readonly: true });
    assert.equal(backup.prepare('SELECT parent_item_id FROM items WHERE id = ?').get(lens.id).parent_item_id, boxA.id);
    backup.close();

    await stopServer(server);
    server = await startServer(dataDir);
    assert.equal((await request(`/api/items/${lens.id}`)).parent.name, 'Box A');
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});
