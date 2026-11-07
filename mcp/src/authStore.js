import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/*
  The persistent state of the adapter's OAuth authorization server, in its own SQLite file in
  MCP_STATE_DIR: registered clients, one-time enrollment codes, authorization codes, grants, and
  tokens. It is never inside Atlas's data directory, so no Atlas backup, restore, or reset touches it.

  Only hashes of secrets are kept: an access or refresh token, an authorization code, or an
  enrollment code cannot be read back from the file. The one exception is the client secret of a
  confidential client, which the SDK's token endpoint compares as stored. The directory is 0700 and
  the file 0600 (the process runs with umask 077). SQLite's WAL mode lets the command line
  (src/cli.js) issue codes and revoke clients while the server runs.
*/
export const STORE_FILE = 'mcp-auth.sqlite';
const SCHEMA_VERSION = 1;

export const ENROLLMENT_CODE_TTL_MS = 10 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;
/*
  Registration is anonymous (RFC 7591), so registered-but-unapproved clients must never be able to
  lock the owner out. They live 30 minutes (a real client goes to the consent page at once), and when
  MAX_UNAPPROVED_CLIENTS are waiting a new registration evicts the oldest waiting one instead of being
  refused. Flooding therefore only churns other waiting registrations, and to push out a legitimate one
  an attacker would have to register that many clients in the minutes before the owner approves it,
  past the per-address registration limit. Approved and revoked clients are never evicted.
*/
export const UNAPPROVED_CLIENT_TTL_MS = 30 * 60 * 1000;
export const MAX_UNAPPROVED_CLIENTS = 200;
// Expired authorization codes and used enrollment codes are kept this long for replay detection.
const SPENT_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const secret = prefix => `${prefix}${randomBytes(32).toString('base64url')}`;

