import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  findRelease, normalizeRelease, readReleaseHistory, releaseNotesMarkdown
} from '../shared/releaseHistory.js';

const historyPath = fileURLToPath(new URL('../shared/release-history.json', import.meta.url));
const stored = JSON.parse(readFileSync(historyPath, 'utf8'));
const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const script = fileURLToPath(new URL('../scripts/release-notes.mjs', import.meta.url));

test('the stored release history describes the running version and is read newest first', () => {
  const releases = readReleaseHistory(stored);
  assert.ok(releases.length >= 2);
  assert.ok(findRelease(releases, `${packageVersion}-dev`), 'the current version has an entry');

  const versions = releases.map(release => release.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => {
    const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  }));
  for (const release of releases) {
    assert.ok(release.changes.length > 0);
    assert.ok(release.date === null || /^\d{4}-\d{2}-\d{2}$/.test(release.date));
  }
});

test('the history is sorted by version rather than by the order of the file', () => {
  const releases = readReleaseHistory([
    { version: '0.9.0', changes: ['Older'] },
    { version: '0.10.0', changes: ['Newer'] },
    { version: '0.9.1', changes: ['Between'] }
  ]);
  assert.deepEqual(releases.map(release => release.version), ['0.10.0', '0.9.1', '0.9.0']);
});

test('malformed or incomplete entries are dropped instead of failing', () => {
  assert.deepEqual(readReleaseHistory(null), []);
  assert.deepEqual(readReleaseHistory({ version: '1.0.0' }), []);
  assert.deepEqual(readReleaseHistory([
    null,
    'nonsense',
    { version: 'not-a-version', changes: ['Ignored'] },
    { version: '0.2.0' },
    { version: '0.2.0', changes: [] },
    { version: '0.3.0', changes: [42, '  ', 'Kept'] },
    { version: '0.3.0', changes: ['Duplicate'] }
  ]), [{ version: '0.3.0', date: null, changes: ['Kept'] }]);

  // An unusable date only costs the entry its date.
  assert.deepEqual(normalizeRelease({ version: 'v1.2.3', date: 'soon', changes: ['Kept'] }),
    { version: '1.2.3', date: null, changes: ['Kept'] });
});

test('release notes are generated from the structured history and fail for an unknown tag', () => {
  const notes = releaseNotesMarkdown({ version: '1.2.3', date: null, changes: ['Added a thing'] });
  assert.equal(notes, "## What's new in 1.2.3\n\n- Added a thing");

  const printed = execFileSync(process.execPath, [script, `v${packageVersion}`], { encoding: 'utf8' });
  assert.ok(printed.startsWith(`## What's new in ${packageVersion}\n`));
  for (const change of findRelease(readReleaseHistory(stored), packageVersion).changes) {
    assert.ok(printed.includes(`- ${change}`));
  }

  assert.throws(() => execFileSync(process.execPath, [script, 'v99.99.99'], { stdio: 'pipe' }));
});
