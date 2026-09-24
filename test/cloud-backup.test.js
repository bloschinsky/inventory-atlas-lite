import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startCloudProviderStub } from './e2e/cloudProviderStub.js';

/*
  Cloud backup without any real Dropbox or Google account: the adapters talk to a local stub of both
  APIs, the services run against a temporary database, and the API is exercised on a spawned server.
*/
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-cloud-backup-test-'));
const stub = await startCloudProviderStub();
Object.assign(process.env, {
  CLOUD_BACKUP_TEST_ENDPOINT: stub.url,
  DROPBOX_APP_KEY: 'dropbox-test-key', DROPBOX_APP_SECRET: 'dropbox-test-secret',
  GOOGLE_CLIENT_ID: 'google-test-client', GOOGLE_CLIENT_SECRET: 'google-test-secret'
});
test.after(() => stub.close());

const { applySchema } = await import('../server/src/db.js');
const { callbackPath, dropboxConfig, googleDriveConfig } = await import('../server/src/cloudBackup/cloudBackupConfig.js');
const { JsonFileStore } = await import('../server/src/cloudBackup/jsonFileStore.js');
const { CloudBackupScheduler } = await import('../server/src/cloudBackup/cloudBackupScheduler.js');
const { backupFileName, isOwnBackupName, nextRunAfter, validateSettings } = await import('../server/src/cloudBackup/schedule.js');
const { DatabaseMaintenance } = await import('../server/src/restore/databaseMaintenance.js');
const { BackupService } = await import('../server/src/services/backupService.js');
const { CloudBackupService, defaultCloudBackupState } = await import('../server/src/services/cloudBackupService.js');
const { CloudConnectionService } = await import('../server/src/services/cloudConnectionService.js');
const { CloudAppSettingsService } = await import('../server/src/services/cloudAppSettingsService.js');
const { CloudStorageHttp } = await import('../server/src/integrations/cloudStorageHttp.js');
const { DropboxStorageProvider } = await import('../server/src/integrations/dropboxStorageProvider.js');
const { GoogleDriveStorageProvider } = await import('../server/src/integrations/googleDriveStorageProvider.js');

const CHUNK = 256 * 1024;
const ORIGIN = 'http://inventory.test';
const environment = { dropbox: dropboxConfig, 'google-drive': googleDriveConfig };

// The two adapters and their app credentials, as the composition root builds them.
function cloudServices(credentialsStore, appEnvironment = environment) {
  const appSettings = new CloudAppSettingsService({ store: credentialsStore, environment: appEnvironment });
  const providers = [
    new DropboxStorageProvider({ endpoints: dropboxConfig.endpoints, app: () => appSettings.resolve('dropbox'), chunkBytes: CHUNK }),
    new GoogleDriveStorageProvider({ endpoints: googleDriveConfig.endpoints, app: () => appSettings.resolve('google-drive'), chunkBytes: CHUNK })
  ];
  return new CloudConnectionService({ providers, credentialsStore, appSettings, callbackPath });
}

// A real SQLite inventory with a photo large enough to need several upload chunks.
function createInventory(dir) {
  const db = new Database(path.join(dir, 'inventory.sqlite'));
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  applySchema(db);
  const category = db.prepare("INSERT INTO categories (name) VALUES ('Cameras')").run().lastInsertRowid;
  const item = db.prepare("INSERT INTO items (uuid, name, category_id) VALUES (?, 'Zenit E', ?)").run(crypto.randomUUID(), category).lastInsertRowid;
  db.prepare("INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES (?, 'zenit.png', 'image/png', ?)").run(item, crypto.randomBytes(700 * 1024));
  return db;
}

async function build() {
  const dir = await mkdtemp(path.join(process.env.DATA_DIR, 'case-'));
  const db = createInventory(dir);
  const maintenance = new DatabaseMaintenance({ db, database: { path: path.join(dir, 'inventory.sqlite') }, dataDir: dir });
  const backupService = new BackupService({ db, maintenance });
  const snapshots = [];
  const createSnapshot = backupService.createSnapshot.bind(backupService);
  backupService.createSnapshot = async () => { const file = await createSnapshot(); snapshots.push(file); return file; };
  const credentialsFile = path.join(dir, 'cloud-backup-credentials.json');
  const stateFile = path.join(dir, 'cloud-backup.json');
  const connections = cloudServices(new JsonFileStore({ file: credentialsFile, defaults: () => ({}) }));
  const clock = { now: new Date('2026-09-24T10:00:00Z') };
  const stateStore = new JsonFileStore({ file: stateFile, defaults: defaultCloudBackupState });
  const service = new CloudBackupService({ backupService, connections, stateStore, timezone: () => 'UTC', now: () => clock.now });
  return { dir, db, maintenance, backupService, snapshots, connections, service, stateStore, clock, credentialsFile, stateFile };
}

