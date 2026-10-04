const METADATA = 'id, filename, mime_type, sort_order, created_at';

/*
  The cover of an item is its first photo in the persisted order; there is no separate cover flag.
  Every thumbnail query embeds this subquery, so the list, the hierarchy, the contents, and the
  checklists can never disagree about it. `itemId` is the SQL expression of the item id.
*/
export const coverPhotoIdSql = itemId =>
  `(SELECT id FROM item_photos p WHERE p.item_id = ${itemId} ORDER BY p.sort_order, p.id LIMIT 1)`;

export class ItemPhotoRepository {
  constructor(db) {
    this.db = db;
  }

  // The id keeps the order deterministic should two positions ever be equal.
  listMetadata(itemId) {
    return this.db.prepare(`SELECT ${METADATA} FROM item_photos WHERE item_id = ? ORDER BY sort_order, id`).all(itemId);
  }

  listIds(itemId) {
    return this.listMetadata(itemId).map(photo => photo.id);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM item_photos WHERE id = ?').get(id);
  }

  // Uploaded files keep their submitted order and follow the item's current last photo.
  insertMany(itemId, files) {
    return this.db.transaction(() => {
      const next = this.db.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM item_photos WHERE item_id = ?').get(itemId).next;
      const insert = this.db.prepare('INSERT INTO item_photos (item_id, filename, mime_type, data, sort_order) VALUES (?, ?, ?, ?, ?)');
      const ids = files.map((file, index) => insert.run(itemId, file.originalname, file.mimetype, file.buffer, next + index).lastInsertRowid);
      return this.db.prepare(`SELECT ${METADATA} FROM item_photos WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order`).all(...ids);
    })();
  }

  /*
    Stores `ids`, every photo of the item, at positions 0..n-1. Only rows whose position changes are
    written; they first move to negative positions, so the unique (item_id, sort_order) index never
    sees two rows at one position halfway through.
  */
  writeOrder(itemId, ids) {
    this.db.transaction(() => {
      const current = new Map(this.listMetadata(itemId).map(photo => [photo.id, photo.sort_order]));
      const moved = ids.map((id, position) => ({ id, position })).filter(({ id, position }) => current.get(id) !== position);
      const update = this.db.prepare('UPDATE item_photos SET sort_order = ? WHERE id = ? AND item_id = ?');
      for (const { id, position } of moved) update.run(-1 - position, id, itemId);
      for (const { id, position } of moved) update.run(position, id, itemId);
    })();
  }

  // The remaining photos close the gap, so the next one becomes the cover when the cover is deleted.
  deleteById(id) {
    return this.db.transaction(() => {
      const photo = this.db.prepare('SELECT item_id FROM item_photos WHERE id = ?').get(id);
      if (!photo) return 0;
      this.db.prepare('DELETE FROM item_photos WHERE id = ?').run(id);
      this.writeOrder(photo.item_id, this.listIds(photo.item_id));
      return 1;
    })();
  }
}
