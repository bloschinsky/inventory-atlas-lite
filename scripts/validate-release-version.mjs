#!/usr/bin/env node
import fs from 'node:fs';

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);

if (!match) {
  console.error(`Release tag '${tag}' must match vMAJOR.MINOR.PATCH.`);
  process.exit(1);
}

const version = tag.slice(1);
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const versions = {
  'package.json': packageJson.version,
  'package-lock.json': packageLock.version,
  'package-lock.json root package': packageLock.packages?.['']?.version
};

for (const [source, actual] of Object.entries(versions)) {
  if (actual !== version) {
    console.error(`${source} version '${actual}' does not match release tag '${tag}'.`);
    process.exit(1);
  }
}

process.stdout.write(version);
