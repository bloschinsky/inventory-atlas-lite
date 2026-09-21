import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDirectory, removeSidecars } from './databaseFile.js';

/*
  Owns the staged uploads and their single-use tokens: where the file lives, how long it may stay,
  and how it is removed again. Nothing here decides whether a restore may run.
*/
export class RestoreStagingStore {
  constructor({ stagingDir, tokenTtlMs }) {
    this.stagingDir = stagingDir;
    this.tokenTtlMs = tokenTtlMs;
    this.sessions = new Map();
  }

  // Leftovers from a crash or a hard kill are not recoverable sessions, so startup clears them.
  reset() {
    fs.rmSync(this.stagingDir, { recursive: true, force: true });
    ensureDirectory(this.stagingDir);
  }

  // A sweep every minute keeps expired uploads from lingering on disk between requests.
  startSweepTimer(intervalMs = 60_000) {
    const timer = setInterval(() => this.sweepExpired(), intervalMs);
    timer.unref();
    return timer;
  }

  stagedFileName() {
    return `staged-${crypto.randomBytes(16).toString('hex')}.sqlite`;
  }

  create(file, summary, originalName, size) {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, { file, expiresAt: Date.now() + this.tokenTtlMs, summary });
    return {
      restore_token: token,
      expires_in_seconds: Math.round(this.tokenTtlMs / 1000),
      filename: path.basename(String(originalName || 'backup.sqlite')),
      size_bytes: size,
      summary
    };
  }

  has(token) {
    return this.sessions.has(token);
  }

  // Single use: the caller owns the staged file from here on.
  claim(token) {
    const session = this.sessions.get(token);
    this.sessions.delete(token);
    return session;
  }

  discardSession(token) {
    const session = this.sessions.get(token);
    if (!session) return;
    this.sessions.delete(token);
    this.discardUpload(session.file);
  }

  discardUpload(file) {
    if (!file) return;
    fs.rmSync(file, { force: true });
    removeSidecars(file);
  }

  sweepExpired() {
    for (const [token, session] of this.sessions) if (session.expiresAt <= Date.now()) this.discardSession(token);
  }

  clearAll() {
    for (const token of [...this.sessions.keys()]) this.discardSession(token);
  }
}
