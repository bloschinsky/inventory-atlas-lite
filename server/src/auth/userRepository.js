// Accounts and their one-time setup and recovery codes in the security store.
const mapUser = row => row && ({
  id: row.id,
  username: row.username,
  role: row.role,
  passwordHash: row.password_hash,
  disabled: row.disabled_at !== null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(work) {
    return this.db.transaction(work)();
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  }

  countActiveAdmins() {
    return this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL").get().count;
  }

  list() {
    return this.db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all().map(mapUser);
  }

  findById(id) {
    return mapUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }

  findByUsername(username) {
    return mapUser(this.db.prepare('SELECT * FROM users WHERE username = ?').get(username));
  }

  create({ username, role, passwordHash, now }) {
    const result = this.db.prepare('INSERT INTO users (username, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(username, role, passwordHash, now, now);
    return this.findById(result.lastInsertRowid);
  }

  setRole(id, role, now) {
    this.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, id);
  }

  setDisabled(id, disabled, now) {
    this.db.prepare('UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?').run(disabled ? now : null, now, id);
  }

  setPasswordHash(id, passwordHash, now) {
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, id);
  }

  // A new code replaces every earlier one of the same purpose (and account), so only the last one printed works.
  replaceCode({ purpose, userId = null, codeHash, now, expiresAt }) {
    this.db.prepare('DELETE FROM one_time_codes WHERE purpose = ? AND user_id IS ?').run(purpose, userId);
    this.db.prepare('INSERT INTO one_time_codes (purpose, user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(purpose, userId, codeHash, now, expiresAt);
  }

  findCode(purpose, codeHash, now) {
    const row = this.db.prepare('SELECT id, user_id FROM one_time_codes WHERE purpose = ? AND code_hash = ? AND expires_at > ?').get(purpose, codeHash, now);
    return row && { id: row.id, userId: row.user_id };
  }

  deleteCode(id) {
    this.db.prepare('DELETE FROM one_time_codes WHERE id = ?').run(id);
  }

  deleteExpiredCodes(now) {
    this.db.prepare('DELETE FROM one_time_codes WHERE expires_at <= ?').run(now);
  }
}
