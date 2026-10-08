import { coverPhotoIdSql } from './itemPhotoRepository.js';

// Checklist runs and their per-item states. A run only ever reads its own snapshot rows, so editing or
// deleting the checklist it came from never changes it.
const SUMMARY = `
  SELECT r.id, r.checklist_id, r.checklist_name_snapshot, r.mode, r.status, r.started_at, r.completed_at, r.source,
    r.source_container_item_id, r.source_container_name_snapshot, r.audit_scope, r.skipped_retired_count,
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

  // A container audit is a verification run with no checklist; the container's name is its snapshot.
  insertAudit({ container, scope }) {
    return this.db.prepare(`
      INSERT INTO checklist_runs (checklist_id, checklist_name_snapshot, mode, source, source_container_item_id,
        source_container_name_snapshot, audit_scope)
      VALUES (NULL, @name, 'verification', 'container_audit', @id, @name, @scope)
    `).run({ id: container.id, name: container.name, scope }).lastInsertRowid;
  }

  /*
    The run's own copy of the checklist as it is now: every entry still linked to an active item, in
    order, under the item's current name. Retired items are left out and only counted on the run.
    Returns how many entries were copied.
  */
  copyEntries(runId, checklistId) {
    const copied = this.db.prepare(`
      INSERT INTO checklist_run_items (run_id, item_id, item_name_snapshot, position)
      SELECT ?, i.id, i.name, ROW_NUMBER() OVER (ORDER BY ci.sort_order, ci.id) - 1
      FROM checklist_items ci JOIN items i ON i.id = ci.item_id WHERE ci.checklist_id = ? AND i.lifecycle_status = 'active'
    `).run(runId, checklistId).changes;
    this.db.prepare(`
      UPDATE checklist_runs SET skipped_retired_count = (
        SELECT COUNT(*) FROM checklist_items ci JOIN items i ON i.id = ci.item_id
        WHERE ci.checklist_id = ? AND i.lifecycle_status = 'retired'
      ) WHERE id = ?
    `).run(checklistId, runId);
    return copied;
  }

  /*
    The run's own copy of what the container holds now: its direct children, or every descendant for
    a nested audit, never the container itself. Each descendant follows its own container, siblings in
    name order. An item is copied once even over a damaged row that forms a cycle, and the depth guard
    ends such a walk. Only active items are copied. Returns how many items were copied.
  */
  copyContainerContents(runId, containerId, nested) {
    return this.db.prepare(`
      WITH RECURSIVE contents(id, name, depth, sort_path) AS (
        SELECT id, name, 1, lower(name) || char(1) || printf('%010d', id) FROM items
        WHERE parent_item_id = @containerId AND lifecycle_status = 'active'
        UNION ALL SELECT i.id, i.name, c.depth + 1, c.sort_path || char(2) || lower(i.name) || char(1) || printf('%010d', i.id)
        FROM items i JOIN contents c ON i.parent_item_id = c.id WHERE @nested AND c.depth < 100 AND i.lifecycle_status = 'active'
      ), unique_contents AS (
        SELECT id, name, MIN(sort_path) AS sort_path FROM contents WHERE id != @containerId GROUP BY id
      )
      INSERT INTO checklist_run_items (run_id, item_id, item_name_snapshot, position)
      SELECT @runId, id, name, ROW_NUMBER() OVER (ORDER BY sort_path) - 1 FROM unique_contents
    `).run({ runId, containerId, nested: nested ? 1 : 0 }).changes;
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM checklist_runs WHERE id = ?').get(id);
  }

  // The item link, photo, and lifecycle status are read live only to offer Open item, a thumbnail, and
  // the Retired mark; the name never is.
  listItems(runId) {
    return this.db.prepare(`
      SELECT ri.id, ri.item_id, ri.item_name_snapshot, ri.position, ri.status, ri.checked_at, ri.note, i.uuid AS item_uuid,
        i.lifecycle_status = 'retired' AS retired,
        ${coverPhotoIdSql('ri.item_id')} AS thumbnail_id
      FROM checklist_run_items ri LEFT JOIN items i ON i.id = ri.item_id
      WHERE ri.run_id = ? ORDER BY ri.position, ri.id
    `).all(runId);
  }

  findItem(runId, runItemId) {
    return this.db.prepare('SELECT * FROM checklist_run_items WHERE run_id = ? AND id = ?').get(runId, runItemId);
  }

  // The run item of an inventory item, so a check can be addressed by the item's identity alone.
  findItemByInventoryItem(runId, itemId) {
    return this.db.prepare('SELECT * FROM checklist_run_items WHERE run_id = ? AND item_id = ? ORDER BY id LIMIT 1').get(runId, itemId);
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

  /*
    Stamps last_verified_at on every item the run confirmed present, with the time it was marked. An
    item keeps a newer verification it already has, so completing an older run never moves it back.
    Missing, pending, and deleted items (no link) are never touched, and no other column of the item is.
  */
  recordVerifiedItems(runId) {
    this.db.prepare(`
      UPDATE items SET last_verified_at = verified.checked_at
      FROM (
        SELECT item_id, MAX(COALESCE(checked_at, CURRENT_TIMESTAMP)) AS checked_at FROM checklist_run_items
        WHERE run_id = ? AND status = 'confirmed' AND item_id IS NOT NULL GROUP BY item_id
      ) verified
      WHERE items.id = verified.item_id AND (items.last_verified_at IS NULL OR items.last_verified_at < verified.checked_at)
    `).run(runId);
  }

  // Newest first, with the state counts of each run from one grouped statement.
  listSummaries({ checklistId, containerId } = {}) {
    if (checklistId !== undefined) {
      return this.db.prepare(`${SUMMARY} WHERE r.checklist_id = ? GROUP BY r.id ORDER BY r.id DESC`).all(checklistId);
    }
    if (containerId !== undefined) {
      return this.db.prepare(`${SUMMARY} WHERE r.source_container_item_id = ? GROUP BY r.id ORDER BY r.id DESC`).all(containerId);
    }
    return this.db.prepare(`${SUMMARY} GROUP BY r.id ORDER BY r.id DESC`).all();
  }

  // The most recent run of every checklist that still exists.
  listLatestSummaries() {
    return this.db.prepare(`
      ${SUMMARY} WHERE r.id IN (SELECT MAX(id) FROM checklist_runs WHERE checklist_id IS NOT NULL GROUP BY checklist_id)
      GROUP BY r.id
    `).all();
  }
}
