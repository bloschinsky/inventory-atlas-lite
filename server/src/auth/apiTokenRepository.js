// API tokens in the security store. Only a hash of each token secret is kept.
const mapToken = row => row && ({
  id: row.id,
  name: row.name,
  ownerUserId: row.owner_user_id,
  ownerUsername: row.owner_username ?? null,
  scopes: JSON.parse(row.scopes),
  secretHash: row.secret_hash,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at
});

export class ApiTokenRepository {
  constructor(db) {
    this.db = db;
  }

  create(token) {
    this.db.prepare(`INSERT INTO api_tokens (id, name, owner_user_id, scopes, secret_hash, created_at, expires_at)
      VALUES (@id, @name, @ownerUserId, @scopes, @secretHash, @createdAt, @expiresAt)`).run({ ...token, scopes: JSON.stringify(token.scopes) });
    return this.findById(token.id);
  }

  findById(id) {
    return mapToken(this.db.prepare(`SELECT api_tokens.*, users.username AS owner_username FROM api_tokens
      JOIN users ON users.id = api_tokens.owner_user_id WHERE api_tokens.id = ?`).get(id));
  }

  list() {
    return this.db.prepare(`SELECT api_tokens.*, users.username AS owner_username FROM api_tokens
      JOIN users ON users.id = api_tokens.owner_user_id ORDER BY api_tokens.created_at DESC`).all().map(mapToken);
  }

  touch(id, now) {
    this.db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(now, id);
  }

  revokeForOwner(ownerUserId, now) {
    return this.db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE owner_user_id = ? AND revoked_at IS NULL').run(now, ownerUserId).changes;
  }

  revoke(id, now) {
    return this.db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, id).changes;
  }
}
