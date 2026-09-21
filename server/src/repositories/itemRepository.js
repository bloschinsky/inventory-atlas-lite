import { randomUUID } from 'node:crypto';
import { containsLike } from './sql.js';

const SORT_COLUMNS = {
  name: 'i.name COLLATE NOCASE',
  category: 'c.name COLLATE NOCASE',
  created: 'i.created_at',
  updated: 'i.updated_at'
};

export class ItemRepository {
  constructor(db) {
    this.db = db;
  }

  // Lets a service keep a multi-statement use case atomic without knowing the driver.
  transaction(work) {
    return this.db.transaction(work)();
  }

  // Accepts either the numeric id or the public UUID, exactly as the API always has.
  findDetailed(id) {
    return this.db.prepare(`
      SELECT i.*, c.name AS category_name FROM items i
      JOIN categories c ON c.id = i.category_id WHERE i.id = ? OR i.uuid = ?
    `).get(id, id);
  }

  findRef(id) {
    return this.db.prepare('SELECT id, uuid, name FROM items WHERE id = ?').get(id);
  }

  listDescendantIds(id) {
    return this.db.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM items WHERE parent_item_id = @id
        UNION ALL SELECT i.id FROM items i JOIN tree t ON i.parent_item_id = t.id
      ) SELECT id FROM tree
    `).all({ id }).map(row => row.id);
  }

  listChildren(id) {
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, i.condition, c.name AS category_name,
        (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
      FROM items i JOIN categories c ON c.id = i.category_id
      WHERE i.parent_item_id = ? ORDER BY i.name COLLATE NOCASE
    `).all(id);
  }

  listFieldValues(itemId, categoryId) {
    return this.db.prepare(`
      SELECT f.id, f.name, f.type, v.value FROM custom_fields f
      LEFT JOIN item_field_values v ON v.field_id = f.id AND v.item_id = ?
      WHERE f.category_id = ? ORDER BY f.id
    `).all(itemId, categoryId);
  }

  search({ search, categoryId, sort, direction, limit, offset }) {
    const column = SORT_COLUMNS[sort] || SORT_COLUMNS.name;
    const order = direction === 'desc' ? 'DESC' : 'ASC';
    const where = [];
    const params = {};
    if (search) {
      where.push('(i.name LIKE @search ESCAPE \'\\\' OR i.description LIKE @search ESCAPE \'\\\' OR i.serial_number LIKE @search ESCAPE \'\\\')');
      params.search = containsLike(search);
    }
    if (categoryId) {
      where.push('i.category_id = @categoryId');
      params.categoryId = categoryId;
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM items i ${clause}`).get(params).count;
    const rows = this.db.prepare(`
      SELECT i.id, i.uuid, i.name, i.condition, i.location, i.purchase_date,
        i.purchase_price_amount, i.purchase_price_currency, i.serial_number, i.created_at, i.updated_at,
        c.id AS category_id, c.name AS category_name,
        parent.id AS parent_id, parent.name AS parent_name,
        (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
      FROM items i JOIN categories c ON c.id = i.category_id
      LEFT JOIN items parent ON parent.id = i.parent_item_id ${clause}
      ORDER BY ${column} ${order}, i.id ASC LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });
    return { rows, total };
  }

  listParentCandidates({ search, excludedIds }) {
    const where = [];
    const params = {};
    if (search) {
      where.push("i.name LIKE @search ESCAPE '\\'");
      params.search = containsLike(search);
    }
    if (excludedIds.length) where.push(`i.id NOT IN (${excludedIds.join(',')})`);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, c.name AS category_name FROM items i
      JOIN categories c ON c.id = i.category_id ${clause}
      ORDER BY i.name COLLATE NOCASE LIMIT 20
    `).all(params);
  }

  insert(attributes) {
    return this.db.prepare(`
      INSERT INTO items (uuid, name, category_id, description, condition, location, purchase_date,
        purchase_price_amount, purchase_price_currency, serial_number, parent_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), attributes.name, attributes.categoryId, attributes.description, attributes.condition,
      attributes.location, attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.parentId).lastInsertRowid;
  }

  update(id, attributes) {
    this.db.prepare(`
      UPDATE items SET name = ?, category_id = ?, description = ?, condition = ?, location = ?,
        purchase_date = ?, purchase_price_amount = ?, purchase_price_currency = ?, serial_number = ?,
        parent_item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(attributes.name, attributes.categoryId, attributes.description, attributes.condition, attributes.location,
      attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.parentId, id);
  }

  saveFieldValue(itemId, fieldId, value) {
    this.db
      .prepare('INSERT INTO item_field_values (item_id, field_id, value) VALUES (?, ?, ?) ON CONFLICT(item_id, field_id) DO UPDATE SET value = excluded.value')
      .run(itemId, fieldId, value);
  }

  countChildren(id) {
    return this.db.prepare('SELECT COUNT(*) AS count FROM items WHERE parent_item_id = ?').get(id).count;
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM items WHERE id = ?').run(id).changes;
  }
}
