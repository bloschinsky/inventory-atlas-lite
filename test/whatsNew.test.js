import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readReleaseHistory, releasesSince } from '../shared/releaseHistory.js';
import { LAST_SEEN_VERSION_KEY, unseenReleases } from '../client/src/whatsNew.js';

const releases = readReleaseHistory(['0.18.0', '0.17.1', '0.17.0', '0.16.0', '0.15.0', '0.10.0']
  .map(version => ({ version, changes: [`Changes of ${version}`] })));
const versions = list => list.map(release => release.version);

// An in-memory stand-in for localStorage; `broken` makes every access throw like a blocked storage.
const storage = (value = null, { broken = false } = {}) => ({
  value,
  getItem(key) {
    if (broken) throw new Error('blocked');
    assert.equal(key, LAST_SEEN_VERSION_KEY);
    return this.value;
  },
  setItem(key, next) {
    if (broken) throw new Error('blocked');
    this.value = next;
  }
});

test('a fresh installation shows nothing and records the running version', () => {
  const store = storage();
  assert.deepEqual(unseenReleases(store, releases, '0.18.0'), []);
  assert.equal(store.value, '0.18.0');
});

test('the same version shows nothing', () => {
  const store = storage('0.18.0');
  assert.deepEqual(unseenReleases(store, releases, '0.18.0'), []);
  assert.equal(store.value, '0.18.0');
});

test('a one-version update shows that release and waits for the acknowledgement', () => {
  const store = storage('0.17.1');
  assert.deepEqual(versions(unseenReleases(store, releases, '0.18.0')), ['0.18.0']);
  assert.equal(store.value, '0.17.1');
});

test('a multi-version update shows every unseen release, newest first', () => {
  assert.deepEqual(versions(unseenReleases(storage('0.15.0'), releases, '0.18.0')), ['0.18.0', '0.17.1', '0.17.0', '0.16.0']);
  // Versions are compared as numbers: 0.10.0 is older than 0.15.0 and newer than 0.9.0.
  assert.deepEqual(versions(unseenReleases(storage('0.9.0'), releases, '0.10.0')), ['0.10.0']);
  // Nothing newer than the running version is shown, even when the history knows it.
  assert.deepEqual(versions(unseenReleases(storage('v0.16.0'), releases, '0.17.0-dev')), ['0.17.0']);
});

test('a downgrade shows nothing and keeps the newer acknowledged version', () => {
  const store = storage('0.18.0');
  assert.deepEqual(unseenReleases(store, releases, '0.16.0'), []);
  assert.equal(store.value, '0.18.0');
});

test('an invalid stored version recovers to the running version', () => {
  for (const invalid of ['', 'garbage', '1.2', '{"v":1}']) {
    const store = storage(invalid);
    assert.deepEqual(unseenReleases(store, releases, '0.18.0'), [], invalid);
    assert.equal(store.value, '0.18.0');
  }
});

test('an update with no history entry shows nothing and is not retried', () => {
  const store = storage('0.18.0');
  assert.deepEqual(unseenReleases(store, releases, '0.19.0'), []);
  assert.equal(store.value, '0.19.0');
  assert.deepEqual(unseenReleases(storage('0.17.0'), [], '0.18.0'), []);
});

test('a blocked storage or an unknown running version shows nothing without throwing', () => {
  assert.deepEqual(unseenReleases(storage(null, { broken: true }), releases, '0.18.0'), []);
  const store = storage('0.15.0');
  assert.deepEqual(unseenReleases(store, releases, 'unavailable'), []);
  assert.equal(store.value, '0.15.0');
});

test('the running version always has release notes for the dialog', () => {
  const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const stored = readReleaseHistory(JSON.parse(readFileSync(new URL('../shared/release-history.json', import.meta.url), 'utf8')));
  assert.deepEqual(versions(releasesSince(stored, stored[1].version, packageVersion)), [packageVersion]);
});
