import Database from 'better-sqlite3';
import fs from 'node:fs';

/*
  The security store: users, sessions, API tokens, one-time codes, and the security audit trail, in
  their own SQLite file next to the inventory. It is never part of an inventory backup, restore, or
  reset, so replacing the inventory can neither bring back an old credential nor remove an account.
*/
export const AUTH_SCHEMA_VERSION = 1;

const MIGRATIONS = [
  // Version 1: the first security store.
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    password_hash TEXT NOT NULL,
    disabled_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    authenticated_at INTEGER NOT NULL,
    user_agent TEXT,
    ip TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE api_tokens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    last_used_at INTEGER,
    revoked_at INTEGER
  );
  CREATE INDEX api_tokens_owner ON api_tokens(owner_user_id);
  CREATE TABLE one_time_codes (
    id INTEGER PRIMARY KEY,
    purpose TEXT NOT NULL CHECK (purpose IN ('setup', 'recovery')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    event TEXT NOT NULL,
    principal_type TEXT,
    actor_user_id INTEGER,
    target TEXT,
    ip TEXT
  );
  CREATE INDEX audit_events_at ON audit_events(at);
  `
];

// Owner-only access for the store and its SQLite sidecar files; Windows keeps its own ACLs.
const restrictFiles = file => {
  if (process.platform === 'win32') return;
  for (const name of [file, `${file}-wal`, `${file}-shm`]) {
    try { fs.chmodSync(name, 0o600); } catch { /* a sidecar file may not exist yet */ }
  }
};

/*
  Opens (or creates) the store and brings it to the current version. A damaged file stops the
  server instead of being replaced: an empty store would silently drop every account and token.
*/
export function openAuthDatabase(file) {
  const connection = new Database(file);
  try {
    connection.pragma('foreign_keys = ON');
    connection.pragma('journal_mode = WAL');
    const check = connection.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error(`quick_check reported: ${check}`);
    const version = connection.pragma('user_version', { simple: true });
    if (version > AUTH_SCHEMA_VERSION) throw new Error(`schema version ${version} is newer than this release supports (${AUTH_SCHEMA_VERSION})`);
    connection.transaction(() => {
      for (let next = version; next < AUTH_SCHEMA_VERSION; next++) {
        connection.exec(MIGRATIONS[next]);
        connection.pragma(`user_version = ${next + 1}`);
      }
    })();
  } catch (error) {
    connection.close();
    throw new Error(`The security store ${file} cannot be opened (${error.message}). See README.md, "Security store recovery".`, { cause: error });
  }
  restrictFiles(file);
  return connection;
}
