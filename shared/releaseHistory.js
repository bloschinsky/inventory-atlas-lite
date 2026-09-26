/*
  Application-level format of the release history stored in shared/release-history.json.
  The About dialog and the release pipeline both read the file through this module, so an entry that
  is malformed or incomplete is dropped once here instead of being handled again by each reader.
*/
import { compareVersions } from './semver.js';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const text = value => (typeof value === 'string' ? value.trim() : '');

// A build may report 0.21.0-dev or the tag v0.21.0; the history is keyed by the plain release number.
export const releaseVersion = value => text(value).replace(/^v/, '').split('-')[0];

export function normalizeRelease(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const version = releaseVersion(entry.version);
  if (!VERSION_PATTERN.test(version)) return null;
  const changes = (Array.isArray(entry.changes) ? entry.changes : []).map(text).filter(Boolean);
  if (changes.length === 0) return null;
  const date = text(entry.date);
  // The date is optional metadata: an unusable one only costs the entry its date.
  return { version, date: DATE_PATTERN.test(date) && !Number.isNaN(Date.parse(date)) ? date : null, changes };
}

// Newest first, by version number rather than by the order the file happens to use.
export const compareReleases = (a, b) => {
  const [left, right] = [a.version.split('.').map(Number), b.version.split('.').map(Number)];
  return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
};

export function readReleaseHistory(data) {
  const seen = new Set();
  return (Array.isArray(data) ? data : [])
    .map(normalizeRelease)
    .filter(release => release && !seen.has(release.version) && seen.add(release.version))
    .sort(compareReleases);
}

// The releases newer than `seen` up to and including `current`, in the order of `releases`.
export const releasesSince = (releases, seen, current) => releases.filter(release =>
  compareVersions(release.version, seen) === 1 && compareVersions(release.version, current) <= 0);

export const findRelease = (releases, version) => {
  const wanted = releaseVersion(version);
  return releases.find(release => release.version === wanted) || null;
};

// The single user-facing part of a release note; the pipeline adds its deployment details after it.
export const releaseNotesMarkdown = release => [
  `## What's new in ${release.version}`,
  '',
  ...release.changes.map(change => `- ${change}`)
].join('\n');
