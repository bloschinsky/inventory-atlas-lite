// Checklist runs and their per-item states. A run only ever reads its own snapshot rows, so editing or
// deleting the checklist it came from never changes it.
const SUMMARY = `
  SELECT r.id, r.checklist_id, r.checklist_name_snapshot, r.mode, r.status, r.started_at, r.completed_at,
    COUNT(ri.id) AS total,
    COALESCE(SUM(ri.status = 'confirmed'), 0) AS confirmed,
    COALESCE(SUM(ri.status = 'missing'), 0) AS missing,
    COALESCE(SUM(ri.status = 'pending'), 0) AS pending
  FROM checklist_runs r LEFT JOIN checklist_run_items ri ON ri.run_id = r.id
`;

export class ChecklistRunRepository {
  constructor(db) {
    this.db = db;
  }

  insert({ checklistId, name, mode }) {
    return this.db.prepare('INSERT INTO checklist_runs (checklist_id, checklist_name_snapshot, mode) VALUES (?, ?, ?)')
      .run(checklistId, name, mode).lastInsertRowid;
  }

  // The run's own copy of the checklist as it is now: every entry still linked to an item, in order,
  // under the item's current name. Returns how many entries were copied.
  copyEntries(runId, checklistId) {
    return this.db.prepare(`
      INSERT INTO checklist_run_items (run_id, item_id, item_name_snapshot, position)
      SELECT ?, i.id, i.name, ROW_NUMBER() OVER (ORDER BY ci.sort_order, ci.id) - 1
      FROM checklist_items ci JOIN items i ON i.id = ci.item_id WHERE ci.checklist_id = ?
    `).run(runId, checklistId).changes;
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM checklist_runs WHERE id = ?').get(id);
  }

  // The item link and photo are read live only to offer Open item and a thumbnail; the name never is.
  listItems(runId) {
    return this.db.prepare(`
      SELECT ri.id, ri.item_id, ri.item_name_snapshot, ri.position, ri.status, ri.checked_at, ri.note, i.uuid AS item_uuid,
        (SELECT id FROM item_photos p WHERE p.item_id = ri.item_id ORDER BY p.id LIMIT 1) AS thumbnail_id
      FROM checklist_run_items ri LEFT JOIN items i ON i.id = ri.item_id
      WHERE ri.run_id = ? ORDER BY ri.position, ri.id
    `).all(runId);
  }

  findItem(runId, runItemId) {
    return this.db.prepare('SELECT * FROM checklist_run_items WHERE run_id = ? AND id = ?').get(runId, runItemId);
  }

  // Every explicit check stamps the time again; returning to pending clears it.
  setItemStatus(runItemId, status) {
    this.db.prepare(`
      UPDATE checklist_run_items SET status = @status,
        checked_at = CASE WHEN @status = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END
      WHERE id = @id
    `).run({ id: runItemId, status });
  }

  setItemNote(runItemId, note) {
    this.db.prepare('UPDATE checklist_run_items SET note = ? WHERE id = ?').run(note, runItemId);
  }

  complete(id) {
    this.db.prepare("UPDATE checklist_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  }

  // Newest first, with the state counts of each run from one grouped statement.
  listSummaries({ checklistId } = {}) {
    if (checklistId === undefined) return this.db.prepare(`${SUMMARY} GROUP BY r.id ORDER BY r.id DESC`).all();
    return this.db.prepare(`${SUMMARY} WHERE r.checklist_id = ? GROUP BY r.id ORDER BY r.id DESC`).all(checklistId);
  }

  // The most recent run of every checklist that still exists.
  listLatestSummaries() {
    return this.db.prepare(`
      ${SUMMARY} WHERE r.id IN (SELECT MAX(id) FROM checklist_runs WHERE checklist_id IS NOT NULL GROUP BY checklist_id)
      GROUP BY r.id
    `).all();
  }
}
