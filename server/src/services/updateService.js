import { httpError } from '../httpError.js';
import { ACTIVE_UPDATE_STATES } from '../update/updateStatusStore.js';
import { compareVersions } from '../update/semver.js';

/*
  The application side of the update feature. It compares the running version with the latest stable
  GitHub release, decides whether this deployment is allowed to update itself, and - when it is -
  asks the privileged updater to run. It contains no update logic of its own: downloading,
  verifying, backing up, swapping, restarting, and rolling back all stay in the existing
  inventory-atlas-lite-update script, which this service can only start, never configure.
*/
export class UpdateService {
  #starting = false;
  // Set when this process asked for an update and cleared as soon as the updater reports for itself.
  #requested = null;

  constructor({ appVersion, deployment, releaseClient, statusStore, trigger, startTimeoutMs = 90 * 1000, now = () => Date.now() }) {
    this.appVersion = appVersion;
    this.deployment = deployment;
    this.releaseClient = releaseClient;
    this.statusStore = statusStore;
    this.trigger = trigger;
    this.startTimeoutMs = startTimeoutMs;
    this.now = now;
  }

  // True only where a privileged updater is both allowed and actually installed.
  canSelfUpdate() {
    return this.deployment.canSelfUpdate && this.trigger.isInstalled();
  }

  async check() {
    const latest = await this.releaseClient.latestStable();
    const comparison = latest ? compareVersions(latest.version, this.appVersion) : null;
    if (latest && comparison === null) {
      throw httpError('The latest release could not be compared with the running version.', 502);
    }
    return {
      currentVersion: this.appVersion,
      latestVersion: latest?.version ?? null,
      updateAvailable: comparison === 1,
      releaseUrl: latest?.url ?? null,
      publishedAt: latest?.publishedAt ?? null,
      deploymentType: this.deployment.type,
      canSelfUpdate: this.canSelfUpdate()
    };
  }

  status() {
    const reported = this.statusStore.read();
    if (this.#reportedByUpdater(reported)) {
      this.#requested = null;
      return reported;
    }
    const requested = this.#requested;
    const waited = this.now() - requested.at;
    // Nothing has been written since the request, so the updater unit never picked it up.
    if (waited > this.startTimeoutMs) {
      this.#requested = null;
      return {
        state: 'failed',
        fromVersion: requested.fromVersion,
        toVersion: requested.toVersion,
        startedAt: requested.startedAt,
        message: 'The update service did not start.',
        reportedAt: null
      };
    }
    return {
      state: 'preparing',
      fromVersion: requested.fromVersion,
      toVersion: requested.toVersion,
      startedAt: requested.startedAt,
      message: 'Waiting for the update service to start',
      reportedAt: null
    };
  }

  async apply() {
    if (!this.deployment.canSelfUpdate) {
      throw httpError('This installation cannot update itself automatically.', 501);
    }
    // Two requests can overlap only here; everything after this point is guarded by the flag.
    if (this.#starting) throw httpError('An update is already running.', 409);
    this.#starting = true;
    try {
      if (ACTIVE_UPDATE_STATES.has(this.status().state)) {
        throw httpError('An update is already running.', 409);
      }
      if (!this.trigger.isInstalled()) {
        throw httpError('The update service is not installed on this system.', 500);
      }
      const available = await this.check();
      if (!available.updateAvailable) throw httpError('No newer release is available.', 400);
      try {
        this.trigger.start();
      } catch (error) {
        console.error(error);
        throw httpError('Could not start the update service.', 500);
      }
      this.#requested = {
        at: this.now(),
        startedAt: new Date(this.now()).toISOString(),
        fromVersion: this.appVersion,
        toVersion: available.latestVersion
      };
      console.log(`Update requested: ${this.appVersion} to ${available.latestVersion}.`);
      return this.status();
    } finally {
      this.#starting = false;
    }
  }

  // The updater has taken over once the status file has been written since the request was made.
  #reportedByUpdater(reported) {
    if (!this.#requested) return true;
    const reportedAt = Date.parse(reported.reportedAt ?? '');
    return Number.isFinite(reportedAt) && reportedAt >= this.#requested.at;
  }
}
