import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer, stopServer } from './serverProcess.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const backup = (dataDir, target) => spawnSync(process.execPath, ['server/src/cli/backup.js', target], {
  env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8'
});

test('the local backup command copies the live inventory while the authenticated server keeps running', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-backup-cli-'));
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-backup-cli-out-'));
  const server = await startServer(dataDir);
  try {
    const { base, fetch } = server;
    // The HTTP download is closed to anyone without an administrator session, as the updater is.
    assert.equal((await globalThis.fetch(`${base}/api/backup`)).status, 401);

    const category = await (await fetch(`${base}/api/categories`, json('POST', { name: 'Backup CLI' }))).json();
    await fetch(`${base}/api/items`, json('POST', { name: 'Before the update', category_id: category.id }));
    const target = path.join(outDir, 'inventory-pre-update.sqlite');
    const result = backup(dataDir, target);
    assert.equal(result.status, 0, result.stderr);
    // The server is still serving and writing after the copy.
    assert.equal((await fetch(`${base}/api/items`, json('POST', { name: 'After the copy', category_id: category.id }))).status, 201);

    const copy = new Database(target, { readonly: true });
    try {
      assert.equal(copy.pragma('quick_check', { simple: true }), 'ok');
      assert.deepEqual(copy.prepare('SELECT name FROM items ORDER BY id').all().map(row => row.name), ['Before the update']);
      // An inventory copy never contains the security store.
      assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('users', 'sessions', 'api_tokens')").get().n, 0);
    } finally {
      copy.close();
    }
    assert.equal(fs.existsSync(`${target}.partial`), false);
  } finally {
    await stopServer(server.child);
    await rm(dataDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
});

test('the local backup command fails without leaving a file when there is no inventory or no writable target', async () => {
  const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-backup-cli-empty-'));
  try {
    const target = path.join(emptyDir, 'out.sqlite');
    const missing = backup(path.join(emptyDir, 'no-data-here'), target);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No inventory database/);
    assert.equal(fs.existsSync(target), false);
    assert.equal(backup(emptyDir, '').status, 2, 'a target is required');
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});

test('the Proxmox updater takes its pre-update backup through the local command, never the HTTP download', () => {
  const script = fs.readFileSync('scripts/update.sh', 'utf8');
  const body = script.slice(script.indexOf('backup_database() {'), script.indexOf('\n}\n', script.indexOf('backup_database() {')));
  assert.doesNotMatch(script, /api\/backup/);
  assert.match(body, /runuser -u "\$IAL_USER" -- env DATA_DIR="\$IAL_DATA_DIR"/);
  assert.match(body, /node server\/src\/cli\/backup\.js "\$target"/);
  assert.match(body, /ial_die "Could not create a pre-update backup/);
  // The backup is taken before the code swap, and the rollback restores it.
  assert.ok(script.indexOf('\nbackup_database\n') > 0 && script.indexOf('\nbackup_database\n') < script.indexOf('ial_install_code'));
  assert.match(script, /ial_restore_database "\$BACKUP_PATH"/);
});
