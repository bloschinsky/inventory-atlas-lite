/*
  Every statement is prepared when it is used. A restore replaces the connection behind the `db`
  proxy, and anything prepared once would stay bound to the database that was swapped out.
*/
export class CategoryRepository {
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  listNames() {
    return this.db.prepare('SELECT id, name FROM categories ORDER BY name COLLATE NOCASE').all();
  }

  listWithCounts() {
    return this.db.prepare(`
      SELECT c.*, COUNT(DISTINCT i.id) AS item_count, COUNT(DISTINCT f.id) AS field_count
      FROM categories c LEFT JOIN items i ON i.category_id = c.id
      LEFT JOIN custom_fields f ON f.category_id = c.id
      GROUP BY c.id ORDER BY c.name COLLATE NOCASE
    `).all();
  }

  insert(name) {
    return this.db.prepare('INSERT INTO categories (name) VALUES (?)').run(name).lastInsertRowid;
  }

  updateName(id, name) {
    this.db.prepare('UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, id);
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes;
  }

  countItemsUsing(id) {
    return this.db.prepare('SELECT COUNT(*) AS count FROM items WHERE category_id = ?').get(id).count;
  }
}
