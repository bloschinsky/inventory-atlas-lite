import { ROOTS_CTE } from './itemRepository.js';

// Reusable checklists and their ordered item references. Statements are prepared when they are used,
// because a restore replaces the connection behind the `db` proxy.
export class ChecklistRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(work) {
    return this.db.transaction(work)();
  }

  list() {
    return this.db.prepare(`
      SELECT c.id, c.name, c.description, c.mode, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM checklist_items ci WHERE ci.checklist_id = c.id) AS item_count
      FROM checklists c ORDER BY c.name COLLATE NOCASE, c.id
    `).all();
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM checklists WHERE id = ?').get(id);
  }

  /*
    The entries in the user's order with what the picker and the details show about the linked item:
    its current name, category, effective location, and first photo. A deleted item leaves a row with
    no link and only its name snapshot.
  */
  listEntries(checklistId) {
    return this.db.prepare(`
      ${ROOTS_CTE}
      SELECT ci.id, ci.item_id, ci.item_name_snapshot, i.uuid AS item_uuid, i.name AS item_name,
        cat.name AS category_name, i.location, root.id AS root_id, root.location AS root_location,
        (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
      FROM checklist_items ci
      LEFT JOIN items i ON i.id = ci.item_id
      LEFT JOIN categories cat ON cat.id = i.category_id
      LEFT JOIN roots ON roots.id = i.id
      LEFT JOIN items root ON root.id = roots.root_id
      WHERE ci.checklist_id = ? ORDER BY ci.sort_order, ci.id
    `).all(checklistId);
  }

  insert({ name, description, mode }) {
    return this.db.prepare('INSERT INTO checklists (name, description, mode) VALUES (?, ?, ?)')
      .run(name, description, mode).lastInsertRowid;
  }

  update(id, { name, description, mode }) {
    this.db.prepare('UPDATE checklists SET name = ?, description = ?, mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name, description, mode, id);
  }

  /*
    Makes the membership exactly `entries`, in their order. An entry with an `id` is an existing row
    that is kept (a deleted item's row keeps its snapshot); one without is a new reference to `itemId`.
    Rows that are not listed are removed first, so the unique live reference can never collide.
  */
  replaceEntries(checklistId, entries) {
    const kept = entries.filter(entry => entry.id).map(entry => entry.id);
    this.db.prepare('DELETE FROM checklist_items WHERE checklist_id = ? AND id NOT IN (SELECT value FROM json_each(?))')
      .run(checklistId, JSON.stringify(kept));
    const move = this.db.prepare('UPDATE checklist_items SET sort_order = ? WHERE id = ? AND checklist_id = ?');
    const insert = this.db.prepare(`
      INSERT INTO checklist_items (checklist_id, item_id, item_name_snapshot, sort_order)
      SELECT ?, id, name, ? FROM items WHERE id = ?
    `);
    entries.forEach((entry, index) => {
      if (entry.id) move.run(index, entry.id, checklistId);
      else insert.run(checklistId, index, entry.itemId);
    });
    this.refreshSnapshots(checklistId);
  }

  // Remembers the current names, so an item deleted later is still shown by its last known name.
  refreshSnapshots(checklistId) {
    this.db.prepare(`
      UPDATE checklist_items SET item_name_snapshot = (SELECT name FROM items WHERE id = checklist_items.item_id)
      WHERE checklist_id = ? AND item_id IS NOT NULL
        AND item_name_snapshot IS NOT (SELECT name FROM items WHERE id = checklist_items.item_id)
    `).run(checklistId);
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM checklists WHERE id = ?').run(id).changes;
  }
}
