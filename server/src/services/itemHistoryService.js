import { httpError } from '../httpError.js';

// The timeline filters and the event types each one shows. Lifecycle events appear under All.
export const HISTORY_FILTERS = {
  all: ['location_changed', 'container_changed', 'recipient_changed', 'transferred', 'returned', 'retired', 'restored'],
  location: ['location_changed', 'container_changed'],
  transfer: ['recipient_changed', 'transferred', 'returned'],
  lifecycle: ['retired', 'restored']
};

export const HISTORY_PAGE_SIZE = 20;
export const MAX_HISTORY_PAGE_SIZE = 50;

/*
  Free-text locations and recipients are compared without surrounding whitespace and letter case,
  like the Hierarchy groups them, so a formatting edit is never reported as a move. Blank is no value.
  The stored snapshots keep the exact text.
*/
export const historyKey = value => (value ?? '').trim().toLowerCase();
const present = value => (value && value.trim() ? value : null);

/*
  One snapshot row per item. An item reached from several of the given ids (a bulk replacement can
  match a box and its contents) keeps the highest one above it: its visible location comes from
  that direction, so that is the item it moved with.
*/
const byItem = rows => {
  const items = new Map();
  for (const row of rows) {
    const known = items.get(row.id);
    if (!known || row.depth > known.depth) items.set(row.id, row);
  }
  return items;
};

/*
  The events one change produced, from the snapshots taken before and after it in the same
  transaction. An item records a container change only when its own direct container changed, a
  location change only when its effective location did, wherever that came from, and a recipient
  change only when its Transferred To did. An item below a changed one names that item as the one it
  moved with. Nothing is recorded for an item whose visible state stayed the same.
*/
export function detectChanges(beforeRows, afterRows) {
  const before = byItem(beforeRows);
  const events = [];
  for (const [id, after] of byItem(afterRows)) {
    const previous = before.get(id);
    if (!previous) continue;
    if (previous.parent_item_id !== after.parent_item_id) {
      events.push({
        item_id: id, event_type: 'container_changed',
        from_item_id: previous.parent_item_id, from_item_name: previous.parent_name,
        to_item_id: after.parent_item_id, to_item_name: after.parent_name
      });
    }
    if (historyKey(previous.location) !== historyKey(after.location)) {
      events.push({
        item_id: id, event_type: 'location_changed', from_value: present(previous.location), to_value: present(after.location),
        ...(after.depth > 0 && { via_item_id: after.top_id, via_item_name: after.top_name })
      });
    }
    if (historyKey(previous.transferred_to) !== historyKey(after.transferred_to)) {
      events.push({
        item_id: id, event_type: 'recipient_changed',
        from_value: present(previous.transferred_to), to_value: present(after.transferred_to)
      });
    }
  }
  return events;
}

const reference = (id, name, exists) => (id || name ? { id, name, exists: Boolean(exists) } : null);

const presentEvent = row => ({
  id: row.id,
  operation_id: row.operation_id,
  operation_type: row.operation_type,
  type: row.event_type,
  occurred_at: row.occurred_at,
  from: row.from_value,
  to: row.to_value,
  from_item: reference(row.from_item_id, row.from_item_name, row.from_item_exists),
  to_item: reference(row.to_item_id, row.to_item_name, row.to_item_exists),
  via_item: reference(row.via_item_id, row.via_item_name, row.via_item_exists),
  transfer: row.transfer_id ? {
    id: row.transfer_id, recipient: row.recipient, transferred_at: row.transferred_at, expected_return_on: row.expected_return_on,
    returned_at: row.returned_at, note: row.note, return_note: row.return_note
  } : null
});

/*
  The append-only activity history of items. Changes are recorded on the server, in the transaction
  of the write that caused them: `track()` compares the affected items before and after the write,
  and `record()` stores explicit events such as a loan. Either everything is written or nothing is.
  `now` returns the current time as an ISO string; it is a dependency so tests can fix the clock.
*/
export class ItemHistoryService {
  constructor({ itemHistoryRepository, now = () => new Date().toISOString() }) {
    this.history = itemHistoryRepository;
    this.now = now;
  }

  // Runs `mutate` for the items `ids` and everything inside them, recording what visibly changed.
  track(operationType, ids, mutate) {
    return this.history.transaction(() => {
      const before = this.history.snapshot(ids);
      const result = mutate();
      this.record(operationType, detectChanges(before, this.history.snapshot(ids)));
      return result;
    });
  }

  // One operation groups the events; an action that changed nothing leaves no trace at all.
  record(operationType, events) {
    if (!events.length) return null;
    const recordedAt = this.now();
    return this.history.transaction(() => {
      const operationId = this.history.insertOperation(operationType, recordedAt);
      this.history.insertEvents(operationId, events.map(event => ({ occurred_at: recordedAt, ...event })));
      return operationId;
    });
  }

  // `type` is one of HISTORY_FILTERS; `cursor` is the id of the last event of the previous page.
  list(itemId, query = {}) {
    const filter = query.type ?? 'all';
    if (!Object.hasOwn(HISTORY_FILTERS, filter)) throw httpError(400, 'INVALID_HISTORY_FILTER');
    const limit = Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(1, Number.parseInt(query.limit) || HISTORY_PAGE_SIZE));
    let after = null;
    if (query.cursor !== undefined && query.cursor !== '') {
      const cursor = /^\d+$/.test(String(query.cursor)) ? Number(query.cursor) : null;
      after = cursor && this.history.findEventPosition(itemId, cursor);
      if (!after) throw httpError(400, 'INVALID_HISTORY_CURSOR');
    }
    const rows = this.history.listEvents({ itemId, types: HISTORY_FILTERS[filter], after, limit: limit + 1 });
    const page = rows.slice(0, limit);
    return { events: page.map(presentEvent), next_cursor: rows.length > limit ? page.at(-1).id : null };
  }

  openTransfer(itemId) {
    return this.history.findOpenTransfer(itemId) ?? null;
  }

  // Called inside the transaction that permanently deletes the item.
  forgetItem(itemId) {
    this.history.deleteItemOperations(itemId);
  }
}
