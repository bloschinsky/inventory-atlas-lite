# Item lifecycle (Active / Retired)

An item is **active** (part of the current inventory) or **retired** (it left the inventory but stays
readable). Retiring records why and when an item left — sold, gifted, lost, stolen, disposed of, used
up, or another reason — without deleting anything: the item keeps its UUID, photos, serial number, QR
identity, New/Used flag, Condition, purchase data, custom field values, and template relations.
Retiring is not deletion, not a Condition grade, and not a loan; a temporary loan is a **Transfer** (see
[Item activity history](item-activity-history.md)) and **Transferred To** remains its note. **Delete** stays a separate, explicit action, and retired records never expire.

## Storage

Schema version 8 adds to `items`:

| Column | Meaning |
| --- | --- |
| `lifecycle_status` | `active` or `retired`, `NOT NULL DEFAULT 'active'`, limited by a `CHECK`. |
| `retired_at` | When the item left, ISO 8601 in UTC. |
| `retired_reason` | One of `sold`, `gifted`, `lost`, `stolen`, `disposed`, `consumed`, `other` (`CHECK`). |
| `retired_recipient`, `retired_note` | Optional recipient or context (255 characters) and note (2000 characters). |
| `retired_location_snapshot` | The effective location at the moment of retirement. |
| `retired_parent_uuid_snapshot`, `retired_parent_name_snapshot` | The direct container at that moment. |

`checklist_runs.skipped_retired_count` records how many checklist entries a run left out because their
item was retired. The keys live in `shared/itemLifecycle.js`; the interface names them through
`lifecycle.statuses.*` and `lifecycle.reasons.*`.

The migration is additive and idempotent: every existing item becomes active with empty retirement
columns, existing runs get `0`, and `idx_items_lifecycle` indexes the status. Older backups are migrated
on their staged restore copy; restoring a backup taken before the upgrade is the way back. The
retirement columns are cleared on restore, while the [activity history](item-activity-history.md)
keeps one `retired` and one `restored` event per affected item with the reason, the last location, and
the former and new container — no events are invented for changes made before history existed.

## Containment rule

A container and everything stored in it always share one lifecycle status. Active items are never
stranded inside a retired container, and retired items never move with an active one:

- Retiring a **leaf** takes it out of its container (`parent_item_id` becomes `NULL`). Its own saved
  `location` is not overwritten with the inherited one; the effective location and the former
  container are kept as text snapshots, so later moves, renames, or deletions of that container never
  change them.
- Retiring a **container with contents** is refused with `409 ITEM_RETIRE_HAS_CONTENTS { count }`
  unless the request says `include_contents: true`. Then the whole subtree, at any depth, is retired
  in one statement with the same details; only the subtree root leaves its active container, the
  nesting inside the subtree stays, and every item gets its own location snapshot.
- **Restoring** a retired item restores it together with everything below it, keeping their nesting.
  The item itself leaves a retired container it may still be in and goes where the request says:
  inside an active container (`parent_item_id`) or on its own (with an optional new saved
  `location`). It is never reattached to its former container automatically.
- Creating, editing, and moving an item check the same rule: the container must have the item's
  status (`400 ITEM_PARENT_LIFECYCLE_MISMATCH`). The item form of a retired item offers only retired
  containers. **Move to…** refuses a selection with retired items (`409 BULK_MOVE_RETIRED_ITEMS
  { count }`) and offers only active destinations.

## API

- `PATCH /api/items/:id/lifecycle` (id or UUID) with `{ "status": "retired", "reason", "retired_at"?,
  "recipient"?, "note"?, "include_contents"? }` or `{ "status": "active", "parent_item_id"?,
  "location"? }`. It answers `{ item_id, affected_count, item }`, where `item` is the full item. The
  current state is read inside the transaction, so a repeated or stale request is refused with
  `409 ITEM_ALREADY_RETIRED` or `409 ITEM_NOT_RETIRED`. Other refusals:
  `ITEM_LIFECYCLE_STATUS_INVALID`, `ITEM_RETIREMENT_REASON_REQUIRED`, `ITEM_RETIREMENT_REASON_INVALID`,
  `ITEM_RETIRED_AT_INVALID` (unparseable, or more than five minutes ahead of the server clock),
  `ITEM_RETIREMENT_RECIPIENT_TOO_LONG`, `ITEM_RETIREMENT_NOTE_TOO_LONG`, `PARENT_ITEM_NOT_FOUND`,
  `ITEM_PARENT_LIFECYCLE_MISMATCH`, and `409 ITEM_RETIRE_HAS_OPEN_LOAN` while the item or anything
  in it is on loan. Every affected item and its history events change in one transaction.
