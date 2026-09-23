import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_VERSION, createFreshDatabase } from '../db.js';
import { httpError } from '../httpError.js';
import { assertDiskSpace, badRequest, fileSize, summarize, verifyDatabaseFile } from '../restore/databaseFile.js';
import { RESET_CONFIRMATION_PHRASE } from '../restore/restoreConfig.js';

const hashToken = token => crypto.createHash('sha256').update(token).digest();

// A reset database is the current schema with no rows at all. Every table is checked, so tables added
// by future versions are covered without changing this code.
const assertEmptyCurrentSchema = connection => {
  if (Number(connection.pragma('user_version', { simple: true })) !== SCHEMA_VERSION) {
    throw new Error('The reset database does not carry the current schema version.');
  }
  const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) {
    if (connection.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count) throw new Error(`Table ${name} is not empty.`);
  }
};

/*
  Resets the inventory to the state of a fresh installation. Nothing is deleted row by row: a new
  database is created through the normal schema path, verified, and swapped in as a whole after a
  verified pre-reset backup of the current one — the same replacement a restore performs. Settings
  stored outside the database file, and every earlier backup, are never touched.

  The flow takes two requests: prepare returns the current counts with a short-lived single-use token,
  and apply needs that token plus the typed confirmation phrase.
*/
export class ResetService {
  constructor({ db, maintenance, dataDir, backupDir, tokenTtlMs }) {
    this.db = db;
    this.maintenance = maintenance;
    this.dataDir = dataDir;
    this.backupDir = backupDir;
    this.tokenTtlMs = tokenTtlMs;
    // Only the most recently prepared reset can be applied, and only a hash of its token is kept.
    this.pending = null;
  }

  prepare() {
    this.maintenance.assertIdle();
    const token = crypto.randomBytes(32).toString('hex');
    this.pending = { hash: hashToken(token), expiresAt: Date.now() + this.tokenTtlMs };
    return { counts: summarize(this.db), resetToken: token, expiresInSeconds: Math.round(this.tokenTtlMs / 1000) };
  }

  // Single use: a matching token is consumed before the reset starts, whatever the outcome.
  claimToken(token) {
    if (typeof token !== 'string' || !token) throw badRequest('The reset token is missing. Open the reset dialog again.');
    const pending = this.pending;
    if (!pending || !crypto.timingSafeEqual(pending.hash, hashToken(token))) {
      throw badRequest('The reset token is invalid or was already used. Open the reset dialog again.');
    }
    this.pending = null;
    if (pending.expiresAt <= Date.now()) throw badRequest('The reset token has expired. Open the reset dialog again.');
  }

  createCandidate(file) {
    try {
      this.maintenance.testFailure('fresh-database');
      createFreshDatabase(file);
      fs.chmodSync(file, 0o600);
    } catch (error) {
      console.error('[reset] fresh database initialization failed', error);
      throw httpError('The fresh database could not be created. Nothing was changed.', 500);
    }
    try {
      this.maintenance.testFailure('fresh-verify');
      verifyDatabaseFile(file, 'The fresh database failed verification.', true);
      const candidate = new Database(file, { fileMustExist: true, readonly: true });
      try { assertEmptyCurrentSchema(candidate); } finally { candidate.close(); }
    } catch (error) {
      console.error('[reset] fresh database verification failed', error);
      throw httpError('The fresh database failed its integrity or schema check. Nothing was changed.', 500);
    }
  }

  // Readiness of the reopened active database: verified, foreign keys enforced, and empty.
  verifyActive() {
    this.maintenance.reopenAndVerify('The reset database failed verification.');
    if (Number(this.db.pragma('foreign_keys', { simple: true })) !== 1) throw new Error('Foreign keys are not enforced after the reset.');
    assertEmptyCurrentSchema(this.db);
    return summarize(this.db);
  }

  async apply(token, confirmation) {
    this.maintenance.assertRecoverable();
    if (confirmation !== RESET_CONFIRMATION_PHRASE) {
      throw badRequest(`Type ${RESET_CONFIRMATION_PHRASE} to confirm that all inventory data will be removed.`);
    }
    this.claimToken(token);
    this.maintenance.acquire('reset');

    const candidatePath = this.maintenance.candidatePath('reset-candidate');
    let safetyPath = null;
    let stage = 'prepare';
    try {
      await this.maintenance.waitForBackupDownloads();
      assertDiskSpace(this.dataDir, 2 * fileSize(this.maintenance.database.path) + 16 * 1024 * 1024,
        'Not enough free disk space for the safety backup. Nothing was changed.');
      safetyPath = await this.maintenance.writeSafetyBackup(this.backupDir, 'pre-reset');
      this.createCandidate(candidatePath);
      await this.maintenance.testPause();

      stage = 'swap';
      this.maintenance.swapIn(candidatePath);
      stage = 'health';
      this.maintenance.testFailure('after-swap');
      const counts = this.verifyActive();
      console.log(`[reset] inventory reset completed; pre-reset backup ${path.basename(safetyPath)}`);
      return { counts, safetyBackup: path.basename(safetyPath) };
    } catch (error) {
      console.error('[reset] reset failed', error);
      if (stage === 'prepare') throw error.status ? error : httpError('The inventory could not be reset. Nothing was changed.', 500);
      this.maintenance.recover(safetyPath, 'The reset failed and the previous inventory could not be recovered automatically. The application is stopped for writes; recover the pre-reset backup manually.');
      const reason = stage === 'swap' ? 'while the database was being replaced' : 'its post-reset health check';
      throw httpError(`The reset failed ${reason}. The previous inventory was recovered from the safety backup; no data was lost.`, 500);
    } finally {
      fs.rmSync(candidatePath, { force: true });
      this.maintenance.release();
    }
  }
}
