/*
  SQL and row mapping of the item activity history: operations, their events, and the loan periods.
  Item ids travel as one JSON parameter, so a large move never runs into the bound-parameter limit,
  and every walk of the hierarchy is one recursive statement rather than a query per item.
*/
export class ItemHistoryRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(work) {
    return this.db.transaction(work)();
  }

  /*
    What history compares before and after a change: every item at or below the given ones, with its
    direct container, its recipient, and the top-level container (`root`) that provides its effective
    location. `top_id` is the given item the row was reached from and `depth` how far below it the row
    is; overlapping ids reach an item more than once, and the caller keeps its nearest top. UNION and
    the depth guards end every walk even over a damaged row that forms a cycle.
  */
  snapshot(ids) {
    return this.db.prepare(`
      WITH RECURSIVE
        up(start_id, id, depth) AS (
          SELECT value, value, 0 FROM json_each(?)
          UNION ALL SELECT up.start_id, i.parent_item_id, up.depth + 1 FROM up JOIN items i ON i.id = up.id
          WHERE i.parent_item_id IS NOT NULL AND up.depth < 100
        ),
        tops(id, root_id) AS (
          SELECT start_id, id FROM (
            SELECT start_id, id, ROW_NUMBER() OVER (PARTITION BY start_id ORDER BY depth DESC) AS position FROM up
          ) WHERE position = 1
        ),
        tree(id, root_id, top_id, depth) AS (
          SELECT id, root_id, id, 0 FROM tops
          UNION SELECT i.id, tree.root_id, tree.top_id, tree.depth + 1 FROM items i JOIN tree ON i.parent_item_id = tree.id
          WHERE tree.depth < 100
        )
      SELECT tree.id, tree.top_id, top.name AS top_name, tree.depth, i.transferred_to,
        i.parent_item_id, parent.name AS parent_name, root.location
      FROM tree JOIN items i ON i.id = tree.id
      JOIN items top ON top.id = tree.top_id
      JOIN items root ON root.id = tree.root_id
      LEFT JOIN items parent ON parent.id = i.parent_item_id
    `).all(JSON.stringify(ids));
  }

  insertOperation(type, createdAt) {
    return Number(this.db.prepare('INSERT INTO item_operations (type, created_at) VALUES (?, ?)').run(type, createdAt).lastInsertRowid);
  }

  insertEvents(operationId, events) {
    const statement = this.db.prepare(`
      INSERT INTO item_events (operation_id, item_id, event_type, occurred_at, from_value, to_value, from_item_id, from_item_name,
        to_item_id, to_item_name, via_item_id, via_item_name, transfer_id)
      VALUES (@operationId, @item_id, @event_type, @occurred_at, @from_value, @to_value, @from_item_id, @from_item_name,
        @to_item_id, @to_item_name, @via_item_id, @via_item_name, @transfer_id)
    `);
    for (const event of events) {
      statement.run({
        from_value: null, to_value: null, from_item_id: null, from_item_name: null, to_item_id: null, to_item_name: null,
        via_item_id: null, via_item_name: null, transfer_id: null, ...event, operationId
      });
    }
  }

  // The position of a page cursor: the event it names, which must belong to the item.
  findEventPosition(itemId, eventId) {
    return this.db.prepare('SELECT id, occurred_at FROM item_events WHERE id = ? AND item_id = ?').get(eventId, itemId);
  }

  /*
    One page of an item's events, newest first. The id breaks ties between events with the same
    time, so pages never repeat or skip a row, and `after` continues below the last row shown. The
    walk runs on idx_item_events_item; `limit` is one more than the page so the caller sees whether
    another page exists. A container name links only while that item still exists.
  */
  listEvents({ itemId, types, after, limit }) {
    const params = { itemId, types: JSON.stringify(types), limit };
    let continuation = '';
    if (after) {
      continuation = 'AND (e.occurred_at < @afterAt OR (e.occurred_at = @afterAt AND e.id < @afterId))';
      Object.assign(params, { afterAt: after.occurred_at, afterId: after.id });
    }
    return this.db.prepare(`
      SELECT e.id, e.operation_id, o.type AS operation_type, e.event_type, e.occurred_at, e.from_value, e.to_value,
        e.from_item_id, e.from_item_name, from_item.id IS NOT NULL AS from_item_exists,
        e.to_item_id, e.to_item_name, to_item.id IS NOT NULL AS to_item_exists,
        e.via_item_id, e.via_item_name, via_item.id IS NOT NULL AS via_item_exists,
        t.id AS transfer_id, t.recipient, t.transferred_at, t.expected_return_on, t.returned_at, t.note, t.return_note
      FROM item_events e
      JOIN item_operations o ON o.id = e.operation_id
      LEFT JOIN items from_item ON from_item.id = e.from_item_id
      LEFT JOIN items to_item ON to_item.id = e.to_item_id
      LEFT JOIN items via_item ON via_item.id = e.via_item_id
      LEFT JOIN item_transfers t ON t.id = e.transfer_id
      WHERE e.item_id = @itemId AND e.event_type IN (SELECT value FROM json_each(@types)) ${continuation}
      ORDER BY e.occurred_at DESC, e.id DESC LIMIT @limit
    `).all(params);
  }

  /*
    Permanently deleting an item deletes its events through their foreign key. The operations that
    only grouped this item's events would stay behind empty, so they go first, in the same transaction.
  */
  deleteItemOperations(itemId) {
    this.db.prepare(`
      DELETE FROM item_operations WHERE id IN (SELECT operation_id FROM item_events WHERE item_id = @itemId)
        AND NOT EXISTS (SELECT 1 FROM item_events e WHERE e.operation_id = item_operations.id AND e.item_id != @itemId)
    `).run({ itemId });
  }

  findOpenTransfer(itemId) {
    return this.db.prepare('SELECT * FROM item_transfers WHERE item_id = ? AND returned_at IS NULL').get(itemId);
  }

  // How many of the given items are on loan now; answered from the partial open-loan index.
  countOpenTransfers(ids) {
    return this.db.prepare(`
      SELECT COUNT(*) AS count FROM item_transfers WHERE returned_at IS NULL AND item_id IN (SELECT value FROM json_each(?))
    `).get(JSON.stringify(ids)).count;
  }

  findTransfer(itemId, transferId) {
    return this.db.prepare('SELECT * FROM item_transfers WHERE id = ? AND item_id = ?').get(transferId, itemId);
  }

  // The end of the item's most recent closed loan; a new loan may not start before it.
  findLatestReturn(itemId) {
    return this.db.prepare('SELECT MAX(returned_at) AS value FROM item_transfers WHERE item_id = ?').get(itemId).value;
  }

  insertTransfer({ itemId, recipient, transferredAt, expectedReturnOn, note }) {
    return Number(this.db.prepare(`
      INSERT INTO item_transfers (item_id, recipient, transferred_at, expected_return_on, note) VALUES (?, ?, ?, ?, ?)
    `).run(itemId, recipient, transferredAt, expectedReturnOn, note).lastInsertRowid);
  }

  closeTransfer(id, { returnedAt, note }) {
    return this.db.prepare('UPDATE item_transfers SET returned_at = ?, return_note = ? WHERE id = ? AND returned_at IS NULL')
      .run(returnedAt, note, id).changes;
  }
}
