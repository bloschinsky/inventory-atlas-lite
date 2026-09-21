import path from 'node:path';
import { dataDir } from '../db.js';

export const CONFIRMATION_PHRASE = 'RESTORE';
export const stagingDir = path.join(dataDir, 'restore-staging');
export const safetyBackupDir = path.join(dataDir, 'pre-restore-backups');
// Documented in README.md and docs/HOW-TO.md. SQLite backups carry photo BLOBs, so the default is
// far above the normal form-upload limit but still bounded.
export const maxUploadBytes = Math.round((Number(process.env.RESTORE_MAX_UPLOAD_MB) > 0
  ? Number(process.env.RESTORE_MAX_UPLOAD_MB)
  : 512) * 1024 * 1024);
// Staged uploads and their tokens live for ten minutes; RESTORE_TOKEN_TTL_MS shortens that for tests.
export const tokenTtlMs = Number(process.env.RESTORE_TOKEN_TTL_MS) > 0 ? Number(process.env.RESTORE_TOKEN_TTL_MS) : 10 * 60 * 1000;
export const safetyBackupsKept = 10;
