import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CORE_SCHEMA, CURRENT_SCHEMA, SCHEMA_VERSION, applySchema, closeDatabase, databasePath, dataDir, db, openDatabase
} from './db.js';

/*
  Restoring a backup replaces the whole inventory, so the sequence is deliberately defensive:
  an upload is streamed to a private staging file, validated there, and only a validated copy is
  swapped in — after a verified safety backup of the current database has been written. Any failure
  after the swap starts rolls the safety backup back before the request is answered.
*/

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
const safetyBackupsKept = 10;

const badRequest = message => Object.assign(new Error(message), { status: 400 });
const conflict = message => Object.assign(new Error(message), { status: 409 });
const unavailable = message => Object.assign(new Error(message), { status: 503 });

// Only our own messages reach the browser; anything SQLite says stays in the server log.
const asUserError = (error, message) => {
  if (error?.status) return error;
  console.error('[restore]', error);
  return badRequest(message);
};

const ensureDirectory = directory => fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

const syncDirectory = directory => {
  // Directory syncing is POSIX-only; on Windows opening a directory handle is not permitted.
  try {
    const handle = fs.openSync(directory, 'r');
    try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  } catch { /* the rename is already atomic; durability of the entry is best effort here */ }
};

const removeSidecars = file => {
  for (const suffix of ['-wal', '-shm', '-journal']) fs.rmSync(`${file}${suffix}`, { force: true });
};

const freeBytes = directory => {
  try {
    const stats = fs.statfsSync(directory);
    return stats.bavail * stats.bsize;
  } catch { return null; }
};

const assertDiskSpace = needed => {
  const free = freeBytes(dataDir);
  if (free !== null && free < needed) throw unavailable('Not enough free disk space to restore this backup safely.');
};

const fileSize = file => { try { return fs.statSync(file).size; } catch { return 0; } };

// ---------------------------------------------------------------------------------------------
// Validation of a staged candidate
// ---------------------------------------------------------------------------------------------

const hasSqliteHeader = file => {
  const header = Buffer.alloc(16);
  const handle = fs.openSync(file, 'r');
  try { fs.readSync(handle, header, 0, 16, 0); } finally { fs.closeSync(handle); }
  return header.toString('latin1', 0, 15) === 'SQLite format 3';
};

const tableColumns = (connection, table) => connection.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);

