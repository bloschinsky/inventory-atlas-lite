import fs from 'node:fs';
import { UPDATE_STEP_IDS } from '../../../shared/updateSteps.js';

export const UPDATE_STATES = [
  'idle', 'preparing', 'downloading', 'backing_up', 'installing',
  'restarting', 'verifying', 'success', 'failed', 'rolled_back'
];
// While one of these is reported, an update is still running and a second one must not start.
export const ACTIVE_UPDATE_STATES = new Set(['preparing', 'downloading', 'backing_up', 'installing', 'restarting', 'verifying']);

const IDLE = { state: 'idle', step: null, fromVersion: null, toVersion: null, startedAt: null, message: null, reportedAt: null };
const text = value => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null);

/*
  Read-only view of the status file the privileged updater writes. The application never writes it:
  the updater owns the file, and the service user is only allowed to read it. Anything unexpected in
  the file is reported as "idle" rather than trusted, because it drives what the interface offers.
*/
export class UpdateStatusStore {
  constructor({ file }) {
    this.file = file;
  }

  read() {
    let raw;
    let reportedAt;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
      reportedAt = new Date(fs.statSync(this.file).mtimeMs).toISOString();
    } catch {
      return { ...IDLE }; // No update has ever run here, or the file is not readable.
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Ignoring malformed update status in ${this.file}.`);
      return { ...IDLE };
    }
    const state = UPDATE_STATES.includes(parsed?.state) ? parsed.state : 'idle';
    return {
      state,
      step: UPDATE_STEP_IDS.has(parsed?.step) ? parsed.step : null,
      fromVersion: text(parsed?.fromVersion),
      toVersion: text(parsed?.toVersion),
      startedAt: text(parsed?.startedAt),
      message: text(parsed?.message),
      reportedAt
    };
  }
}
