// The security audit trail: what happened, by which kind of principal, never a secret.
const KEPT_EVENTS = 5000;

export class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  record({ at, event, principalType = null, actorUserId = null, target = null, ip = null }) {
    this.db.prepare('INSERT INTO audit_events (at, event, principal_type, actor_user_id, target, ip) VALUES (?, ?, ?, ?, ?, ?)')
      .run(at, event, principalType, actorUserId, target, ip);
  }

  // The trail is bounded: the oldest events are dropped once it grows past the kept count.
  prune() {
    this.db.prepare('DELETE FROM audit_events WHERE id <= (SELECT MAX(id) FROM audit_events) - ?').run(KEPT_EVENTS);
  }

  recent(limit = 100) {
    return this.db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT ?').all(limit);
  }
}
