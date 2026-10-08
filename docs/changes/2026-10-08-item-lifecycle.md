# Inventory lifecycle: retire, filter, and restore items

- **Completed:** 2026-10-08
- **Version:** 0.59.0

## Summary

Implemented GitHub issue #23, *TASK: Inventory Lifecycle — Retire, Filter, and Restore Items*. An item
is now **Active** or **Retired**. Retiring records why and when an item left the inventory without
deleting anything, hides it from the default active views, and keeps it fully readable; **Restore to
inventory** brings it back to a place the user chooses.

- **Schema version 8:** `items.lifecycle_status` (`active`/`retired`, `CHECK`, default `active`),
  `retired_at`, `retired_reason` (`CHECK` on `sold`, `gifted`, `lost`, `stolen`, `disposed`,
  `consumed`, `other`), `retired_recipient`, `retired_note`, and text snapshots of the last effective
  location and the former container; `checklist_runs.skipped_retired_count`; `idx_items_lifecycle`.
  The migration is additive and idempotent: existing items become active, existing runs get `0`, and
  older backups are migrated on their staged restore copy. `CURRENT_SCHEMA` lists the new columns.
- **Shared rules:** `shared/itemLifecycle.js` holds the statuses, reasons, list views, and limits.
- **Service and API:** the new `ItemLifecycleService` behind `PATCH /api/items/:id/lifecycle` retires
  or restores an item with its whole subtree in one transaction and refuses repeated or stale
  transitions. A container with active contents is retired only with `include_contents: true`
  (otherwise `409 ITEM_RETIRE_HAS_CONTENTS`); only the subtree root leaves its container, and the
  nesting inside stays. Restore never reattaches an item to its former container: it goes on its own
  (optionally with a new saved location) or into a chosen active container. Item responses carry
  `lifecycle_status` and a `retirement` object; `GET /api/items` and `GET /api/items/hierarchy` accept
  `lifecycle=active|all|retired` (default `active`), applied in SQL before pagination; parent
  candidates, Move to…, create, and edit enforce that a container and its contents share one status.
  Twelve new error codes in both locales.
- **Dashboard:** every figure describes the active inventory; `retiredItems` is reported separately and
  linked from the total card.
- **Checklists:** retired entries stay marked on their checklists; new runs and container audits copy
  only active items, and a run records and shows how many retired entries it left out. Existing runs
  keep their items, marked Retired.
- **Interface:** the **Inventory** switch (Active | All | Retired) on Items (kept for the browser
  session, `?lifecycle=` accepted) and Hierarchy (in the address, both groupings and views); the neutral
  **Retired** badge (`ItemLifecycleBadge.vue`) and faded thumbnails in the table, the phone cards, the
  contents list, and checklists; the Status row and Retirement card on the item page; the
  `RetireItemDialog.vue` (required reason, date, recipient, note, and the contents choice) and
  `RestoreItemDialog.vue`. The item form of a retired item offers only retired containers.
- **Demo:** the public demo uses the same schema and services, so it supports the lifecycle as is.
- **Documentation:** new `docs/features/item-lifecycle.md` and its index entry; updated
  `hierarchy.md`, `dashboard.md`, `checklists.md`, `nested-items.md`,
  `database-backup-and-restore.md`, `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (new section *Retire an
  item and restore it*, plus the list, Dashboard, Hierarchy, and checklist sections), the guide's demo
  route for the new section, `AGENTS.md`, and the 0.59.0 release-history entry. The task was tracked as
  a GitHub issue, so there was no `docs/issues/` file to remove, and no roadmap entry changed.
- **Coordination:** no activity events are recorded; the separate Item Activity History task will add
  one lifecycle event per affected item for later transitions.

## Verification

- `npm run lint` — passed.
- `npm test` — 312 tests: 311 passed, 1 skipped (shellcheck is not installed locally). New
  `test/item-lifecycle.test.js` (16 tests) and a demo test of the lifecycle on sql.js; the schema
  version and response-shape expectations of existing tests were updated to version 8 and the new
  `lifecycle_status` field.
- `npm run build` — passed.
- `APP_VERSION=0.59.0 npm run test:e2e` — 223 passed (Chromium, 20.7 min). After a final width tweak of the Items filters, the lifecycle, items, responsive, item-columns, condition-grading, and tour specs were run again: 39 passed. New `test/e2e/lifecycle.spec.js`
  (8 tests) and a retired-item QR test in `test/e2e/scan-qr.spec.js`.
