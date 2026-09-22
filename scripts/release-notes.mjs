#!/usr/bin/env node
/*
  Prints the user-facing release notes of a tag from the repository's structured release history,
  so the same entry feeds the About dialog and the published GitHub Release. A tag without a valid
  entry fails instead of publishing misleading notes.
*/
import fs from 'node:fs';
import { findRelease, readReleaseHistory, releaseNotesMarkdown } from '../shared/releaseHistory.js';

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const historyPath = new URL('../shared/release-history.json', import.meta.url);
const release = findRelease(readReleaseHistory(JSON.parse(fs.readFileSync(historyPath, 'utf8'))), tag);

if (!release) {
  console.error(`Release '${tag}' has no valid entry in shared/release-history.json.`);
  process.exit(1);
}

process.stdout.write(`${releaseNotesMarkdown(release)}\n`);
