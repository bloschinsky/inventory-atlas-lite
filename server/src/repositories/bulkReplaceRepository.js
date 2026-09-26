// The item columns a bulk replacement may write, by their Items column key. A request only ever
// selects a key here, never SQL.
const CORE_COLUMNS = { condition: 'condition', location: 'location', transferredTo: 'transferred_to' };

export const REPLACEABLE_CORE_KEYS = Object.keys(CORE_COLUMNS);

const coreColumn = key => {
  if (!Object.hasOwn(CORE_COLUMNS, key)) throw new Error(`Unsupported bulk replace column: ${key}`);
  return CORE_COLUMNS[key];
};

// SQL and row mapping of Bulk Replace Value. `target` is { key } of a core column or { fieldId } of
// one custom field. Item ids travel as a single JSON parameter, so no count hits the bound-parameter limit.
export class BulkReplaceRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(work) {
    return this.db.transaction(work)();
  }

  listTextFields() {
    return this.db.prepare(`
      SELECT f.id, f.name, c.id AS category_id, c.name AS category_name FROM custom_fields f
      JOIN categories c ON c.id = f.category_id WHERE f.type = 'text'
      ORDER BY f.name COLLATE NOCASE, c.name COLLATE NOCASE, f.id
    `).all();
  }

  findField(id) {
    return this.db.prepare(`
      SELECT f.id, f.name, f.type, c.name AS category_name FROM custom_fields f
      JOIN categories c ON c.id = f.category_id WHERE f.id = ?
    `).get(id);
  }

  // Every saved, non-blank value of the target with its item id: the raw material of matching.
  // Only these two columns are read, never whole items.
  listValues(target) {
    if (target.fieldId) {
      return this.db.prepare(`
        SELECT item_id, value FROM item_field_values
        WHERE field_id = ? AND value IS NOT NULL AND TRIM(value) != '' ORDER BY item_id
      `).all(target.fieldId);
    }
    const column = coreColumn(target.key);
    return this.db.prepare(`
      SELECT id AS item_id, ${column} AS value FROM items
      WHERE ${column} IS NOT NULL AND TRIM(${column}) != '' ORDER BY id
    `).all();
  }

  listItems(ids, limit) {
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, c.name AS category_name FROM items i
      JOIN categories c ON c.id = i.category_id WHERE i.id IN (SELECT value FROM json_each(?))
      ORDER BY i.name COLLATE NOCASE, i.id LIMIT ?
    `).all(JSON.stringify(ids), limit);
  }

  // Writes only the saved value of the given items. A container's descendants keep their own rows;
  // they follow the new location through the effective-location inheritance.
  replace(target, itemIds, value) {
    const ids = JSON.stringify(itemIds);
    if (target.fieldId) {
      const changes = this.db.prepare(`
        UPDATE item_field_values SET value = ? WHERE field_id = ? AND item_id IN (SELECT value FROM json_each(?))
      `).run(value, target.fieldId, ids).changes;
      this.touchItems(itemIds);
      return changes;
    }
    const column = coreColumn(target.key);
    return this.db.prepare(`
      UPDATE items SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT value FROM json_each(?))
    `).run(value, ids).changes;
  }

  // A changed custom field value is a change of its item.
  touchItems(itemIds) {
    this.db.prepare('UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT value FROM json_each(?))')
      .run(JSON.stringify(itemIds));
  }
}
