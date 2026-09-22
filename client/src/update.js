import { ref } from 'vue';
import { api } from './api.js';
import { UPDATE_STEPS } from '../../shared/updateSteps.js';

/*
  Shared state of the update panel in the About dialog, in the same style as theme.js and about.js.
  It lives outside the component on purpose: an update outlives the dialog, so closing and reopening
  About must show the same progress, and the polling loop must not be torn down with the markup.
*/
export const phase = ref('idle');
// The last successful /api/update/check answer.
export const release = ref(null);
export const message = ref('');
export const progress = ref('');
// Which of UPDATE_PHASES the update is in, and the detailed step when the updater reports one.
export const stage = ref(null);
export const step = ref(null);
// Client clock times: when the update was started here, and since when the backend has not answered.
export const startedAt = ref(null);
export const unreachableSince = ref(null);

const POLL_INTERVAL_MS = 3000;
const UPDATE_TIMEOUT_MS = 20 * 60 * 1000;
const RESTART_TIMEOUT_MS = 5 * 60 * 1000;
const RELOAD_DELAY_MS = 2000;

/*
  One readable line per state the updater reports. The updater's own output stays in the system
  journal: the dialog never shows shell output, only these fixed messages.
*/
const PROGRESS = {
  preparing: 'Preparing the update',
  downloading: 'Downloading the new version',
  backing_up: 'Creating a database backup',
  installing: 'Installing the update',
  restarting: 'Restarting the application',
  verifying: 'Verifying the new version'
};

// The phase of an updater that reports only its coarse state, such as the release being replaced.
const STATE_PHASES = {
  preparing: 'Download',
  downloading: 'Download',
  backing_up: 'Back up',
  installing: 'Install',
  restarting: 'Install',
  verifying: 'Verify'
};
const STEPS = new Map(UPDATE_STEPS.map(entry => [entry.id, entry]));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function checkForUpdates() {
  phase.value = 'checking';
  message.value = '';
  try {
    release.value = await api('/api/update/check');
    phase.value = release.value.updateAvailable ? 'available' : 'current';
  } catch (error) {
    phase.value = 'error';
    message.value = error.message;
  }
}

export const confirmUpdate = () => { phase.value = 'confirm'; };
export const cancelUpdate = () => { phase.value = 'available'; };

export async function startUpdate() {
  phase.value = 'updating';
  progress.value = PROGRESS.preparing;
  stage.value = STATE_PHASES.preparing;
  step.value = null;
  startedAt.value = Date.now();
  unreachableSince.value = null;
  message.value = '';
  try {
    // The request carries no body: the release, the repository, and the command are fixed server-side.
    await api('/api/update/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    phase.value = 'failed';
    message.value = error.message;
    return;
  }
  await followUpdate();
}

/*
  The update outlives the request that started it, so progress comes from polling the status the
  privileged updater writes. The backend is stopped and started again while this runs: a failed
  request is an expected step of the update, not an error.
*/
async function followUpdate() {
  const target = release.value?.latestVersion ?? null;
  const deadline = Date.now() + UPDATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(POLL_INTERVAL_MS);
    const status = await api('/api/update/status').catch(() => null);
    if (!status) {
      unreachableSince.value ??= Date.now();
      progress.value = 'Waiting for the application to come back';
      continue;
    }
    unreachableSince.value = null;
    if (PROGRESS[status.state]) {
      step.value = STEPS.get(status.step) ?? null;
      progress.value = step.value?.label ?? PROGRESS[status.state];
      stage.value = step.value?.phase ?? STATE_PHASES[status.state];
      continue;
    }
    if (status.state === 'success') return waitForNewVersion(status.toVersion || target);
    if (status.state === 'rolled_back') {
      phase.value = 'rolled_back';
      message.value = `Inventory Atlas Lite was restored to version ${status.fromVersion || target}. Your database was preserved.`;
      return;
    }
    if (status.state === 'failed') {
      phase.value = 'failed';
      message.value = 'The update did not complete. The installation was left as it was; the details are in the system log.';
      return;
    }
    // "idle" only means the updater has not written anything yet, so the loop keeps waiting.
  }
  phase.value = 'failed';
  message.value = 'The update is taking longer than expected. Check the installation before starting another one.';
}

// The page is only reloaded once the backend answers again and reports the version that was installed.
async function waitForNewVersion(version) {
  progress.value = PROGRESS.verifying;
  stage.value = STATE_PHASES.verifying;
  step.value = null;
  unreachableSince.value = null;
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const health = await api('/api/health').catch(() => null);
    if (health?.status === 'ok' && (!version || health.version === version)) {
      phase.value = 'done';
      message.value = version ? `Inventory Atlas Lite ${version}` : '';
      await wait(RELOAD_DELAY_MS);
      window.location.reload();
      return;
    }
    await wait(POLL_INTERVAL_MS);
  }
  phase.value = 'failed';
  message.value = 'The update finished, but the application did not report the new version. Reload the page to check it.';
}