- Every item response carries `lifecycle_status` and `retirement`: `null` for an active item, otherwise
  `{ reason, retired_at, recipient, note, last_location, former_parent: { uuid, name } | null }`.
  `GET /api/items/:id` keeps answering retired items, so direct links and QR lookups still open them.
- `GET /api/items?lifecycle=active|all|retired` and `GET /api/items/hierarchy?lifecycle=…` default to
  `active`. The filter is applied in SQL to the count and the page together, before pagination, with
  search, the category and Condition filters, and every sort. An unknown value is refused with
  `400 ITEM_LIFECYCLE_FILTER_INVALID`.
- `GET /api/items/parent-candidates` lists active containers; `lifecycle=retired` lists retired ones.

## Interface

- **Items:** an **Inventory** switch (Active | All | Retired) beside the filters, Active by default.
  The choice is kept in `sessionStorage` for the browser session; `?lifecycle=` opens a view directly
  (the Dashboard link uses it). Retired rows and cards show a neutral gray **Retired** badge with an
  archive icon and a faded thumbnail; text keeps its normal contrast.
- **Item details:** the **Status** row (Active or Retired), the **Retired** badge under the name, and a
  **Retirement** card with the reason, date, recipient, note, last location, and the former container
  (linked by UUID). **Retire item** opens `RetireItemDialog.vue`: a required reason, the date and time
  (now by default, never in the future), recipient or context, and note; a container first asks to
  **Retire the container and all items inside it** or **Move the contents out first**, which retires
  nothing and explains how to move the contents. An item on loan shows *Mark it as returned before
  retiring it* instead of the form, and a retired item offers no **Transfer**. **Restore to inventory** opens `RestoreItemDialog.vue`
  with the last location and container for reference and the choice of **On its own, at a location**
  (prefilled with the saved location) or **Inside an active container**. A retired container offers no
  **Audit contents**.
- **Hierarchy:** a third switch, **Inventory**, kept in the address as `?lifecycle=all|retired`, in
  both groupings and both views. Because a container and its contents share one status, every view
  is a complete forest with no orphaned branches; retired items say **Retired** in their secondary line.
  The controls stay visible above an empty view.
- **Dashboard:** every figure, chart, and the 30-day activity describe the active inventory. The total
  card adds *N retired items are not counted*, linking to the Retired list.
- **Checklists:** retired entries stay on their checklists with a **Retired** badge, and the checklist
  page warns how many are retired. New runs and container audits copy only active items; a run records
  how many entries it left out and says so. Completed and open runs keep their items, with retired ones
  marked.
- **Templates, AI Add Item, Batch Add, and Duplicate** create active items as before; template defaults
  are unchanged. Labels can still be printed for retired items. Bulk Replace Value is a data correction
  tool and still covers every matching item.
- The public demo runs the same schema, repositories, and services in the browser, so retiring,
  filtering, and restoring work there too.

## Verification

- `test/item-lifecycle.test.js`: the schema and its `CHECK`s, migration of a version 5 database and of
  a restored legacy backup, active defaults, leaf retirement with snapshots and untouched data,
  snapshots that ignore later moves, the subtree choice and atomic subtree retirement, rollback on a
  failure, invalid inputs and repeated transitions, subtree and nested restores, the containment guards
  of create, edit, Move to…, and the parent candidates, server-side filtering before pagination with
  search and sort, valid hierarchy forests in every view, active Dashboard figures with the separate
  retired count, checklist runs and audits, labels and deletion of retired items, and the HTTP API.
  `test/item-history.test.js` covers the lifecycle events and the loan rule.
- `test/e2e/lifecycle.spec.js`: retire with a reason, the Active / All / Retired list and its session
  memory, restore into a container, the subtree choice, both Hierarchy groupings, checklists with
  retired entries, the Dashboard link, a direct UUID link, the phone cards, and Ukrainian.
  `test/e2e/scan-qr.spec.js` opens a retired item from its QR code.
