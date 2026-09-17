import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const featuresDir = path.join(root, 'docs/features');
// Relative Markdown links only; external URLs and anchors are not this check's business.
const linksIn = file => [...fs.readFileSync(file, 'utf8').matchAll(/\]\((?!https?:|#)([^)]+)\)/g)]
  .map(match => match[1].split('#')[0]);
const indexLinks = linksIn(path.join(featuresDir, 'README.md'));
const documents = ['README.md', 'docs/README.md', 'docs/HOW-TO.md', 'docs/proxmox.md', 'docs/features/README.md'];

test('every relative link in the main documents points at an existing file', () => {
  for (const document of documents) {
    const file = path.join(root, document);
    for (const link of linksIn(file)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), link)), `Broken link in ${document}: ${link}`);
    }
  }
});

test('every feature document is listed in the feature index', () => {
  const features = fs.readdirSync(featuresDir).filter(name => name.endsWith('.md') && name !== 'README.md');
  for (const feature of features) {
    assert.ok(indexLinks.includes(feature), `docs/features/${feature} is missing from docs/features/README.md`);
  }
});