// Plays the browser: Connect, follow the provider's redirect, and hand the callback to the service.
async function connect(connections, id, { cookie } = {}) {
  const { state, authorizationUrl } = connections.begin(id, ORIGIN);
  const response = await fetch(authorizationUrl, { redirect: 'manual' });
  const callback = new URL(response.headers.get('location'));
  assert.equal(`${callback.origin}${callback.pathname}`, `${ORIGIN}${callbackPath}`);
  return connections.complete({
    state: callback.searchParams.get('state'), cookieState: cookie ?? state, code: callback.searchParams.get('code'), error: callback.searchParams.get('error')
  });
}

const rejects = (promise, status, pattern, code) => assert.rejects(promise, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.match(error.message, pattern);
  if (code) assert.equal(error.code, code);
  return true;
});

const fileContains = (file, secrets) => {
  const text = fs.readFileSync(file).toString('latin1');
  return secrets.filter(secret => text.includes(secret));
};

const countItems = bytes => {
  const file = path.join(process.env.DATA_DIR, `uploaded-${crypto.randomUUID()}.sqlite`);
  fs.writeFileSync(file, bytes);
  const copy = new Database(file, { readonly: true });
  try {
    assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
    return copy.prepare('SELECT COUNT(*) AS count FROM items').get().count;
  } finally { copy.close(); }
};

test.beforeEach(() => stub.reset());

test('schedule rules compute the next local run and validate settings', () => {
  const from = new Date(2026, 8, 24, 10, 0); // Thursday, 10:00 local time
  assert.equal(nextRunAfter({ frequency: 'daily', time: '03:00' }, from), new Date(2026, 8, 25, 3, 0).toISOString());
  assert.equal(nextRunAfter({ frequency: 'daily', time: '10:30' }, from), new Date(2026, 8, 24, 10, 30).toISOString());
  assert.equal(nextRunAfter({ frequency: 'daily', time: '10:00' }, from), new Date(2026, 8, 25, 10, 0).toISOString());
  assert.equal(nextRunAfter({ frequency: 'weekly', weekday: 1, time: '02:15' }, from), new Date(2026, 8, 28, 2, 15).toISOString());
  assert.equal(nextRunAfter({ frequency: 'weekly', weekday: 4, time: '09:00' }, from), new Date(2026, 9, 1, 9, 0).toISOString());

  const valid = { schedule: { enabled: true, provider: 'dropbox', frequency: 'weekly', weekday: 2, time: '04:30' }, retention: { mode: 'last', keep: 5 } };
  assert.deepEqual(validateSettings(valid, ['dropbox']), valid);
  assert.throws(() => validateSettings(valid, []), /connected provider/);
  assert.throws(() => validateSettings({ ...valid, schedule: { ...valid.schedule, time: '25:00' } }, ['dropbox']), /HH:MM/);
  assert.throws(() => validateSettings({ ...valid, schedule: { ...valid.schedule, frequency: 'hourly' } }, ['dropbox']), /daily or weekly/);
  assert.throws(() => validateSettings({ ...valid, retention: { mode: 'last', keep: 0 } }, ['dropbox']), /Keep between/);

  assert.equal(backupFileName(new Date('2026-09-24T08:05:09.123Z')), 'inventory-atlas-lite-2026-09-24T08-05-09Z.sqlite');
  assert.equal(isOwnBackupName('inventory-atlas-lite-2026-09-24T08-05-09Z.sqlite'), true);
  for (const name of ['inventory-2026-09-24.sqlite', 'inventory-atlas-lite-2026-09-24T08-05-09Z.sqlite.bak', 'notes.txt']) assert.equal(isOwnBackupName(name), false);
});