const checkSchema = (connection, expected, message) => {
  const tables = new Set(connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  for (const [table, columns] of Object.entries(expected)) {
    if (!tables.has(table)) throw badRequest(message);
    const present = new Set(tableColumns(connection, table));
    for (const column of columns) if (!present.has(column)) throw badRequest(message);
  }
};

const summarize = connection => ({
  categories: connection.prepare('SELECT COUNT(*) AS count FROM categories').get().count,
  items: connection.prepare('SELECT COUNT(*) AS count FROM items').get().count,
  fields: connection.prepare('SELECT COUNT(*) AS count FROM custom_fields').get().count,
  fieldValues: connection.prepare('SELECT COUNT(*) AS count FROM item_field_values').get().count,
  photos: connection.prepare('SELECT COUNT(*) AS count FROM item_photos').get().count
});

/*
  Validates a private staged copy of the upload. The file the user selected is never touched: this
  works on our own copy, which may be journal-collapsed and migrated in place.
*/
export const validateStagedDatabase = file => {
  if (!fs.existsSync(file) || !fileSize(file)) throw badRequest('The uploaded file is empty.');
  if (!hasSqliteHeader(file)) throw badRequest('The selected file is not a SQLite database.');

  let candidate;
  try {
    candidate = new Database(file, { fileMustExist: true });
  } catch (error) {
    throw asUserError(error, 'The selected file could not be opened as a SQLite database.');
  }
  try {
    // Collapsing the journal makes the candidate a single self-contained file, so the restored
    // database can never depend on a -wal the upload did not include.
    candidate.pragma('journal_mode = delete');
    if (candidate.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw badRequest('The selected database failed its integrity check and cannot be restored.');
    }
    const version = Number(candidate.pragma('user_version', { simple: true })) || 0;
    if (version > SCHEMA_VERSION) {
      throw badRequest('This backup was created by a newer version of Inventory Atlas Lite and cannot be restored.');
    }
    checkSchema(candidate, CORE_SCHEMA, 'This file is not an Inventory Atlas Lite backup.');
    // An older but recognized backup is migrated on the staged copy only, then checked again.
    if (version < SCHEMA_VERSION) applySchema(candidate);
    checkSchema(candidate, CURRENT_SCHEMA, 'This backup is not compatible with the current application version.');
    if (candidate.pragma('foreign_key_check').length) {
      throw badRequest('The selected database contains broken relationships and cannot be restored.');
    }
    const summary = summarize(candidate);
    return { ...summary, schemaVersion: SCHEMA_VERSION, migratedFrom: version < SCHEMA_VERSION ? version : null };
  } catch (error) {
    throw asUserError(error, 'The selected database could not be read as an Inventory Atlas Lite backup.');
  } finally {
    try { candidate.close(); } catch { /* already closed */ }
    removeSidecars(file);
  }
};

/*
  Checks a database file on disk. `collapse` folds a journal into the file and removes the sidecars,
  which is what makes a written safety backup a single portable file; it must stay off for the
  active database, whose WAL belongs to the live connection.
*/
const verifyDatabaseFile = (file, message, collapse = false) => {
  const connection = new Database(file, { fileMustExist: true, readonly: !collapse });
  try {
    if (collapse) connection.pragma('journal_mode = delete');
    if (connection.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error(message);
    checkSchema(connection, CURRENT_SCHEMA, message);
    summarize(connection);
  } finally {
    connection.close();
    if (collapse) removeSidecars(file);
  }
};

// ---------------------------------------------------------------------------------------------
// Staging sessions
// ---------------------------------------------------------------------------------------------

const sessions = new Map();

const discardSession = token => {
  const session = sessions.get(token);
  if (!session) return;
  sessions.delete(token);
  fs.rmSync(session.file, { force: true });
  removeSidecars(session.file);
};

export const sweepExpiredSessions = () => {
  for (const [token, session] of sessions) if (session.expiresAt <= Date.now()) discardSession(token);
};

export const discardStagedUpload = file => {
  if (!file) return;
  fs.rmSync(file, { force: true });
  removeSidecars(file);
};

// Leftovers from a crash or a hard kill are not recoverable sessions, so startup clears them.
export const resetStaging = () => {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  ensureDirectory(stagingDir);
};

export const clearAllSessions = () => {
  for (const token of [...sessions.keys()]) discardSession(token);
};

export const stagedFileName = () => `staged-${crypto.randomBytes(16).toString('hex')}.sqlite`;

export const createSession = (file, summary, originalName, size) => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { file, expiresAt: Date.now() + tokenTtlMs, summary });
  return {
    restore_token: token,
    expires_in_seconds: Math.round(tokenTtlMs / 1000),
    filename: path.basename(String(originalName || 'backup.sqlite')),
    size_bytes: size,
    summary
  };
};

// ---------------------------------------------------------------------------------------------
// Maintenance state
// ---------------------------------------------------------------------------------------------

let restoreRunning = false;
let backupsInFlight = 0;
let criticalFailure = null;

export const isMaintenance = () => restoreRunning || criticalFailure !== null;
export const restoreStatus = () => ({
  ready: !isMaintenance(),
  restoring: restoreRunning,
  critical: criticalFailure !== null
});

export const beginBackupDownload = () => {
  if (restoreRunning) throw unavailable('A backup is being restored. Try the download again in a moment.');
  backupsInFlight += 1;
};
export const endBackupDownload = () => { backupsInFlight = Math.max(0, backupsInFlight - 1); };

