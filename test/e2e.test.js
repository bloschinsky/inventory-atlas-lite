import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const port = 32000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;

async function startServer(dataDir) {
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