test('OAuth connects both providers with PKCE and stores only the refresh token, outside the database', async () => {
  const { connections, credentialsFile, dir } = await build();
  const { authorizationUrl } = connections.begin('dropbox', ORIGIN);
  const dropboxUrl = new URL(authorizationUrl);
  assert.equal(dropboxUrl.searchParams.get('token_access_type'), 'offline');
  assert.equal(dropboxUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(dropboxUrl.searchParams.get('scope'), 'account_info.read files.metadata.read files.content.write');
  assert.ok(!authorizationUrl.includes('dropbox-test-secret'));
  const googleUrl = new URL(connections.begin('google-drive', ORIGIN).authorizationUrl);
  assert.equal(googleUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(googleUrl.searchParams.get('access_type'), 'offline');

  assert.deepEqual(await connect(connections, 'dropbox'), { provider: 'dropbox', label: 'Dropbox', account: 'Stub Dropbox User (dropbox-user@example.test)' });
  assert.equal((await connect(connections, 'google-drive')).account, 'Stub Google User (drive-user@example.test)');

  const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  assert.match(stored.dropbox.refreshToken, /^dropbox-refresh-secret-/);
  assert.match(stored['google-drive'].refreshToken, /^google-refresh-secret-/);
  // Access tokens stay in memory only.
  assert.deepEqual(fileContains(credentialsFile, [...stub.accessTokens.keys()]), []);
  if (process.platform !== 'win32') assert.equal(fs.statSync(credentialsFile).mode & 0o777, 0o600);

  const publicView = JSON.stringify(connections.publicProviders());
  assert.deepEqual(stub.secrets().filter(secret => publicView.includes(secret)), []);
  assert.ok(!publicView.includes('test-secret'));
  assert.deepEqual(connections.publicProviders().map(provider => [provider.id, provider.connected, provider.redirectUri]),
    [['dropbox', true, null], ['google-drive', true, null]]);
  assert.deepEqual(fileContains(path.join(dir, 'inventory.sqlite'), stub.secrets()), []);
});

test('the OAuth callback is refused without the matching browser state, on replay, and when access is denied', async () => {
  const { connections, credentialsFile } = await build();
  await rejects(connect(connections, 'dropbox', { cookie: 'forged-state' }), 400, /could not be verified/);
  assert.equal(fs.existsSync(credentialsFile), false);
  assert.match(connections.lastConnectError.message, /could not be verified/);

  const { state, authorizationUrl } = connections.begin('dropbox', ORIGIN);
  const callback = new URL((await fetch(authorizationUrl, { redirect: 'manual' })).headers.get('location'));
  const code = callback.searchParams.get('code');
  await connections.complete({ state, cookieState: state, code });
  await rejects(connections.complete({ state, cookieState: state, code }), 400, /could not be verified/);

  stub.denyNext = true;
  await rejects(connect(connections, 'google-drive'), 400, /Google Drive access was not granted/);
  assert.deepEqual(connections.connectedIds(), ['dropbox']);
  await rejects(connections.complete({ state: undefined, cookieState: undefined }), 400, /could not be verified/);
});

test('a manual Dropbox backup uploads the consistent snapshot in chunks and records the result', async () => {
  const { service, connections, snapshots, stateStore, clock } = await build();
  await connect(connections, 'dropbox');
  const result = await service.run('dropbox');

  assert.equal(snapshots.length, 1, 'the backup used the shared snapshot path once');
  assert.equal(fs.existsSync(snapshots[0]), false, 'the temporary snapshot was removed');
  assert.equal(result.ok, true);
  assert.equal(result.file, backupFileName(clock.now));
  assert.deepEqual(stub.dropboxNames(), [result.file]);
  const uploaded = stub.dropboxFiles.get(`/backups/${result.file}`.toLowerCase()).data;
  assert.equal(uploaded.length, result.size);
  assert.ok(stub.requests.some(request => request.path.endsWith('upload_session/append_v2')), 'the upload used several chunks');
  assert.equal(countItems(uploaded), 1);

  const state = stateStore.read();
  assert.deepEqual(state.lastSuccess, { at: clock.now.toISOString(), provider: 'dropbox', file: result.file });
  assert.equal(state.history[0].trigger, 'manual');
  assert.equal(state.history[0].cleanup, null);
});

test('a Google Drive backup creates the visible folder and uploads with a resumable session', async () => {
  const { service, connections } = await build();
  await connect(connections, 'google-drive');
  const result = await service.run('google-drive');
  const root = [...stub.googleFiles.values()].find(file => file.name === 'Inventory Atlas Lite');
  const folder = [...stub.googleFiles.values()].find(file => file.name === 'Backups');
  assert.deepEqual(root.parents, ['root']);
  assert.deepEqual(folder.parents, [root.id]);
  const uploaded = [...stub.googleFiles.values()].find(file => file.name === result.file);
  assert.deepEqual(uploaded.parents, [folder.id]);
  assert.equal(countItems(uploaded.data), 1);
  assert.ok(stub.requests.filter(request => request.path.startsWith('/google/upload/session/')).length > 1);

  // A second backup reuses the same folders.
  await service.run('google-drive').catch(() => {});
  assert.equal([...stub.googleFiles.values()].filter(file => file.name === 'Backups').length, 1);
});

test('a failed upload leaves the live database untouched and is reported with a normalized error', async () => {
  const { service, connections, db, snapshots, stateStore } = await build();
  await connect(connections, 'dropbox');
  const before = db.prepare('SELECT COUNT(*) AS items FROM items').get();
  stub.failures.push({ match: 'upload_session/finish', status: 409, body: { error_summary: 'path/insufficient_space/' }, times: 1 });
  await rejects(service.run('dropbox'), 507, /Dropbox is full/, 'quota');

  assert.deepEqual(db.prepare('SELECT COUNT(*) AS items FROM items').get(), before);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(fs.existsSync(snapshots[0]), false);
  const state = stateStore.read();
  assert.equal(state.lastSuccess, null);
  assert.equal(state.history[0].ok, false);
  assert.match(state.history[0].error, /Dropbox is full/);
  assert.equal(service.running, null);

  // Nothing about the failure blocks the next backup.
  assert.equal((await service.run('dropbox')).ok, true);
});

test('retention keeps the newest N own backups and never touches other files', async () => {
  const { service, connections, stateStore, clock } = await build();
  await connect(connections, 'dropbox');
  for (const name of ['notes.txt', 'inventory-2026-01-01.sqlite', 'inventory-atlas-lite-2026-01-01T00-00-00Z.sqlite', 'inventory-atlas-lite-2026-01-02T00-00-00Z.sqlite']) {
    stub.dropboxFile(`/Backups/${name}`, Buffer.from('other'));
  }
  stub.dropboxFile('/Elsewhere/inventory-atlas-lite-2020-01-01T00-00-00Z.sqlite', Buffer.from('other folder'));
  stateStore.update(state => { state.settings.retention = { mode: 'last', keep: 2 }; });

  const first = await service.run('dropbox');
  assert.deepEqual(first.cleanup, { ok: true, deleted: 1, error: null });
  clock.now = new Date('2026-09-25T10:00:00Z');
  const second = await service.run('dropbox');
  assert.deepEqual(second.cleanup, { ok: true, deleted: 1, error: null });
  assert.deepEqual(stub.dropboxNames(), [first.file, second.file, 'inventory-2026-01-01.sqlite', 'inventory-atlas-lite-2020-01-01T00-00-00Z.sqlite', 'notes.txt'].sort());
  assert.ok(stub.dropboxFiles.has('/elsewhere/inventory-atlas-lite-2020-01-01t00-00-00z.sqlite'));

  // A cleanup failure is reported separately and the upload still counts as successful.
  clock.now = new Date('2026-09-26T10:00:00Z');
  stub.failures.push({ match: 'delete_v2', status: 500, body: { error_summary: 'internal_error/' }, times: 1 });
  const third = await service.run('dropbox');
  assert.equal(third.ok, true);
  assert.equal(third.cleanup.ok, false);
  assert.match(third.cleanup.error, /unavailable/);
  assert.equal(stateStore.read().lastSuccess.file, third.file);
});

test('expired access tokens are refreshed for unattended runs, and a revoked grant is reported', async () => {
  const { service, connections } = await build();
  await connect(connections, 'dropbox');

  // A restart forgets every access token; the refresh token gets a new one.
  connections.accessTokens.clear();
  const tokenRequests = () => stub.requests.filter(request => request.path === '/dropbox/oauth2/token').length;
  const before = tokenRequests();
  assert.equal((await service.run('dropbox')).ok, true);
  assert.equal(tokenRequests(), before + 1);

  // An access token the provider rejects before its expiry is refreshed once and the call retried.
  connections.accessTokens.set('dropbox', { token: 'rejected-token', expiresAt: Date.now() + 3600_000 });
  assert.match((await connections.test('dropbox')).message, /^Connected to Dropbox as Stub Dropbox User/);

  stub.revokeAll();
  connections.accessTokens.clear();
  await rejects(service.run('dropbox'), 502, /Dropbox access has expired or was revoked/, 'auth_revoked');
});

test('disconnect revokes the grant, removes the credentials, and switches off a schedule using it', async () => {
  const { service, connections, credentialsFile, stateStore } = await build();
  await connect(connections, 'dropbox');
  await connect(connections, 'google-drive');
  const refreshToken = JSON.parse(fs.readFileSync(credentialsFile, 'utf8')).dropbox.refreshToken;
  service.updateSettings({ schedule: { enabled: true, provider: 'dropbox', frequency: 'daily', time: '03:00' }, retention: { mode: 'all' } });

  assert.deepEqual(await service.disconnect('dropbox'), { revoked: true });
  assert.equal(stub.refreshTokens.get(refreshToken).revoked, true);
  const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  assert.equal(stored.dropbox, undefined);
  assert.ok(stored['google-drive']);
  assert.deepEqual(connections.connectedIds(), ['google-drive']);
  await rejects(service.run('dropbox'), 409, /Dropbox is not connected/);
  assert.equal(stateStore.read().settings.schedule.enabled, false);
  assert.equal(stateStore.read().nextRunAt, null);

  // Even an unreachable provider cannot keep the credentials alive.
  stub.failures.push({ match: '/google/revoke', status: 503, times: 1 });
  assert.deepEqual(await service.disconnect('google-drive'), { revoked: false });
  assert.deepEqual(connections.connectedIds(), []);
});

test('scheduled runs survive a restart and never run the same slot twice', async () => {
  const { service, connections, stateStore, clock, backupService, stateFile } = await build();
  await connect(connections, 'dropbox');
  clock.now = new Date(2026, 8, 24, 2, 0);
  service.updateSettings({ schedule: { enabled: true, provider: 'dropbox', frequency: 'daily', time: '03:00' }, retention: { mode: 'all' } });
  assert.equal(stateStore.read().nextRunAt, new Date(2026, 8, 24, 3, 0).toISOString());
  const scheduler = new CloudBackupScheduler({ cloudBackupService: service });

  await scheduler.tick();
  assert.equal(stub.dropboxNames().length, 0, 'nothing runs before the scheduled time');

  clock.now = new Date(2026, 8, 24, 3, 0, 20);
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(stub.dropboxNames().length, 1, 'the due slot ran exactly once');
  assert.equal(stateStore.read().history[0].trigger, 'scheduled');
  assert.equal(stateStore.read().nextRunAt, new Date(2026, 8, 25, 3, 0).toISOString());

  // A restarted process reads the same state file and does not repeat the slot.
  const restarted = new CloudBackupService({
    backupService, connections, stateStore: new JsonFileStore({ file: stateFile, defaults: defaultCloudBackupState }), timezone: () => 'UTC', now: () => clock.now
  });
  const restartedScheduler = new CloudBackupScheduler({ cloudBackupService: restarted });
  clock.now = new Date(2026, 8, 24, 3, 1);
  await restartedScheduler.tick();
  assert.equal(stub.dropboxNames().length, 1);

  // Days missed while the server was down are caught up with one run, not one per missed slot.
  clock.now = new Date(2026, 8, 27, 12, 0);
  await restartedScheduler.tick();
  await restartedScheduler.tick();
  assert.equal(stub.dropboxNames().length, 2);
  assert.equal(stateStore.read().nextRunAt, new Date(2026, 8, 28, 3, 0).toISOString());

  // A scheduled failure is recorded without throwing, and the next slot is still planned.
  stub.failures.push({ match: 'upload_session/start', status: 503, times: 1 });
  clock.now = new Date(2026, 8, 28, 3, 0, 5);
  await restartedScheduler.tick();
  assert.match(stateStore.read().history[0].error, /Dropbox is unavailable/);
  assert.equal(stateStore.read().nextRunAt, new Date(2026, 8, 29, 3, 0).toISOString());
});

test('only one cloud backup runs at a time', async () => {
  const { service, connections, stateStore, maintenance } = await build();
  await connect(connections, 'dropbox');
  const first = service.run('dropbox');
  await rejects(service.run('dropbox'), 409, /already running/);
  await rejects(service.run('dropbox', 'scheduled'), 409, /already running/);
  assert.equal((await first).ok, true);
  assert.match(stateStore.read().history[1].error, /Skipped because another cloud backup was running/);

  // The snapshot respects the restore and reset lock like a download does.
  maintenance.acquire('restore');
  await rejects(service.run('dropbox'), 503, /being restored or reset/);
  maintenance.release();
});

test('downloaded and uploaded backups never contain cloud credentials', async () => {
  const { service, connections, backupService } = await build();
  await connect(connections, 'dropbox');
  await connect(connections, 'google-drive');
  const download = await backupService.createDownload();
  try {
    assert.deepEqual(fileContains(download.file, stub.secrets()), []);
  } finally { fs.rmSync(download.file, { force: true }); }
  const result = await service.run('dropbox');
  const uploaded = stub.dropboxFiles.get(`/backups/${result.file}`.toLowerCase()).data.toString('latin1');
  assert.deepEqual(stub.secrets().filter(secret => uploaded.includes(secret)), []);
});

test('provider failures are normalized into application errors', async () => {
  const hanging = createServer(() => {});
  await new Promise(resolve => hanging.listen(0, '127.0.0.1', resolve));
  const http = new CloudStorageHttp({ label: 'Dropbox' });
  await rejects(http.send(`http://127.0.0.1:${hanging.address().port}/`, { timeoutMs: 50 }), 504, /did not answer in time/, 'timeout');
  hanging.closeAllConnections();
  await new Promise(resolve => hanging.close(resolve));
  await rejects(http.send(`http://127.0.0.1:${hanging.address()?.port || 1}/`), 502, /Could not reach Dropbox/, 'unavailable');

  assert.throws(() => http.fail({ status: 429 }, 'list the backups'), error => error.code === 'rate_limited' && error.status === 503);
  assert.throws(() => http.fail({ status: 503 }, 'list the backups'), error => error.code === 'unavailable');
  assert.throws(() => http.fail({ status: 401 }, 'list the backups'), error => error.code === 'unauthorized');
  assert.throws(() => http.failToken({ status: 400, body: { error: 'invalid_grant' } }, 'refresh'), error => error.code === 'auth_revoked');
  assert.throws(() => http.failToken({ status: 401, body: { error: 'invalid_client' } }, 'refresh'), error => error.code === 'not_configured');

  const drive = new GoogleDriveStorageProvider({ endpoints: googleDriveConfig.endpoints, app: () => googleDriveConfig });
  assert.throws(() => drive.fail({ status: 403, body: { error: { errors: [{ reason: 'storageQuotaExceeded' }] } } }, 'upload the backup'), error => error.code === 'quota');
  assert.throws(() => drive.fail({ status: 403, body: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } } }, 'upload the backup'), error => error.code === 'rate_limited');
  assert.throws(() => drive.fail({ status: 404, body: { error: { message: 'File not found' } } }, 'upload the backup'), error => error.code === 'invalid_destination');
  assert.throws(() => drive.fail({ status: 400, body: {} }, 'upload the backup'), error => error.code === 'upload_failed');
  const dropbox = new DropboxStorageProvider({ endpoints: dropboxConfig.endpoints, app: () => dropboxConfig });
  assert.throws(() => dropbox.fail({ status: 409, body: { error_summary: 'path/no_write_permission/' } }, 'upload the backup'), error => error.code === 'invalid_destination');

  const { connections } = await build();
  await rejects(connections.withAccess('dropbox', () => {}), 409, /Dropbox is not connected/);
  await rejects(connections.test('onedrive'), 404, /Unknown cloud storage provider/);
  const unconfigured = cloudServices(new JsonFileStore({ file: path.join(process.env.DATA_DIR, 'none.json'), defaults: () => ({}) }), {});
  assert.throws(() => unconfigured.begin('google-drive', ORIGIN), /Google Drive is not configured. Enter its app credentials in Settings → Cloud Backup, or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);
});

