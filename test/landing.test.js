import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSiteUrl, landingRelease, links, repositoryUrl, siteUrl } from '../landing/site.js';
import { readReleaseHistory } from '../shared/releaseHistory.js';

// The landing page build facts: the announced release, the Pages address, and the documentation links.
const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const historyData = JSON.parse(read('shared/release-history.json'));
const newest = readReleaseHistory(historyData)[0];

test('the landing announces the newest release-history entry without a published tag', () => {
  assert.deepEqual(landingRelease(historyData), {
    version: newest.version,
    date: newest.date,
    url: `${repositoryUrl}/releases/tag/v${newest.version}`
  });
});

test('the landing announces the latest published tag and refuses one the history does not describe', () => {
  const history = [
    { version: '1.3.0', date: '2030-02-01', changes: ['Not published yet.'] },
    { version: '1.2.0', date: '2030-01-01', changes: ['Published.'] }
  ];
  assert.deepEqual(landingRelease(history, 'v1.2.0'), { version: '1.2.0', date: '2030-01-01', url: `${repositoryUrl}/releases/tag/v1.2.0` });
  assert.throws(() => landingRelease(history, 'v9.9.9'), /v9\.9\.9 has no valid entry/);
  assert.throws(() => landingRelease([]), /no valid release entry/);
});

test('no landing source repeats the current version by hand', () => {
  const sources = ['landing/index.html', ...fs.readdirSync(path.join(root, 'landing/src')).map(file => `landing/src/${file}`)]
    .filter(file => fs.statSync(path.join(root, file)).isFile());
  for (const file of sources) assert.ok(!read(file).includes(newest.version), `${file} hardcodes ${newest.version}`);
});

test('the site address keeps a trailing slash, which is also the asset base path', () => {
  assert.equal(siteUrl().href, defaultSiteUrl);
  assert.equal(siteUrl('').pathname, '/inventory-atlas-lite/');
  assert.equal(siteUrl('https://example.github.io/atlas').href, 'https://example.github.io/atlas/');
  assert.equal(siteUrl('https://example.github.io/atlas//').href, 'https://example.github.io/atlas/');
  assert.equal(siteUrl('https://atlas.example.org').pathname, '/');
});

test('every landing link leads to an existing part of the repository documentation', () => {
  // GitHub turns a Markdown heading into an anchor: lower case, punctuation removed, spaces to hyphens.
  const anchors = new Set(read('README.md').split('\n')
    .filter(line => /^#{1,6} /.test(line))
    .map(line => line.replace(/^#+ /, '').trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-')));

  assert.equal(links.github, repositoryUrl);
  assert.equal(links.releases, `${repositoryUrl}/releases`);
  for (const name of ['get', 'docker', 'manual']) {
    const [base, anchor] = links[name].split('#');
    assert.equal(base, repositoryUrl);
    assert.ok(anchors.has(anchor), `README.md has no "${anchor}" section for the ${name} link`);
  }
  assert.equal(links.get, `${repositoryUrl}#official-releases`);
  for (const name of ['proxmox', 'guide']) {
    const prefix = `${repositoryUrl}/blob/master/`;
    assert.ok(links[name].startsWith(prefix));
    assert.ok(fs.existsSync(path.join(root, links[name].slice(prefix.length))), `${links[name]} does not exist`);
  }
});
