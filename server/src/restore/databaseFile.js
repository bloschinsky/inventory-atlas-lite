import Database from 'better-sqlite3';
import fs from 'node:fs';
import { httpError } from '../httpError.js';
import { CORE_SCHEMA, CURRENT_SCHEMA, SCHEMA_VERSION, applySchema } from '../db.js';

/*
  Everything this project knows about a SQLite file on disk: how to recognize one of our backups,
  how to verify it, and how to keep it a single self-contained file. These are plain functions —
  there is no state to hold and nothing to substitute.
*/

export const badRequest = (code, params) => httpError(400, code, params);
export const conflict = (code, params) => httpError(409, code, params);
export const unavailable = (code, params) => httpError(503, code, params);

// Only our own error codes reach the browser; anything SQLite says stays in the server log.
export const asUserError = (error, code) => {
  if (error?.code && error?.status) return error;
  console.error('[restore]', error);
  return badRequest(code);
};

export const ensureDirectory = directory => fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

export const syncDirectory = directory => {
  // Directory syncing is POSIX-only; on Windows opening a directory handle is not permitted.
  try {
    const handle = fs.openSync(directory, 'r');
    try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  } catch { /* the rename is already atomic; durability of the entry is best effort here */ }
};

export const removeSidecars = file => {
  for (const suffix of ['-wal', '-shm', '-journal']) fs.rmSync(`${file}${suffix}`, { force: true });
};

export const fileSize = file => { try { return fs.statSync(file).size; } catch { return 0; } };

const freeBytes = directory => {
  try {
    const stats = fs.statfsSync(directory);
    return stats.bavail * stats.bsize;
  } catch { return null; }
};

export const assertDiskSpace = (directory, needed, code = 'RESTORE_DISK_SPACE') => {
  const free = freeBytes(directory);
  if (free !== null && free < needed) throw unavailable(code);
};

const hasSqliteHeader = file => {
  const header = Buffer.alloc(16);
  const handle = fs.openSync(file, 'r');
  try { fs.readSync(handle, header, 0, 16, 0); } finally { fs.closeSync(handle); }
  return header.toString('latin1', 0, 15) === 'SQLite format 3';
};

const tableColumns = (connection, table) => connection.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);

// `failure` builds the error a missing table or column is reported with.
const checkSchema = (connection, expected, failure) => {
  const tables = new Set(connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  for (const [table, columns] of Object.entries(expected)) {
    if (!tables.has(table)) throw failure();
    const present = new Set(tableColumns(connection, table));
    for (const column of columns) if (!present.has(column)) throw failure();
  }
};

export const summarize = connection => ({
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
  if (!fs.existsSync(file) || !fileSize(file)) throw badRequest('BACKUP_FILE_EMPTY');
  if (!hasSqliteHeader(file)) throw badRequest('BACKUP_NOT_SQLITE');

  let candidate;
  try {
    candidate = new Database(file, { fileMustExist: true });
  } catch (error) {
    throw asUserError(error, 'BACKUP_UNOPENABLE');
  }
  try {
    // Collapsing the journal makes the candidate a single self-contained file, so the restored
    // database can never depend on a -wal the upload did not include.
    candidate.pragma('journal_mode = delete');
    if (candidate.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw badRequest('BACKUP_INTEGRITY_FAILED');
    }
    const version = Number(candidate.pragma('user_version', { simple: true })) || 0;
    if (version > SCHEMA_VERSION) {
      throw badRequest('BACKUP_FROM_NEWER_VERSION');
    }
    checkSchema(candidate, CORE_SCHEMA, () => badRequest('BACKUP_NOT_INVENTORY_ATLAS'));
    // An older but recognized backup is migrated on the staged copy only, then checked again.
    if (version < SCHEMA_VERSION) applySchema(candidate);
    checkSchema(candidate, CURRENT_SCHEMA, () => badRequest('BACKUP_INCOMPATIBLE'));
    if (candidate.pragma('foreign_key_check').length) {
      throw badRequest('BACKUP_BROKEN_RELATIONSHIPS');
    }
    const summary = summarize(candidate);
    return { ...summary, schemaVersion: SCHEMA_VERSION, migratedFrom: version < SCHEMA_VERSION ? version : null };
  } catch (error) {
    throw asUserError(error, 'BACKUP_UNREADABLE');
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
export const verifyDatabaseFile = (file, message, collapse = false) => {
  const connection = new Database(file, { fileMustExist: true, readonly: !collapse });
  try {
    if (collapse) connection.pragma('journal_mode = delete');
    if (connection.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error(message);
    checkSchema(connection, CURRENT_SCHEMA, () => new Error(message));
    summarize(connection);
  } finally {
    connection.close();
    if (collapse) removeSidecars(file);
  }
};