// 20 characters from an alphabet without look-alikes (100 bits), shown in five groups.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newEnrollmentCode = () => {
  const bytes = randomBytes(20);
  const chars = [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  return chars.match(/.{4}/g).join('-');
};
export const normalizeEnrollmentCode = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export class AuthStore {
  constructor(stateDir, { clock = Date.now } = {}) {
    this.clock = clock;
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(stateDir, 0o700);
    const file = path.join(stateDir, STORE_FILE);
    this.db = new DatabaseSync(file);
    if (process.platform !== 'win32') chmodSync(file, 0o600);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  migrate() {
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get();
    if (version > SCHEMA_VERSION) throw new Error(`The OAuth store has schema version ${version}; this adapter knows ${SCHEMA_VERSION}.`);
    if (version === SCHEMA_VERSION) return;
    this.db.exec(`
      BEGIN;
      CREATE TABLE clients (
        client_id TEXT PRIMARY KEY,
        client_secret TEXT,
        info TEXT NOT NULL,
        client_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        revoked_at INTEGER,
        last_used_at INTEGER
      );
      CREATE TABLE enrollment_codes (
        code_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        used_by TEXT
      );
      CREATE TABLE authorization_codes (
        code_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        scopes TEXT NOT NULL,
        resource TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at INTEGER,
        grant_id TEXT
      );
      CREATE TABLE grants (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
        scopes TEXT NOT NULL,
        resource TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER,
        revoked_reason TEXT
      );
      CREATE TABLE tokens (
        token_hash TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE INDEX tokens_grant ON tokens(grant_id);
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `);
  }

  close() {
    this.db.close();
  }

  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // Enrollment codes: printed on the host by `cli.js enroll`, typed on the consent page, used once.
  createEnrollmentCode() {
    const code = newEnrollmentCode();
    const now = this.clock();
    this.transaction(() => {
      // A new code replaces every unused one, so only the latest printed code works.
      this.db.prepare('DELETE FROM enrollment_codes WHERE used_at IS NULL OR expires_at < ?').run(now - SPENT_RECORD_TTL_MS);
      this.db.prepare('INSERT INTO enrollment_codes (code_hash, created_at, expires_at) VALUES (?, ?, ?)')
        .run(hash(normalizeEnrollmentCode(code)), now, now + ENROLLMENT_CODE_TTL_MS);
    });
    return { code, expiresAt: now + ENROLLMENT_CODE_TTL_MS };
  }

  // Atomic: of two simultaneous approvals with the same code, exactly one succeeds.
  consumeEnrollmentCode(code, clientId) {
    const normalized = normalizeEnrollmentCode(code);
    if (normalized.length !== 20) return false;
    const now = this.clock();
    return this.db.prepare('UPDATE enrollment_codes SET used_at = ?, used_by = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?')
      .run(now, clientId, hash(normalized), now).changes === 1;
  }

  // Clients registered through Dynamic Client Registration; always accepted, evicting the oldest waiting ones when full.
  registerClient(info) {
    const now = this.clock();
    return this.transaction(() => {
      this.pruneClients();
      const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM clients WHERE approved_at IS NULL AND revoked_at IS NULL').get();
      if (count >= MAX_UNAPPROVED_CLIENTS) {
        this.db.prepare(`DELETE FROM clients WHERE client_id IN (
          SELECT client_id FROM clients WHERE approved_at IS NULL AND revoked_at IS NULL ORDER BY created_at, rowid LIMIT ?
        )`).run(count - MAX_UNAPPROVED_CLIENTS + 1);
      }
      const { client_secret: clientSecret, ...rest } = info;
      this.db.prepare('INSERT INTO clients (client_id, client_secret, info, client_name, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(info.client_id, clientSecret ?? null, JSON.stringify(rest), info.client_name, now);
      return info;
    });
  }

  pruneClients() {
    const now = this.clock();
    this.db.prepare('DELETE FROM clients WHERE approved_at IS NULL AND revoked_at IS NULL AND created_at < ?').run(now - UNAPPROVED_CLIENT_TTL_MS);
    this.db.prepare('DELETE FROM authorization_codes WHERE expires_at < ?').run(now - SPENT_RECORD_TTL_MS);
    this.db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(now);
  }

  clientRow(clientId) {
    return this.db.prepare('SELECT * FROM clients WHERE client_id = ?').get(String(clientId));
  }

  // The client as the SDK expects it, or undefined when it is unknown or revoked.
  getClient(clientId) {
    const row = this.clientRow(clientId);
    if (!row || row.revoked_at) return undefined;
    return { ...JSON.parse(row.info), ...(row.client_secret ? { client_secret: row.client_secret } : {}) };
  }

  // The owner's cleanup (`cli.js prune`): every client still waiting for approval is removed at once.
  removeWaitingClients() {
    return this.db.prepare('DELETE FROM clients WHERE approved_at IS NULL AND revoked_at IS NULL').run().changes;
  }

  waitingClients() {
    return this.db.prepare('SELECT COUNT(*) AS count FROM clients WHERE approved_at IS NULL AND revoked_at IS NULL').get().count;
  }

  approveClient(clientId) {
    this.db.prepare('UPDATE clients SET approved_at = COALESCE(approved_at, ?) WHERE client_id = ? AND revoked_at IS NULL').run(this.clock(), clientId);
  }

  listClients() {
    return this.db.prepare(`
      SELECT c.client_id, c.client_name, c.info, c.created_at, c.approved_at, c.revoked_at, c.last_used_at,
        (SELECT COUNT(*) FROM grants g WHERE g.client_id = c.client_id AND g.revoked_at IS NULL) AS active_grants
      FROM clients c ORDER BY c.created_at
    `).all().map(row => ({
      clientId: row.client_id,
      name: row.client_name,
      redirectUris: JSON.parse(row.info).redirect_uris ?? [],
      createdAt: row.created_at,
      approvedAt: row.approved_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
      activeGrants: row.active_grants
    }));
  }

  // Revoking a client ends every grant and token it holds; other clients are untouched.
  revokeClient(clientId) {
    const now = this.clock();
    return this.transaction(() => {
      const changed = this.db.prepare('UPDATE clients SET revoked_at = ? WHERE client_id = ? AND revoked_at IS NULL').run(now, clientId).changes;
      this.db.prepare("UPDATE grants SET revoked_at = ?, revoked_reason = 'client_revoked' WHERE client_id = ? AND revoked_at IS NULL").run(now, clientId);
      this.db.prepare('DELETE FROM tokens WHERE grant_id IN (SELECT id FROM grants WHERE client_id = ?)').run(clientId);
      return changed === 1;
    });
  }

  // Authorization codes: single use, short-lived, bound to the client, redirect URI, PKCE challenge, and resource.
  createAuthorizationCode({ clientId, redirectUri, codeChallenge, scopes, resource }) {
    const code = randomBytes(32).toString('base64url');
    this.db.prepare(`INSERT INTO authorization_codes (code_hash, client_id, redirect_uri, code_challenge, scopes, resource, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(hash(code), clientId, redirectUri, codeChallenge, JSON.stringify(scopes), resource, this.clock() + AUTHORIZATION_CODE_TTL_MS);
    return code;
  }

  authorizationCode(code) {
    const row = this.db.prepare('SELECT * FROM authorization_codes WHERE code_hash = ?').get(hash(code));
    return row ? { ...row, scopes: JSON.parse(row.scopes) } : null;
  }

  // Counts a token request for this code; past the limit the code is burned (it can no longer be redeemed).
  countCodeAttempt(code) {
    return this.db.prepare('UPDATE authorization_codes SET attempts = attempts + 1 WHERE code_hash = ? RETURNING attempts').get(hash(code))?.attempts ?? 0;
  }

  /*
    Redeems a code once and creates its grant with the first token pair. A second redemption is a
    replay: the code was intercepted or the client is broken, so the grant made from it is revoked.
  */
  redeemAuthorizationCode(code, issue) {
    return this.transaction(() => {
      const now = this.clock();
      const row = this.db.prepare('UPDATE authorization_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING *')
        .get(now, hash(code), now);
      if (!row) {
        const used = this.db.prepare('SELECT grant_id FROM authorization_codes WHERE code_hash = ? AND used_at IS NOT NULL').get(hash(code));
        if (used?.grant_id) this.revokeGrant(used.grant_id, 'code_replayed');
        return { replayed: Boolean(used) };
      }
      const grantId = randomUUID();
      this.db.prepare('INSERT INTO grants (id, client_id, scopes, resource, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(grantId, row.client_id, row.scopes, row.resource, now);
      this.db.prepare('UPDATE authorization_codes SET grant_id = ? WHERE code_hash = ?').run(grantId, hash(code));
      return { grant: { id: grantId, clientId: row.client_id, scopes: JSON.parse(row.scopes), resource: row.resource }, tokens: this.issueTokens(grantId, issue) };
    });
  }

  issueTokens(grantId, { accessTtlMs, refreshTtlMs }) {
    const now = this.clock();
    const accessToken = secret('amcp_at_');
    const refreshToken = secret('amcp_rt_');
    const insert = this.db.prepare('INSERT INTO tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, ?, ?)');
    insert.run(hash(accessToken), grantId, 'access', now + accessTtlMs);
    insert.run(hash(refreshToken), grantId, 'refresh', now + refreshTtlMs);
    this.db.prepare('UPDATE clients SET last_used_at = ? WHERE client_id = (SELECT client_id FROM grants WHERE id = ?)').run(now, grantId);
    return { accessToken, refreshToken, accessExpiresAt: now + accessTtlMs };
  }

  // A token with its grant, or null when it is unknown, of another kind, expired, or its grant or client was revoked.
  token(value, kind) {
    const row = this.db.prepare(`
      SELECT t.kind, t.expires_at, t.used_at, t.grant_id, g.client_id, g.scopes, g.resource, g.revoked_at AS grant_revoked_at, c.revoked_at AS client_revoked_at
      FROM tokens t JOIN grants g ON g.id = t.grant_id JOIN clients c ON c.client_id = g.client_id
      WHERE t.token_hash = ?
    `).get(hash(value));
    if (!row || (kind && row.kind !== kind)) return null;
    return {
      kind: row.kind, grantId: row.grant_id, clientId: row.client_id, scopes: JSON.parse(row.scopes), resource: row.resource,
      expiresAt: row.expires_at, used: row.used_at !== null,
      active: row.expires_at > this.clock() && !row.grant_revoked_at && !row.client_revoked_at
    };
  }

  /*
    Refresh token rotation: the presented token is spent and a new pair issued in one transaction.
    A spent token presented again means it was copied, so the whole grant is revoked: the thief and
    the legitimate client both have to be approved again.
  */
  rotateRefreshToken(value, issue) {
    return this.transaction(() => {
      const now = this.clock();
      const spent = this.db.prepare("UPDATE tokens SET used_at = ? WHERE token_hash = ? AND kind = 'refresh' AND used_at IS NULL AND expires_at > ? RETURNING grant_id")
        .get(now, hash(value), now);
      if (!spent) {
        const reused = this.db.prepare("SELECT grant_id FROM tokens WHERE token_hash = ? AND kind = 'refresh' AND used_at IS NOT NULL").get(hash(value));
        if (reused) this.revokeGrant(reused.grant_id, 'refresh_token_reused');
        return { reused: Boolean(reused) };
      }
      // The access tokens of the previous pair end with the rotation.
      this.db.prepare("DELETE FROM tokens WHERE grant_id = ? AND kind = 'access'").run(spent.grant_id);
      return { tokens: this.issueTokens(spent.grant_id, issue) };
    });
  }

  revokeGrant(grantId, reason) {
    this.db.prepare('UPDATE grants SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL').run(this.clock(), reason, grantId);
    this.db.prepare('DELETE FROM tokens WHERE grant_id = ?').run(grantId);
  }
}
