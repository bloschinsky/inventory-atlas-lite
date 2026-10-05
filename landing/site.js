/*
  Build-time facts of the public landing page, resolved in Node by landing/vite.config.js and
  injected into the page as __LANDING_INFO__. Nothing here is edited for a release: the version
  comes from shared/release-history.json, the same history the About dialog and the GitHub Release
  notes read.
*/
import { findRelease, readReleaseHistory } from '../shared/releaseHistory.js';

export const repositoryUrl = 'https://github.com/bloschinsky/inventory-atlas-lite';

// Every destination is a real section of the repository documentation; test/landing.test.js
// checks that the README anchors and the documents still exist.
export const links = {
  get: `${repositoryUrl}#official-releases`,
  github: repositoryUrl,
  releases: `${repositoryUrl}/releases`,
  docker: `${repositoryUrl}#docker`,
  proxmox: `${repositoryUrl}/blob/master/docs/proxmox.md`,
  manual: `${repositoryUrl}#manual-production-run`,
  guide: `${repositoryUrl}/blob/master/docs/HOW-TO.md`
};

// The GitHub Pages address of the repository; the Pages workflow passes the real one.
export const defaultSiteUrl = 'https://bloschinsky.github.io/inventory-atlas-lite/';

/*
  The release the page announces. `tag` is the latest published GitHub Release, which the Pages
  workflow looks up; without it (a local build) the newest history entry is used. A tag without a
  history entry fails the build rather than showing a version the history does not describe.
*/
export function landingRelease(historyData, tag) {
  const releases = readReleaseHistory(historyData);
  const release = tag ? findRelease(releases, tag) : releases[0];
  if (!release) {
    throw new Error(tag
      ? `Release ${tag} has no valid entry in shared/release-history.json.`
      : 'shared/release-history.json has no valid release entry.');
  }
  return { version: release.version, date: release.date, url: `${repositoryUrl}/releases/tag/v${release.version}` };
}

// The site address always ends with a slash, so it is both the canonical URL and the asset base.
export const siteUrl = value => {
  const url = new URL(value?.trim() || defaultSiteUrl);
  url.pathname = url.pathname.replace(/\/*$/, '/');
  return url;
};