test('app credentials entered in Settings are stored outside SQLite, masked, and tied to their app', async () => {
  const dir = await mkdtemp(path.join(process.env.DATA_DIR, 'apps-'));
  const file = path.join(dir, 'cloud-backup-credentials.json');
  // Dropbox comes from the environment; Google Drive is entered in Settings.
  const connections = cloudServices(new JsonFileStore({ file, defaults: () => ({}) }), { dropbox: dropboxConfig });
  const app = id => connections.publicProviders().find(provider => provider.id === id).app;
  assert.deepEqual(app('google-drive'), {
    source: null, clientId: '', hasClientSecret: false, clientSecretMasked: '', idLabel: 'client ID', secretLabel: 'client secret', secretRequired: true
  });
  assert.equal(app('dropbox').source, 'environment');
  assert.equal(app('dropbox').clientSecretMasked, '••••••••cret');
  assert.throws(() => connections.saveApp('dropbox', { clientId: 'other' }), /set in the server environment/);
  assert.throws(() => connections.clearApp('dropbox'), /set in the server environment/);

  assert.throws(() => connections.saveApp('google-drive', { clientId: 'ui-client.apps.googleusercontent.com' }), /Enter the Google Drive client secret/);
  assert.throws(() => connections.saveApp('google-drive', { clientId: 'has spaces', clientSecret: 'x' }), /valid Google Drive client ID/);
  connections.saveApp('google-drive', { clientId: ' ui-client.apps.googleusercontent.com ', clientSecret: 'ui-google-secret-4321' });
  assert.deepEqual(app('google-drive'), {
    source: 'settings', clientId: 'ui-client.apps.googleusercontent.com', hasClientSecret: true, clientSecretMasked: '••••••••4321',
    idLabel: 'client ID', secretLabel: 'client secret', secretRequired: true
  });
  assert.ok(!JSON.stringify(connections.publicProviders()).includes('ui-google-secret-4321'));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apps['google-drive'].clientSecret, 'ui-google-secret-4321');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  // A blank secret keeps the saved one for the same app; another client ID drops it.
  connections.saveApp('google-drive', { clientId: 'ui-client.apps.googleusercontent.com', clientSecret: '' });
  assert.equal(app('google-drive').clientSecretMasked, '••••••••4321');
  assert.throws(() => connections.saveApp('google-drive', { clientId: 'another.apps.googleusercontent.com' }), /Enter the Google Drive client secret/);

  // The saved credentials are what the connection uses, and they are locked while connected.
  const { authorizationUrl } = connections.begin('google-drive', ORIGIN);
  assert.equal(new URL(authorizationUrl).searchParams.get('client_id'), 'ui-client.apps.googleusercontent.com');
  await connect(connections, 'google-drive');
  assert.ok(stub.requests.some(request => request.path === '/google/token'));
  assert.throws(() => connections.saveApp('google-drive', { clientId: 'another.apps.googleusercontent.com', clientSecret: 'x' }), /Disconnect Google Drive before changing its client ID/);
  assert.throws(() => connections.clearApp('google-drive'), /Disconnect Google Drive before removing its app credentials/);
  connections.saveApp('google-drive', { clientId: 'ui-client.apps.googleusercontent.com', clientSecret: 'rotated-secret-9999' });
  assert.equal(app('google-drive').clientSecretMasked, '••••••••9999');

  await connections.disconnect('google-drive');
  connections.clearApp('google-drive');
  assert.equal(app('google-drive').source, null);
  assert.throws(() => connections.begin('google-drive', ORIGIN), /Google Drive is not configured/);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apps['google-drive'], undefined);
});

