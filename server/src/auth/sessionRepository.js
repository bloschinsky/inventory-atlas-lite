// Browser sessions in the security store. Only a hash of each session secret is kept.
const mapSession = row => row && ({
  id: row.id,
  userId: row.user_id,
  secretHash: row.secret_hash,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  expiresAt: row.expires_at,
  authenticatedAt: row.authenticated_at,
  userAgent: row.user_agent,
  ip: row.ip
});

export class SessionRepository {
  constructor(db) {
    this.db = db;
  }

  create(session) {
    this.db.prepare(`INSERT INTO sessions (id, user_id, secret_hash, created_at, last_seen_at, expires_at, authenticated_at, user_agent, ip)
      VALUES (@id, @userId, @secretHash, @createdAt, @lastSeenAt, @expiresAt, @authenticatedAt, @userAgent, @ip)`).run(session);
  }

  findById(id) {
    return mapSession(this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
  }

  listForUser(userId) {
    return this.db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').all(userId).map(mapSession);
  }

  touch(id, now) {
    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, id);
  }

  markAuthenticated(id, now) {
    this.db.prepare('UPDATE sessions SET authenticated_at = ?, last_seen_at = ? WHERE id = ?').run(now, now, id);
  }

  delete(id) {
    return this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes;
  }

  deleteForUser(userId, { except = null } = {}) {
    return this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, except).changes;
  }

  deleteExpired(now, idleMs) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?').run(now, now - idleMs);
  }
}
