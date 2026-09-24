import fs from 'node:fs';
import { httpError } from '../httpError.js';
import { backupFileName, defaultSettings, isOwnBackupName, nextRunAfter, validateSettings } from '../cloudBackup/schedule.js';

const HISTORY_LIMIT = 20;

export const defaultCloudBackupState = () => ({ settings: defaultSettings(), nextRunAt: null, lastSuccess: null, history: [] });

/*
  The provider-neutral cloud backup workflow: take the same consistent snapshot a download uses,
  upload it through the chosen storage provider, apply retention, and record the outcome. Provider
  details stay in the adapters behind CloudConnectionService. Only one cloud backup runs at a time,
  and the live database is only ever read, through the snapshot.
*/
export class CloudBackupService {
  constructor({ backupService, connections, stateStore, timezone, now = () => new Date() }) {
    this.backupService = backupService;
    this.connections = connections;
    this.stateStore = stateStore;
    this.timezone = timezone;
    this.now = now;
    this.running = null;
  }

  overview() {
    const state = this.stateStore.read();
    return {
      timezone: this.timezone(),
      callbackPath: this.connections.callbackPath,
      providers: this.connections.publicProviders(),
      settings: state.settings,
      status: {
        running: this.running,
        lastAttempt: state.history[0] ?? null,
        lastSuccess: state.lastSuccess,
        nextRunAt: state.settings.schedule.enabled ? state.nextRunAt : null,
        connectError: this.connections.lastConnectError
      },
      history: state.history
    };
  }

  // Saving the schedule always recomputes the next run from now, in the server's time zone.
  updateSettings(input) {
    const settings = validateSettings(input, this.connections.connectedIds());
    this.stateStore.update(state => {
      state.settings = settings;
      state.nextRunAt = settings.schedule.enabled ? nextRunAfter(settings.schedule, this.now()) : null;
    });
  }

  // A disconnected provider can no longer be a destination, so a schedule using it is switched off.
  async disconnect(id) {
    const result = await this.connections.disconnect(id);
    this.stateStore.update(state => {
      if (state.settings.schedule.provider !== id) return;
      state.settings.schedule.enabled = false;
      state.nextRunAt = null;
    });
    return result;
  }

  /*
    Claims the scheduled run that is due, if any. The next run is computed and written before the
    backup starts, so a restart, a crash, or a clock change can never run the same slot twice. A run
    missed while the server was down is caught up once, not once per missed slot.
  */
  claimDueRun() {
    const now = this.now();
    let due = null;
    this.stateStore.update(state => {
      const { schedule } = state.settings;
      if (!schedule.enabled) return;
      if (state.nextRunAt && new Date(state.nextRunAt) <= now) due = { provider: schedule.provider, slot: state.nextRunAt };
      if (due || !state.nextRunAt) state.nextRunAt = nextRunAfter(schedule, now);
    });
    return due;
  }

  record(attempt) {
    this.stateStore.update(state => {
      state.history = [attempt, ...state.history].slice(0, HISTORY_LIMIT);
      if (attempt.ok) state.lastSuccess = { at: attempt.at, provider: attempt.provider, file: attempt.file };
    });
  }

  async run(id, trigger = 'manual') {
    const provider = this.connections.provider(id);
    const at = this.now().toISOString();
    const attempt = { at, provider: id, trigger, ok: false, file: null, size: null, error: null, cleanup: null };
    if (this.running) {
      if (trigger === 'scheduled') this.record({ ...attempt, error: 'Skipped because another cloud backup was running.' });
      throw httpError('A cloud backup is already running. Wait for it to finish.', 409);
    }
    this.running = { provider: id, trigger, startedAt: at };
    let snapshot = null;
    let failure = null;
    try {
      snapshot = await this.backupService.createSnapshot();
      const name = backupFileName(new Date(at));
      const uploaded = await this.connections.withAccess(id, (adapter, token) => adapter.upload(token, { file: snapshot, name }));
      Object.assign(attempt, { ok: true, file: name, size: uploaded.size ?? fs.statSync(snapshot).size });
      attempt.cleanup = await this.applyRetention(id, name);
      console.log(`[cloud-backup] ${trigger} backup uploaded to ${provider.label}: ${name}`);
    } catch (error) {
      failure = error.status ? error : httpError(`The backup to ${provider.label} failed unexpectedly.`, 500);
      attempt.error = failure.message;
      console.warn(`[cloud-backup] ${trigger} backup to ${provider.label} failed: ${error.status ? error.message : error.stack}`);
    } finally {
      if (snapshot) fs.rmSync(snapshot, { force: true });
      this.record(attempt);
      this.running = null;
    }
    if (failure) throw failure;
    return attempt;
  }

  /*
    Keeps the newest N backups this application wrote in its own backup folder. Only names in the
    exact backup-name format are considered, and the file just uploaded is never deleted. A failure
    here is reported next to the successful upload instead of turning it into a failed backup.
  */
  async applyRetention(id, uploadedName) {
    const { retention } = this.stateStore.read().settings;
    if (retention.mode !== 'last') return null;
    let deleted = 0;
    try {
      await this.connections.withAccess(id, async (provider, token) => {
        const own = (await provider.list(token)).filter(entry => isOwnBackupName(entry.name)).sort((a, b) => b.name.localeCompare(a.name));
        for (const entry of own.slice(retention.keep)) {
          if (entry.name === uploadedName) continue;
          await provider.remove(token, entry);
          deleted += 1;
        }
      });
      return { ok: true, deleted, error: null };
    } catch (error) {
      console.warn(`[cloud-backup] retention cleanup failed: ${error.message}`);
      return { ok: false, deleted, error: error.status ? error.message : 'Old backups could not be removed.' };
    }
  }
}
