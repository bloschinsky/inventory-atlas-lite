import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const featuresDir = path.resolve(import.meta.dirname, '../docs/features');
const index = fs.readFileSync(path.join(featuresDir, 'README.md'), 'utf8');
// Relative Markdown links only; external URLs and anchors are not this check's business.
const links = [...index.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)].map(match => match[1].split('#')[0]);

test('every relative link in the feature index points at an existing file', () => {
  for (const link of links) {
    assert.ok(fs.existsSync(path.resolve(featuresDir, link)), `Broken link in docs/features/README.md: ${link}`);
  }
});

test('every feature document is listed in the feature index', () => {
  const documents = fs.readdirSync(featuresDir).filter(name => name.endsWith('.md') && name !== 'README.md');
  for (const document of documents) {
    assert.ok(links.includes(document), `docs/features/${document} is missing from docs/features/README.md`);
  }
});
