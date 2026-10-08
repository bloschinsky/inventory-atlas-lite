# Item activity history

## Summary

Every item tells its chronological story: where it moved, which containers held it, to whom it was
lent and when it came back, and every change of its Transferred To note. The current state stays in
the existing `items` columns; history is a compact, append-only log of meaningful confirmed changes,
written by the server in the same SQLite transaction as the change itself. It is not event
sourcing: nothing is ever rebuilt from the log.

Lifecycle events (`retired`, `restored`) and the operation types `retire`/`restore` are part of the
schema's vocabulary and of the timeline's labels, so the planned Inventory Lifecycle (issue #23) can
record them without another migration. Nothing writes them yet, and no lifecycle UI exists.

## User-visible behaviour

- **Item details** has a **History** card with the five newest entries and **View full history**,
  which opens `/items/:id/history`: a Tabler timeline, newest first, with **All | Locations |
  Transfers** filters, **Load more** (20 per page), loading, empty, and error states, and a closing
  note that changes from before History existed are not shown. Both work on phones (no horizontal
  scrolling) and in English and Ukrainian.
- Events of one action share an operation and appear as one entry (for example a new container and
  the location it brings). An entry shows the time, a type icon, the label, from → to values, and
  for inherited moves *Moved together with …* linking to the container that moved. Bulk actions are
  marked **Bulk move** or **Bulk replace**. Container names link to the item while it exists and are
  marked *(deleted)* afterwards.
- **Transfer** (next to **Edit**) starts a temporary loan: recipient (required, Transferred To
  suggestions), Transferred on (default now, not in the future), optional Expected return and Note.
  While it is open, a **Loan** card shows *On loan to …*, since when, the expected return with an
  **Overdue** badge after that day, the note, and **Mark as returned** (Returned on, default now, and
  a note). The timeline shows *Lent to …* (with *Still on loan* while open) and *Returned from …* with
  the actual duration measured from the stored start and end.
- Taking an item out of its container in the item form requires an explicit choice of where it is now
  (see [Nested items](nested-items.md)).
- The public demo seeds a small curated history through the same services: the Camping Box (and its
  contents) moved from Home / Storage, the Speedlight moved from the Electronics Drawer into the
  Camera Bag, and the Cordless drill was lent to Volodia and returned. Their dates are set back after
  the services recorded them, like the demo's other dates.

## What is recorded

`ItemHistoryService.track(type, ids, mutate)` snapshots the given items and everything below them
before and after `mutate()` inside one transaction and records only real differences:

| Event | When | Values |
| --- | --- | --- |
| `container_changed` | the item's own `parent_item_id` changed | `from_item_*`/`to_item_*` id and name snapshots |
| `location_changed` | the item's **effective** location changed, also when inherited from any ancestor | `from_value`/`to_value` exact text; `via_item_*` names the moved item above it |
| `recipient_changed` | `transferred_to` changed by an edit or bulk replace | `from_value`/`to_value` |
| `transferred` / `returned` | Transfer / Mark as returned | recipient and `transfer_id` |
| `retired` / `restored` | reserved for the inventory lifecycle | — |

- Free-text locations and recipients are compared trimmed and case-insensitively (the same rule the
  Hierarchy groups by); blank is no value. Snapshots keep the exact text.
- A location-only move of a container never rewrites descendants' own `location` or
  `parent_item_id`; each descendant whose effective location changed gets exactly one
  `location_changed`, and none gets a false `container_changed`. Reparenting within the same
  effective location records only the moved item's container change.
- Editing the own saved location of an item that shows an inherited one is not recorded; it is
  recorded when it becomes effective, for example when the item is taken out.
- Saving unchanged values, unrelated edits (name, Condition, photos, fields), repeated requests,
  and bulk-move roots already in the destination record nothing; an operation without events is
  never written.
- Write paths: `ItemService.update()` (`item_update`), `ItemService.bulkMove()` (`bulk_move`,
  after `selectionRoots()`), `BulkReplaceService.apply()` for Location and Transferred To
  (`bulk_replace`), and `ItemTransferService` (`transfer`, `return`). Creating an item records
  nothing, and nothing is fabricated for existing items on migration.
- An item reached from several changed items (a bulk replacement matching a box and its contents)
  names the highest one above it as the item it moved with.

## Loans

`item_transfers` holds one row per temporary loan; `returned_at` is `NULL` while it is open, and a
partial unique index allows only one open loan per item. A table was chosen over pairing events
because it answers "the open loan" and "overdue" with one indexed lookup and keeps each period's
start, due date, end, and notes in one row; the `transferred`/`returned` events reference it.

- A transfer sets `items.transferred_to` to the recipient; a return clears it unless it was changed by
  hand to another recipient meanwhile. Loans never change location or container.
- Moments are ISO strings with a time zone (`Z` or an offset), so a browser's local time is never read
  as the server's; up to five minutes of clock skew is tolerated, later is refused. The expected
  return is a calendar date that may not be before the transfer day (one day of time-zone tolerance).
  A return may not be before its transfer, and a new loan may not start before the previous return.
- History is not edited: a mistaken loan is closed with Mark as returned and a note. Editing
  Transferred To in the form records `recipient_changed` and never invents a loan or a return.
- Codes: `TRANSFER_RECIPIENT_REQUIRED`, `INVALID_TRANSFER_DATE`, `TRANSFER_DATE_IN_FUTURE`,
  `INVALID_EXPECTED_RETURN_DATE`, `EXPECTED_RETURN_BEFORE_TRANSFER`, `INVALID_TRANSFER_NOTE`,
  `TRANSFER_NOTE_TOO_LONG` (1000), `TRANSFER_ALREADY_OPEN` (409), `TRANSFER_OVERLAPS_PREVIOUS`,
  `TRANSFER_NOT_FOUND` (404), `TRANSFER_ALREADY_RETURNED` (409), `RETURN_BEFORE_TRANSFER`.

## Schema (version 8)

- `item_operations(id, type, created_at)` — one row per user action that changed something.
- `item_events(id, operation_id → item_operations ON DELETE CASCADE, item_id → items ON DELETE
  CASCADE, event_type, occurred_at, from_value, to_value, from_item_id, from_item_name, to_item_id,
  to_item_name, via_item_id, via_item_name, transfer_id)`. Referenced items are plain ids with name
  snapshots, not foreign keys, so deleting a container never touches or blocks other items' history.
- `item_transfers(id, item_id → items ON DELETE CASCADE, recipient, transferred_at,
  expected_return_on, returned_at, note, return_note, created_at)`.
- Indexes: `idx_item_events_item(item_id, occurred_at DESC, id DESC)`,
  `idx_item_events_operation(operation_id)`, `idx_item_transfers_item(item_id, transferred_at)`, and
  the unique partial `idx_item_transfers_open(item_id) WHERE returned_at IS NULL`.
- The tables are created by the additive, idempotent `applySchema()`, listed in `CURRENT_SCHEMA` (so
  restore validation requires them after migrating an older backup) and in `TRACKED_TABLES` (so writes
  advance `last_updated_at`). Backups, cloud backups, restore, and reset carry them like every other
  table. The public demo applies the same schema over sql.js.
- **Permanent delete** removes the item's own events and loans (foreign-key cascade) and the
  operations that grouped only its events, in the delete's transaction. Other items' events that
  name it keep their snapshots. History is kept indefinitely; there is no TTL, cap, or archive.

## API

- `GET /api/items/:id/history?type=all|location|transfer|lifecycle&limit=1..50&cursor=<event id>` →
  `{ events, next_cursor }`, ordered by `occurred_at DESC, id DESC` with keyset pagination (default
  20). The cursor is the last event id of the previous page and must belong to the item. Codes:
  `INVALID_HISTORY_FILTER`, `INVALID_HISTORY_CURSOR`, `ITEM_NOT_FOUND`.
- An event: `id`, `operation_id`, `operation_type`, `type`, `occurred_at`, `from`, `to`, `from_item`,
  `to_item`, `via_item` (`{ id, name, exists }` or `null`), and `transfer` (the loan row or `null`).
  Types are stable keys; the browser translates them, so events read the same in every language.
- `POST /api/items/:id/transfers` `{ recipient, transferred_at?, expected_return_on?, note? }` → 201
  and the loan; `POST /api/items/:id/transfers/:transferId/return` `{ returned_at?, note? }` → the
  closed loan.
- `GET /api/items/:id` additionally returns `open_transfer`. The responses of `PUT /api/items/:id`,
  `PATCH /api/items/bulk-parent`, and the bulk replace endpoints are unchanged.

## Capacity

Measured with `scripts/history-benchmark.mjs` (10,000 items, two events per operation, the busiest
item holding 2% of all events, then a box with 200 contents moved; Windows 10, Node 24):

| Events | History tables + indexes | Bytes/event | First page | Page 2,000+ deep | Box move (202 events) |
| --- | --- | --- | --- | --- | --- |
| 100,000 | 15.6 MiB | 164 | 1.2 ms | 1.3 ms | 17 ms |
| 1,000,000 | 158 MiB | 166 | 1.5 ms | 1.8 ms | 21 ms |

At 1,000,000 events `item_events` takes 80.5 MiB, `idx_item_events_item` 43.2 MiB,
`idx_item_events_operation` 13.0 MiB, and `item_operations` 21.7 MiB. Timeline pages are answered from
`idx_item_events_item` (`SEARCH e USING INDEX idx_item_events_item (item_id=?)`), so their time does
not grow with the total. Inserting history is dominated by the per-row `last_updated_at` triggers
(about 0.13 ms per event in the synthetic fill), which is negligible for real actions. The expected
workload — 1,000–10,000 items with 10–15% moving — produces far fewer events; backup size grows by
about 165 bytes per event, small next to the photos a backup already carries. WAL mode and the
checkpoint on close are unchanged.

`npm test` runs the 100,000-event measurement (`test/item-history.test.js`) with functional limits;
the 1,000,000-event run is opt-in: `node scripts/history-benchmark.mjs` (or `--events N --items N`).

## Verification

- `test/item-history.test.js` — no-ops and formatting-only edits, inherited moves at depth, descendants'
  untouched rows, same-location reparenting, container + location in one operation, inherited own
  location edits and detaching, bulk move with overlapping selections and unchanged roots, 341 items
  in a 40-level tree, rollback on a failing insert or mutation, bulk replace, recipient changes,
  loan lifecycle and validation, pagination with timestamp ties and filters, renames and deletions,
  the v7 → v8 migration without fabricated events, the 100,000-event capacity test, and the HTTP
  contract including the backup.
- `test/demo.test.js` — the curated demo history in every language. `test/reset.test.js`,
  `test/restore.test.js` — the new tables in resets, safety backups, and migrated restores.
- `test/e2e/item-history.spec.js` — a box move seen in the history of the camera inside it, taking
  the camera out with the required location choice, lending to Volodia → return → lending to Olena
  with the full-history filters, and the timeline on a phone in Ukrainian. `test/e2e/nesting.spec.js`
  makes the explicit choice when it takes an item out.
