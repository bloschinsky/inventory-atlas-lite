# Item activity history: location moves, nested containers, transfers, and returns

- **Completed:** 2026-10-09
- **Version:** 0.59.0
- **Issue:** #24 (Phase A and the transfer/return part of Phase B; the lifecycle integration waits
  for #23, which is not implemented yet)

## Summary

- **Schema version 8:** `item_operations`, `item_events`, and `item_transfers`, with the item
  timeline index, the operation index, and a unique partial index that allows one open loan per
  item. Additive and idempotent; listed in `CURRENT_SCHEMA` and `TRACKED_TABLES`. Lifecycle event
  types are already part of the CHECK vocabulary for #23.
- **Recording:** `ItemHistoryService.track()` snapshots the affected items and all their
  descendants (one recursive statement) before and after a write in the same transaction and stores
  only real changes: `container_changed` for the item whose own container changed,
  `location_changed` for every item whose effective location changed (with *moved together with*),
  and `recipient_changed`. Wired into `ItemService.update()`, `ItemService.bulkMove()`, and
  `BulkReplaceService.apply()` for Location and Transferred To. No-ops record nothing; nothing is
  fabricated for existing items.
- **Loans:** `ItemTransferService` and `POST /api/items/:id/transfers` and
  `.../transfers/:transferId/return`, keeping `transferred_to` in step, with date, overlap, and
  open-loan validation and 14 new error codes in both locales.
- **API:** `GET /api/items/:id/history` with filters and keyset pagination; `GET /api/items/:id`
  adds `open_transfer`. Other response contracts are unchanged.
- **Deletion:** a permanent delete removes the item's own events, loans, and the operations that
  grouped only its events; other items' events keep their name snapshots.
- **UI:** History card with the five newest entries, `/items/:id/history` timeline with All /
  Locations / Transfers and Load more, the Loan card with Overdue and Mark as returned, the Transfer
  dialog, and the required *Where is this item now?* choice when an item is taken out of its
  container. English and Ukrainian.
- **Demo:** a curated history (Camping Box move, Speedlight reparenting, a returned loan of the
  Cordless drill) seeded through the services.
- **Benchmark:** `scripts/history-benchmark.mjs` (opt-in, default 1,000,000 events); the
  100,000-event measurement runs in `npm test`.
- **Docs:** new `docs/features/item-activity-history.md` and its index entry; updated
  `nested-items.md`, `transferred-to-field.md`, `public-demo.md`, `docs/HOW-TO.md` and
  `docs/HOW-TO.uk.md` (two new sections, updated Transferred To and container sections), `AGENTS.md`,
  and the release history. Existing tests that build `ItemService`/`BulkReplaceService` pass the new
  history dependency; schema version assertions moved to 8. The task is a GitHub issue, so there is no
  task file to delete and the roadmap is unchanged.

## Measurements

`node scripts/history-benchmark.mjs` on Windows 10 / Node 24 with 10,000 items:

| Events | History bytes | Bytes/event | First page | Deep page | Move of a box with 200 contents |
| --- | --- | --- | --- | --- | --- |
| 100,000 | 16,375,808 | 164 | 1.17 ms | 1.30 ms | 17.5 ms (202 events) |
| 1,000,000 | 166,162,432 | 166 | 1.51 ms | 1.79 ms | 21.1 ms (202 events) |

The timeline query plan is `SEARCH e USING INDEX idx_item_events_item (item_id=?)`.

## Verification

- `npm run lint` — passed.
- `npm test` — 314 tests: 312 passed, 1 skipped, 1 failed. The failure, *the guide renders Markdown
  safely and sends repository links to GitHub* in `test/landing.test.js` (and, in some runs, *a
  translation that drifts from the canonical guide structure fails the guide build*), fails the same
  way on an untouched `origin/master` checkout on this Windows machine; it is unrelated to this change.
  New: `test/item-history.test.js` (18 tests), a demo history test in `test/demo.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` with `APP_VERSION=0.59.0` — 217 passed (21.4 min). New:
  `test/e2e/item-history.spec.js` (3 tests); `test/e2e/nesting.spec.js` updated for the required
  location choice.
- Manual check against a production build on port 4300 with a temporary `DATA_DIR`: the Loan card,
  History preview, and the take-out location choice.
