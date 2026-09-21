import { startsWithLike } from './sql.js';

export class CustomFieldRepository {
  constructor(db) {
    this.db = db;
  }

  listByCategory(categoryId) {
    return this.db.prepare('SELECT * FROM custom_fields WHERE category_id = ? ORDER BY id').all(categoryId);
  }

  listTypesByCategory(categoryId) {
    return this.db.prepare('SELECT id, type FROM custom_fields WHERE category_id = ?').all(categoryId);
  }

  listNamesByCategory(categoryId) {
    return this.db.prepare('SELECT name FROM custom_fields WHERE category_id = ?').all(categoryId).map(field => field.name);
  }

  listAll() {
    return this.db.prepare('SELECT id, category_id, name, type FROM custom_fields ORDER BY category_id, id').all();
  }

  findById(id) {
    return this.db.prepare('SELECT id, type FROM custom_fields WHERE id = ?').get(id);
  }

  findByIds(ids) {
    return this.db.prepare(`SELECT * FROM custom_fields WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids);
  }

  findWithValueCount(id) {
    return this.db.prepare(`
      SELECT f.*, COUNT(v.id) AS value_count FROM custom_fields f
      LEFT JOIN item_field_values v ON v.field_id = f.id WHERE f.id = ? GROUP BY f.id
    `).get(id);
  }

  insert(categoryId, name, type) {
    const id = this.db.prepare('INSERT INTO custom_fields (category_id, name, type) VALUES (?, ?, ?)').run(categoryId, name, type).lastInsertRowid;
    return this.db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(id);
  }

  // One transaction per batch: an unexpected failure leaves the category exactly as it was.
  insertMany(categoryId, fields) {
    return this.db.transaction(() => {
      const insertField = this.db.prepare('INSERT INTO custom_fields (category_id, name, type) VALUES (?, ?, ?)');
      return fields.map(field => insertField.run(categoryId, field.name, field.type).lastInsertRowid);
    })();
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM custom_fields WHERE id = ?').run(id).changes;
  }

  // Suggestions are the values already saved for this exact field, most used first.
  listValueSuggestions(fieldId, search, limit) {
    return this.db.prepare(`
      SELECT MIN(TRIM(value)) AS value, COUNT(*) AS usage_count FROM item_field_values
      WHERE field_id = @fieldId AND value IS NOT NULL AND TRIM(value) != ''
        AND TRIM(value) LIKE @search ESCAPE '\\'
      GROUP BY TRIM(value) COLLATE NOCASE
      ORDER BY usage_count DESC, value COLLATE NOCASE LIMIT @limit
    `).all({ fieldId, search: startsWithLike(search), limit });
  }
}
