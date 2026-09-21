export class ItemPhotoRepository {
  constructor(db) {
    this.db = db;
  }

  listMetadata(itemId) {
    return this.db.prepare('SELECT id, filename, mime_type, created_at FROM item_photos WHERE item_id = ? ORDER BY id').all(itemId);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM item_photos WHERE id = ?').get(id);
  }

  insertMany(itemId, files) {
    const insert = this.db.prepare('INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES (?, ?, ?, ?)');
    const ids = this.db.transaction(uploads => uploads.map(file => insert.run(itemId, file.originalname, file.mimetype, file.buffer).lastInsertRowid))(files);
    return this.db.prepare(`SELECT id, filename, mime_type, created_at FROM item_photos WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM item_photos WHERE id = ?').run(id).changes;
  }
}
