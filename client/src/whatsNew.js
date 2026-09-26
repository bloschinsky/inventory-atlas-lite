import { ref } from 'vue';
import { releaseVersion, releasesSince } from '../../shared/releaseHistory.js';
import { compareVersions, parseVersion } from '../../shared/semver.js';

/*
  The What's New dialog: after an update, the releases the user has not acknowledged yet. The last
  acknowledged release is kept in this browser, so any way of updating the application is noticed.
  The check needs no API: the version and the release history are both bundled into the client.
*/
export const LAST_SEEN_VERSION_KEY = 'inventory-atlas.lastSeenVersion';

// The unseen releases, newest first; the dialog is open while the list is not empty.
export const whatsNewReleases = ref([]);

let acknowledge = () => {};

const remember = (storage, version) => {
  try {
    storage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // A blocked storage only costs the memory of the acknowledgement.
  }
};

/*
  Decides what to show for the running version. Every outcome that shows nothing records the running
  version, so a fresh installation, an unreadable stored value, or a release missing from the history
  is settled once instead of being retried on every launch. A downgrade keeps the newer stored version.
*/
export function unseenReleases(storage, releases, appVersion) {
  const current = releaseVersion(appVersion);
  if (!parseVersion(current)) return [];
  let seen;
  try {
    seen = storage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return []; // Without storage the dialog could not stay dismissed, so it is never shown.
  }
  const order = seen === null ? null : compareVersions(seen, current);
  if (order === 1) return [];
  const unseen = order === -1 ? releasesSince(releases, seen, current) : [];
  if (unseen.length === 0) {
    if (order === -1 && import.meta.env?.DEV) console.warn(`No release history between ${seen} and ${current}.`);
    remember(storage, current);
  }
  return unseen;
}

// Runs once at startup; a storage that cannot even be reached behaves like one that throws.
export function checkWhatsNew(releases, appVersion) {
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  if (!storage) return;
  whatsNewReleases.value = unseenReleases(storage, releases, appVersion);
  acknowledge = () => remember(storage, releaseVersion(appVersion));
}

// Every way of closing the dialog acknowledges the running version.
export function closeWhatsNew() {
  acknowledge();
  whatsNewReleases.value = [];
}
