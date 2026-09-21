import path from 'node:path';
import { dataDir } from '../db.js';

/*
  The update feature is wired to exactly one repository and one privileged unit. Both are constants
  on purpose: no request, setting, or environment variable may point the updater somewhere else.
*/
export const releaseRepository = { owner: 'bloschinsky', name: 'inventory-atlas-lite' };

// Long enough that opening About repeatedly costs one GitHub call, short enough to stay useful.
export const releaseCacheTtlMs = 10 * 60 * 1000;

// Written by the privileged updater, read by the application; see docs/features/self-update.md.
export const updateStatusFile = path.join(dataDir, 'update-status.json');
// The only thing the application writes: a marker the systemd path unit watches for.
export const updateRequestFile = path.join(dataDir, 'update-requested');
export const updatePathUnitFile = '/etc/systemd/system/inventory-atlas-lite-update.path';

// An updater that has not reported anything in this long is treated as never having started.
export const updateStartTimeoutMs = 90 * 1000;