test('Google Drive adapter lists and deletes only inside its own backup folder', async () => {
  const { connections } = await build();
  await connect(connections, 'google-drive');
  stub.googleFiles.set('unrelated', { id: 'unrelated', name: 'inventory-atlas-lite-2026-01-01T00-00-00Z.sqlite', parents: ['root'], data: Buffer.from('x') });
  await connections.withAccess('google-drive', async (provider, token) => {
    const upload = path.join(process.env.DATA_DIR, 'drive-upload.sqlite');
    fs.writeFileSync(upload, crypto.randomBytes(CHUNK + 10));
    const uploaded = await provider.upload(token, { file: upload, name: 'inventory-atlas-lite-2026-09-24T10-00-00Z.sqlite' });
    const listed = await provider.list(token);
    assert.deepEqual(listed.map(entry => entry.name), ['inventory-atlas-lite-2026-09-24T10-00-00Z.sqlite']);
    await provider.remove(token, listed[0]);
    assert.deepEqual(await provider.list(token), []);
    assert.equal(stub.googleFiles.has(uploaded.id), false);
  });
  assert.ok(stub.googleFiles.has('unrelated'));
});

// --- API ------------------------------------------------------------------------------------

let port = 36000 + Math.floor(Math.random() * 1000);

async function startServer(dataDir, environment) {
  port += 1;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/src/index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...environment }, stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming ready.');
    try { if ((await fetch(`${base}/api/cloud-backup`)).ok) return { child, base }; } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error('Server did not become ready.');
}