const waitForBackupDownloads = async () => {
  for (let attempt = 0; backupsInFlight > 0 && attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (backupsInFlight > 0) throw conflict('A backup download is still running. Try again in a moment.');
};

// ---------------------------------------------------------------------------------------------
// Safety backups
// ---------------------------------------------------------------------------------------------

const safetyBackupName = () => {
  const stamp = `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}Z`;
  const base = `pre-restore-${stamp}`;
  if (!fs.existsSync(path.join(safetyBackupDir, `${base}.sqlite`))) return `${base}.sqlite`;
  return `${base}-${crypto.randomBytes(2).toString('hex')}.sqlite`;
};

// Retention: the newest safetyBackupsKept copies are kept. Cleanup never touches the copy written
// by the running restore, and a failing cleanup never fails the restore.
const pruneSafetyBackups = keep => {
  try {
    const files = fs.readdirSync(safetyBackupDir)
      .filter(name => name.startsWith('pre-restore-') && name.endsWith('.sqlite') && name !== keep)
      .sort();
    for (const name of files.slice(0, Math.max(0, files.length + 1 - safetyBackupsKept))) {
      fs.rmSync(path.join(safetyBackupDir, name), { force: true });
    }
  } catch (error) {
    console.error('[restore] safety backup cleanup failed', error);
  }
};

// ---------------------------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------------------------

const rollback = safetyPath => {
  try { closeDatabase(); } catch { /* the connection may already be gone */ }
  removeSidecars(databasePath);
  fs.copyFileSync(safetyPath, databasePath);
  openDatabase();
  verifyDatabaseFile(databasePath, 'The recovered database failed verification.');
  db.prepare('SELECT COUNT(*) AS count FROM items').get();
};

export const applyRestore = async (token, confirmation) => {
  if (criticalFailure) throw unavailable('The application is in a failed restore state and needs manual recovery.');
  if (confirmation !== CONFIRMATION_PHRASE) throw badRequest(`Type ${CONFIRMATION_PHRASE} to confirm that current data will be replaced.`);
  if (typeof token !== 'string' || !token) throw badRequest('A validated backup is required. Validate the file again.');
  sweepExpiredSessions();
  if (!sessions.has(token)) throw badRequest('The restore session is unknown or has expired. Validate the file again.');
  if (restoreRunning) throw conflict('Another restore is already running.');

  restoreRunning = true;
  const session = sessions.get(token);
  // Single use: the token is consumed as soon as this restore owns it.
  sessions.delete(token);
  const stagedFile = session.file;
  let safetyPath = null;
  let swapStarted = false;
  try {
    await waitForBackupDownloads();
    if (!fs.existsSync(stagedFile)) throw badRequest('The staged backup is no longer available. Validate the file again.');
    // The staged file is checked once more so nothing can have changed since validation.
    const summary = validateStagedDatabase(stagedFile);

    ensureDirectory(safetyBackupDir);
    assertDiskSpace(fileSize(databasePath) + fileSize(stagedFile) + 16 * 1024 * 1024);
    safetyPath = path.join(safetyBackupDir, safetyBackupName());
    await db.backup(safetyPath);
    verifyDatabaseFile(safetyPath, 'The safety backup of the current database failed verification.', true);

    // The candidate sits next to the active database so the final replacement is an atomic rename.
    const candidatePath = path.join(dataDir, `restore-candidate-${crypto.randomBytes(8).toString('hex')}.sqlite`);
    try {
      fs.copyFileSync(stagedFile, candidatePath);
      fs.chmodSync(candidatePath, 0o600);
      verifyDatabaseFile(candidatePath, 'The prepared database failed verification before replacement.', true);

      // Test-only hook: widens the maintenance window so a concurrent write can be observed.
      const delay = Number(process.env.RESTORE_TEST_DELAY_MS) || 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));

      swapStarted = true;
      closeDatabase();
      // Stale journals of the replaced database must never be attached to the restored one.
      removeSidecars(databasePath);
      fs.renameSync(candidatePath, databasePath);
      syncDirectory(dataDir);
    } finally {
      fs.rmSync(candidatePath, { force: true });
    }

    // Test-only hook: proves that a failure after the swap rolls the safety backup back.
    if (process.env.RESTORE_TEST_FAILURE === 'after-swap') throw new Error('Simulated restore failure after the swap.');

    openDatabase();
    verifyDatabaseFile(databasePath, 'The restored database failed verification.');
    if (db.pragma('foreign_key_check').length) throw new Error('The restored database contains broken relationships.');
    const restored = {
      categories: db.prepare('SELECT COUNT(*) AS count FROM categories').get().count,
      items: db.prepare('SELECT COUNT(*) AS count FROM items').get().count,
      fields: db.prepare('SELECT COUNT(*) AS count FROM custom_fields').get().count,
      fieldValues: db.prepare('SELECT COUNT(*) AS count FROM item_field_values').get().count,
      photos: db.prepare('SELECT COUNT(*) AS count FROM item_photos').get().count
    };

    discardStagedUpload(stagedFile);
    pruneSafetyBackups(path.basename(safetyPath));
    return { summary: { ...summary, ...restored }, safety_backup: path.basename(safetyPath) };
  } catch (error) {
    console.error('[restore] restore failed', error);
    discardStagedUpload(stagedFile);
    if (!swapStarted) throw error.status ? error : badRequest('The backup could not be restored. The current data was not changed.');
    try {
      rollback(safetyPath);
    } catch (recoveryError) {
      // Nothing is deleted here: every recoverable file stays on disk for manual recovery.
      criticalFailure = { safetyPath, at: new Date().toISOString() };
      console.error(`[restore] CRITICAL: rollback failed. Safety backup kept at ${safetyPath}, active database at ${databasePath}`, recoveryError);
      throw Object.assign(new Error('The restore failed and the previous database could not be recovered automatically. The application is stopped for writes; recover the pre-restore backup manually.'), { status: 500 });
    }
    throw Object.assign(new Error('The restore failed and the previous database was recovered. No data was lost.'), { status: 500 });
  } finally {
    restoreRunning = false;
  }
};

const sweepTimer = setInterval(sweepExpiredSessions, 60_000);
sweepTimer.unref();
