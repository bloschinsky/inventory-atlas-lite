// The single database_metadata row. Statements are prepared when used, because a restore replaces the
// connection behind the `db` proxy.
export class DatabaseMetadataRepository {
  constructor(db) {
    this.db = db;
  }

  get() {
    return this.db.prepare(`
      SELECT database_uuid, name, created_at, last_updated_at, schema_version, content_language FROM database_metadata WHERE id = 1
    `).get();
  }

  // Renaming the database is itself a modification, so it advances last_updated_at as well.
  updateName(name) {
    return this.db.prepare(`
      UPDATE database_metadata SET name = ?, last_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1
    `).run(name).changes;
  }

  // The Preferred Content Language belongs to the inventory, so changing it is a modification too.
  updateContentLanguage(tag) {
    return this.db.prepare(`
      UPDATE database_metadata SET content_language = ?, last_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1
    `).run(tag).changes;
  }
}
