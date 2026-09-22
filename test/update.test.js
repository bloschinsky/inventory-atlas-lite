import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The update feature is built from injected parts, so everything below runs without GitHub,
// without systemd, and without the working database in data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-update-test-'));

const { compareVersions, isNewerVersion, parseVersion } = await import('../server/src/update/semver.js');
const { resolveDeployment } = await import('../server/src/update/deployment.js');
const { UpdateStatusStore } = await import('../server/src/update/updateStatusStore.js');
const { SystemdUpdateTrigger } = await import('../server/src/update/updateTrigger.js');
const { GitHubReleaseClient } = await import('../server/src/integrations/githubReleaseClient.js');
const { UpdateService } = await import('../server/src/services/updateService.js');
const { createUpdateRoutes } = await import('../server/src/routes/updateRoutes.js');
const { errorHandler } = await import('../server/src/http/errorHandler.js');

const release = (tag, extra = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/bloschinsky/inventory-atlas-lite/releases/tag/${tag}`,
  published_at: '2026-09-19T12:00:00Z',
  draft: false,
  prerelease: false,
  ...extra
});

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// A status file the privileged updater would have written, plus the store that reads it.
const statusFile = async contents => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'inventory-update-status-'));
  const file = path.join(dir, 'update-status.json');
  if (contents !== undefined) fs.writeFileSync(file, contents);
  return file;
};

const service = (overrides = {}) => new UpdateService({
  appVersion: '0.9.0',
  deployment: { type: 'proxmox-lxc', canSelfUpdate: true },
  releaseClient: { latestStable: async () => ({ version: '0.10.0', tag: 'v0.10.0', url: 'https://example.invalid/v0.10.0', publishedAt: '2026-09-19T12:00:00Z' }) },
  statusStore: { read: () => ({ state: 'idle', fromVersion: null, toVersion: null, startedAt: null, message: null, reportedAt: null }) },
  trigger: { isInstalled: () => true, start: () => {} },
  ...overrides
});

const rejects = (work, status, message) => assert.rejects(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  if (message) assert.equal(error.message, message);
  return true;
});

test('semantic versions are parsed and ordered by precedence', () => {
  assert.deepEqual(parseVersion('v1.2.3').numbers, [1, 2, 3]);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion(''), null);

  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('v0.9.0', '0.9.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.equal(compareVersions('1.0.0', 'nonsense'), null);

  assert.ok(isNewerVersion('0.10.0', '0.9.0'));
  assert.ok(!isNewerVersion('0.9.0', '0.9.0'));
  assert.ok(!isNewerVersion('0.9.0', '0.10.0'));
});

test('the deployment type is configured explicitly and decides self-update', () => {
  assert.deepEqual(resolveDeployment({ DEPLOYMENT_TYPE: 'proxmox-lxc' }), { type: 'proxmox-lxc', canSelfUpdate: true });
  for (const type of ['docker', 'manual', 'development']) {
    assert.deepEqual(resolveDeployment({ DEPLOYMENT_TYPE: type }), { type, canSelfUpdate: false });
  }
  // Nothing configured, and an unusable value, fall back rather than assuming a capable deployment.
  assert.deepEqual(resolveDeployment({}), { type: 'development', canSelfUpdate: false });
  assert.deepEqual(resolveDeployment({ NODE_ENV: 'production' }), { type: 'manual', canSelfUpdate: false });
  assert.deepEqual(resolveDeployment({ DEPLOYMENT_TYPE: 'kubernetes' }), { type: 'development', canSelfUpdate: false });
});

test('the release client returns the latest stable release and caches it', async () => {
  let calls = 0;
  let clock = 0;
  const client = new GitHubReleaseClient({
    owner: 'bloschinsky',
    repository: 'inventory-atlas-lite',
    cacheTtlMs: 1000,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse([
        release('v0.12.0', { draft: true }),
        release('v0.11.0', { prerelease: true }),
        release('v0.11.0-rc.1'),
        release('v0.10.0'),
        release('v0.9.0')
      ]);
    }
  });

  const latest = await client.latestStable();
  assert.deepEqual(latest, {
    version: '0.10.0',
    tag: 'v0.10.0',
    url: 'https://github.com/bloschinsky/inventory-atlas-lite/releases/tag/v0.10.0',
    publishedAt: '2026-09-19T12:00:00Z'
  });

  await client.latestStable();
  assert.equal(calls, 1, 'the cached answer is reused');
  clock = 2000;
  await client.latestStable();
  assert.equal(calls, 2, 'the cache expires');
});

test('the release client reports GitHub failures as readable errors', async () => {
  const failing = body => new GitHubReleaseClient({ owner: 'o', repository: 'r', fetchImpl: async () => body });

  await rejects(() => failing(jsonResponse({}, 403)).latestStable(), 503, 'GitHub is rate limiting update checks. Try again later.');
  await rejects(() => failing(jsonResponse({}, 500)).latestStable(), 502, 'GitHub could not be queried for the latest release.');
  await rejects(() => failing(jsonResponse({ message: 'Not Found' })).latestStable(), 502, 'GitHub returned an unexpected response.');

  const offline = new GitHubReleaseClient({ owner: 'o', repository: 'r', fetchImpl: async () => { throw new Error('network down'); } });
  await rejects(() => offline.latestStable(), 502, 'Could not reach GitHub to check for updates.');

  // A repository without any stable release is not an error; there is simply nothing to offer.
  const empty = new GitHubReleaseClient({ owner: 'o', repository: 'r', fetchImpl: async () => jsonResponse([release('v1.0.0', { draft: true })]) });
  assert.equal(await empty.latestStable(), null);
});

test('the status store only trusts states the updater can write', async () => {
  const running = new UpdateStatusStore({ file: await statusFile(JSON.stringify({ state: 'installing', fromVersion: '0.9.0', toVersion: '0.10.0', startedAt: '2026-09-19T15:00:00Z', message: 'Installing the update' })) });
  const reported = running.read();
  assert.equal(reported.state, 'installing');
  assert.equal(reported.toVersion, '0.10.0');
  assert.ok(reported.reportedAt, 'the read reports when the updater last wrote');

  assert.equal(new UpdateStatusStore({ file: await statusFile() }).read().state, 'idle');
  assert.equal(new UpdateStatusStore({ file: await statusFile('not json') }).read().state, 'idle');
  assert.equal(new UpdateStatusStore({ file: await statusFile(JSON.stringify({ state: 'rm -rf /' })) }).read().state, 'idle');

  // The detailed step is kept only when it is one the About dialog knows.
  assert.equal(reported.step, null);
  const building = { state: 'preparing', step: 'building_client' };
  assert.equal(new UpdateStatusStore({ file: await statusFile(JSON.stringify(building)) }).read().step, 'building_client');
  const unknown = { state: 'preparing', step: '<script>' };
  assert.equal(new UpdateStatusStore({ file: await statusFile(JSON.stringify(unknown)) }).read().step, null);
});

test('the update check compares the running version with the latest stable release', async () => {
  assert.deepEqual(await service().check(), {
    currentVersion: '0.9.0',
    latestVersion: '0.10.0',
    updateAvailable: true,
    releaseUrl: 'https://example.invalid/v0.10.0',
    publishedAt: '2026-09-19T12:00:00Z',
    deploymentType: 'proxmox-lxc',
    canSelfUpdate: true
  });

  const current = await service({ appVersion: '0.10.0' }).check();
  assert.equal(current.updateAvailable, false);

  const none = await service({ releaseClient: { latestStable: async () => null } }).check();
  assert.deepEqual([none.latestVersion, none.updateAvailable], [null, false]);

  await rejects(
    () => service({ releaseClient: { latestStable: async () => ({ version: 'nightly' }) } }).check(),
    502, 'The latest release could not be compared with the running version.'
  );
});

test('deployments without a privileged updater expose no self-update', async () => {
  const docker = service({ deployment: { type: 'docker', canSelfUpdate: false } });
  assert.equal((await docker.check()).canSelfUpdate, false);
  await rejects(() => docker.apply(), 501, 'This installation cannot update itself automatically.');

  // A Proxmox installation made before the updater unit existed reports the truth as well.
  const stale = service({ trigger: { isInstalled: () => false, start: () => {} } });
  assert.equal((await stale.check()).canSelfUpdate, false);
  await rejects(() => stale.apply(), 500, 'The update service is not installed on this system.');
});

test('applying an update triggers the updater once and reports its progress', async () => {
  let started = 0;
  let clock = 1_000_000;
  const reported = { state: 'idle', reportedAt: null };
  const updating = service({
    trigger: { isInstalled: () => true, start: () => { started += 1; } },
    statusStore: { read: () => ({ fromVersion: null, toVersion: null, startedAt: null, message: null, ...reported }) },
    now: () => clock,
    startTimeoutMs: 90_000
  });

  const accepted = await updating.apply();
  assert.equal(started, 1);
  assert.equal(accepted.state, 'preparing');
  assert.deepEqual([accepted.fromVersion, accepted.toVersion], ['0.9.0', '0.10.0']);

  // A second request while the updater has not reported yet must not start another update.
  await rejects(() => updating.apply(), 409, 'An update is already running.');

  // Once the updater writes its own status, that is what the interface follows.
  clock += 5000;
  reported.state = 'installing';
  reported.reportedAt = new Date(clock).toISOString();
  assert.equal(updating.status().state, 'installing');
  await rejects(() => updating.apply(), 409, 'An update is already running.');

  reported.state = 'success';
  clock += 5000;
  reported.reportedAt = new Date(clock).toISOString();
  assert.equal(updating.status().state, 'success');
});

test('an updater that never starts is reported instead of waiting forever', async () => {
  let clock = 1_000_000;
  const stuck = service({ now: () => clock, startTimeoutMs: 90_000 });
  await stuck.apply();
  assert.equal(stuck.status().state, 'preparing');
  clock += 120_000;
  const failed = stuck.status();
  assert.equal(failed.state, 'failed');
  assert.equal(failed.message, 'The update service did not start.');
});

test('an updater killed before its final state no longer blocks the next update', async () => {
  let clock = Date.parse('2026-09-22T19:00:00Z');
  let started = 0;
  const reported = { state: 'preparing', step: 'installing_dependencies', reportedAt: '2026-09-22T18:50:00Z' };
  const orphaned = service({
    trigger: { isInstalled: () => true, start: () => { started += 1; } },
    statusStore: { read: () => ({ fromVersion: '0.9.0', toVersion: '0.10.0', startedAt: null, message: null, ...reported }) },
    now: () => clock,
    staleAfterMs: 60 * 60 * 1000
  });

  // Within the updater's timeout the state may still be real, so the update stays exclusive.
  assert.equal(orphaned.status().state, 'preparing');
  await rejects(() => orphaned.apply(), 409, 'An update is already running.');

  clock += 60 * 60 * 1000;
  const interrupted = orphaned.status();
  assert.equal(interrupted.state, 'failed');
  assert.equal(interrupted.step, null);
  assert.equal(interrupted.message, 'The update was interrupted before it finished.');
  await orphaned.apply();
  assert.equal(started, 1);

  // A final state is history, not a running update, however old it is.
  reported.state = 'success';
  assert.equal(orphaned.status().state, 'preparing', 'the new request is followed, not the old result');
});

test('an update is refused when the running version is already the latest', async () => {
  await rejects(() => service({ appVersion: '0.10.0' }).apply(), 400, 'No newer release is available.');
});

test('the trigger writes one marker file and nothing else', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'inventory-update-trigger-'));
  const trigger = new SystemdUpdateTrigger({
    requestFile: path.join(dir, 'update-requested'),
    pathUnitFile: path.join(dir, 'missing.path')
  });
  assert.equal(trigger.isInstalled(), false);
  trigger.start();
  assert.match(fs.readFileSync(trigger.requestFile, 'utf8'), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(fs.readdirSync(dir), ['update-requested']);

  fs.writeFileSync(trigger.pathUnitFile, '[Path]');
  assert.equal(trigger.isInstalled(), true);
});

test('the update API answers with the documented statuses', async t => {
  let apply = async () => ({ state: 'preparing' });
  const app = express();
  app.use(express.json());
  app.use(createUpdateRoutes({
    updateService: {
      check: async () => ({ currentVersion: '0.9.0', latestVersion: '0.10.0', updateAvailable: true, canSelfUpdate: true }),
      status: () => ({ state: 'idle' }),
      apply: () => apply()
    }
  }));
  app.use(errorHandler);

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = headers => fetch(`${base}/api/update/apply`, { method: 'POST', headers });

  assert.equal((await fetch(`${base}/api/update/check`)).status, 200);
  assert.equal((await fetch(`${base}/api/update/status`)).status, 200);
  assert.equal((await post()).status, 202);

  // A page on another site must not be able to start an update.
  assert.equal((await post({ 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post({ origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await post({ 'sec-fetch-site': 'same-origin' })).status, 202);

  for (const status of [409, 400, 501, 500]) {
    apply = async () => { throw Object.assign(new Error('Refused.'), { status }); };
    const response = await post();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: 'Refused.' });
  }
});
