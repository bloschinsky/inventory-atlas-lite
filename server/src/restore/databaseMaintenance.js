import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { httpError } from '../httpError.js';
import { conflict, ensureDirectory, removeSidecars, syncDirectory, unavailable, verifyDatabaseFile } from './databaseFile.js';

/*
  The maintenance state of the active database and the steps every whole-database replacement shares:
  one operation at a time (restore or reset), no overlap with backup downloads, a verified safety
  backup, the atomic swap of a verified candidate, and the rollback to the safety backup. The restore
  and reset services decide what the candidate is; this class decides how it safely becomes active.
*/
export class DatabaseMaintenance {
  constructor({ db, database, dataDir }) {
    this.db = db;
    // The connection lifecycle of the active database, kept behind the calls used here.
    this.database = database;
    this.dataDir = dataDir;
    this.operation = null;
    this.backupsInFlight = 0;
    this.criticalFailure = null;
  }

  isMaintenance() {
    return this.operation !== null || this.criticalFailure !== null;
  }

  status() {
    return {
      ready: !this.isMaintenance(),
      restoring: this.operation === 'restore',
      resetting: this.operation === 'reset',
      critical: this.criticalFailure !== null
    };
  }

  assertRecoverable() {
    if (this.criticalFailure) throw unavailable('The application is in a failed database recovery state and needs manual recovery.');
  }

  // Refuses to start while another replacement runs or a failed one is waiting for manual recovery.
  assertIdle() {
    this.assertRecoverable();
    if (this.operation) throw conflict('Another database restore or reset is already running. Try again in a moment.');
  }

  acquire(operation) {
    this.assertIdle();
    this.operation = operation;
  }

  release() {
    this.operation = null;
  }

  beginBackupDownload() {
    if (this.operation) throw unavailable('The database is being restored or reset. Try the download again in a moment.');
    this.backupsInFlight += 1;
  }

  endBackupDownload() {
    this.backupsInFlight = Math.max(0, this.backupsInFlight - 1);
  }

  async waitForBackupDownloads() {
    for (let attempt = 0; this.backupsInFlight > 0 && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (this.backupsInFlight > 0) throw conflict('A backup download is still running. Try again in a moment.');
  }

  // Test-only hooks, named after the running operation: RESTORE_TEST_FAILURE / RESET_TEST_FAILURE make
  // one step fail, and RESTORE_TEST_DELAY_MS / RESET_TEST_DELAY_MS widen the window before the swap.
  testFailure(step) {
    if (process.env[`${this.operation?.toUpperCase()}_TEST_FAILURE`] === step) throw new Error(`Simulated ${this.operation} failure at ${step}.`);
  }

  async testPause() {
    const delay = Number(process.env[`${this.operation?.toUpperCase()}_TEST_DELAY_MS`]) || 0;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }

  static backupName(directory, prefix) {
    const stamp = `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}Z`;
    const base = `${prefix}-${stamp}`;
    if (!fs.existsSync(path.join(directory, `${base}.sqlite`))) return `${base}.sqlite`;
    return `${base}-${crypto.randomBytes(2).toString('hex')}.sqlite`;
  }

  // A consistent snapshot of the live database, collapsed to one file and verified before anything changes.
  async writeSafetyBackup(directory, prefix) {
    let file = null;
    try {
      ensureDirectory(directory);
      file = path.join(directory, DatabaseMaintenance.backupName(directory, prefix));
      this.testFailure('safety-backup');
      await this.db.backup(file);
    } catch (error) {
      console.error(`[${this.operation}] safety backup failed`, error);
      if (file) fs.rmSync(file, { force: true });
      throw httpError('The safety backup of the current database could not be created. Nothing was changed.', 500);
    }
    try {
      this.testFailure('safety-verify');
      verifyDatabaseFile(file, 'The safety backup of the current database failed verification.', true);
    } catch (error) {
      console.error(`[${this.operation}] safety backup verification failed`, error);
      // An unverified copy is not a recovery point, so it does not stay next to the real ones.
      fs.rmSync(file, { force: true });
      throw httpError('The safety backup of the current database failed verification. Nothing was changed.', 500);
    }
    return file;
  }

  // Candidates sit next to the active database so the final replacement is an atomic rename.
  candidatePath(prefix) {
    return path.join(this.dataDir, `${prefix}-${crypto.randomBytes(8).toString('hex')}.sqlite`);
  }

  swapIn(candidatePath) {
    this.database.close();
    // Stale journals of the replaced database must never be attached to the new one.
    removeSidecars(this.database.path);
    this.testFailure('swap');
    fs.renameSync(candidatePath, this.database.path);
    syncDirectory(this.dataDir);
  }

  reopenAndVerify(message) {
    this.database.open();
    verifyDatabaseFile(this.database.path, message);
    if (this.db.pragma('foreign_key_check').length) throw new Error('The active database contains broken relationships.');
  }

  rollback(safetyPath) {
    try { this.database.close(); } catch { /* the connection may already be gone */ }
    removeSidecars(this.database.path);
    fs.copyFileSync(safetyPath, this.database.path);
    this.database.open();
    verifyDatabaseFile(this.database.path, 'The recovered database failed verification.');
    this.db.prepare('SELECT COUNT(*) AS count FROM items').get();
  }

  // Puts the safety backup back after a failed swap. If even that fails, writes stay blocked and
  // nothing is deleted: every recoverable file stays on disk and its path is logged on the server.
  recover(safetyPath, criticalMessage) {
    try {
      this.rollback(safetyPath);
    } catch (recoveryError) {
      this.criticalFailure = { safetyPath, at: new Date().toISOString() };
      console.error(`[${this.operation}] CRITICAL: rollback failed. Safety backup kept at ${safetyPath}, active database at ${this.database.path}`, recoveryError);
      throw httpError(criticalMessage, 500);
    }
  }
}