const stopServer = child => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill('SIGTERM'); });

test('the cloud backup API connects, backs up, keeps secrets on the server, and disconnects', async () => {
  const dataDir = await mkdtemp(path.join(process.env.DATA_DIR, 'api-'));
  // Only Dropbox is configured on this server.
  const { child, base } = await startServer(dataDir, { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
  try {
    const overview = async () => (await fetch(`${base}/api/cloud-backup`)).json();
    let state = await overview();
    assert.match(state.timezone, /\S/);
    assert.deepEqual(state.providers.map(provider => [provider.id, provider.configured, provider.connected]), [['dropbox', true, false], ['google-drive', false, false]]);
    assert.equal(state.callbackPath, callbackPath);
    assert.equal(state.providers[0].redirectUri, null);
    const refused = await fetch(`${base}/api/cloud-backup/providers/google-drive/connect`, { method: 'POST' });
    assert.equal(refused.status, 409);
    assert.match((await refused.json()).error, /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);

    // Google Drive gets its app credentials through the API instead; the secret never comes back.
    const putApp = body => fetch(`${base}/api/cloud-backup/providers/google-drive/app`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await putApp({ clientId: 'api-client' })).status, 400);
    const saved = await putApp({ clientId: 'api-client', clientSecret: 'api-google-secret-2468' });
    const savedText = await saved.text();
    assert.equal(saved.status, 200);
    assert.ok(!savedText.includes('api-google-secret-2468'));
    assert.equal(JSON.parse(savedText).providers[1].app.clientSecretMasked, '••••••••2468');
    assert.equal(JSON.parse(savedText).providers[1].configured, true);
    assert.ok(!(await (await fetch(`${base}/api/cloud-backup`)).text()).includes('api-google-secret-2468'));
    assert.equal((await fetch(`${base}/api/cloud-backup/providers/google-drive/connect`, { method: 'POST' })).status, 200);
    const cleared = await fetch(`${base}/api/cloud-backup/providers/google-drive/app`, { method: 'DELETE' });
    assert.equal((await cleared.json()).providers[1].configured, false);
    assert.equal((await fetch(`${base}/api/cloud-backup/providers/dropbox/app`, { method: 'DELETE' })).status, 409);

    // The callback follows the address the browser reports, such as the development proxy's.
    const proxied = await fetch(`${base}/api/cloud-backup/providers/dropbox/connect`, { method: 'POST', headers: { Origin: 'http://proxy.test:5173' } });
    assert.equal(new URL((await proxied.json()).authorizationUrl).searchParams.get('redirect_uri'), `http://proxy.test:5173${callbackPath}`);

    const start = await fetch(`${base}/api/cloud-backup/providers/dropbox/connect`, { method: 'POST' });
    const cookie = start.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const { authorizationUrl } = await start.json();
    const callbackUrl = (await fetch(authorizationUrl, { redirect: 'manual' })).headers.get('location');

    // Without the browser's state cookie the callback is refused and nothing is connected.
    const forged = await fetch(callbackUrl, { redirect: 'manual' });
    assert.equal(forged.status, 303);
    assert.equal(forged.headers.get('location'), '/settings?cloud=error');
    state = await overview();
    assert.equal(state.providers[0].connected, false);
    assert.match(state.status.connectError.message, /could not be verified/);

    const second = await fetch(`${base}/api/cloud-backup/providers/dropbox/connect`, { method: 'POST' });
    const secondCookie = second.headers.get('set-cookie').split(';')[0];
    const secondCallback = (await fetch((await second.json()).authorizationUrl, { redirect: 'manual' })).headers.get('location');
    const completed = await fetch(secondCallback, { redirect: 'manual', headers: { Cookie: secondCookie } });
    assert.equal(completed.headers.get('location'), '/settings?cloud=connected&provider=dropbox');
    state = await overview();
    assert.equal(state.providers[0].connected, true);
    assert.equal(state.providers[0].account, 'Stub Dropbox User (dropbox-user@example.test)');

    const invalid = await fetch(`${base}/api/cloud-backup/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: { enabled: true, provider: 'google-drive', frequency: 'daily', time: '03:00' }, retention: { mode: 'all' } })
    });
    assert.equal(invalid.status, 400);

    const backup = await fetch(`${base}/api/cloud-backup/providers/dropbox/backup`, { method: 'POST' });
    assert.equal(backup.status, 200);
    const result = await backup.json();
    assert.deepEqual(stub.dropboxNames(), [result.file]);

    const everything = JSON.stringify(await overview());
    assert.deepEqual(stub.secrets().filter(secret => everything.includes(secret)), []);
    const download = Buffer.from(await (await fetch(`${base}/api/backup`)).arrayBuffer()).toString('latin1');
    assert.equal(download.slice(0, 15), 'SQLite format 3');
    assert.deepEqual(stub.secrets().filter(secret => download.includes(secret)), []);
    assert.ok(fs.readFileSync(path.join(dataDir, 'cloud-backup-credentials.json'), 'utf8').includes('dropbox-refresh-secret'));

    const disconnected = await fetch(`${base}/api/cloud-backup/providers/dropbox`, { method: 'DELETE' });
    assert.deepEqual(await disconnected.json(), { revoked: true });
    assert.equal((await overview()).providers[0].connected, false);
    assert.equal((await fetch(`${base}/api/cloud-backup/providers/dropbox/backup`, { method: 'POST' })).status, 409);
  } finally {
    await stopServer(child);
  }
});
