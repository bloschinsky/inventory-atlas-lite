# Item activity history: location moves, nested containers, transfers, returns, and lifecycle

- **Completed:** 2026-10-09
- **Version:** 0.60.0
- **Issue:** #24, released together with #23 (Inventory Lifecycle, published as 0.59.0 from its branch):
  this change merges the lifecycle branch, so both features reach `master` in one version.

## Summary

- **Schema version 9:** `item_operations`, `item_events`, and `item_transfers`, with the item
  timeline index, the operation index, and a unique partial index that allows one open loan per
  item. Additive and idempotent; listed in `CURRENT_SCHEMA` and `TRACKED_TABLES`. Version 8 stays the
  lifecycle schema already published in 0.59.0, so a 0.59.0 database upgrades by adding the history
  tables.
- **Recording:** `ItemHistoryService.track()` snapshots the affected items and all their
  descendants (one recursive statement) before and after a write in the same transaction and stores
  only real changes: `container_changed` for the item whose own container changed,
  `location_changed` for every item whose effective location changed (with *moved together with*),
  and `recipient_changed`. Wired into `ItemService.update()`, `ItemService.bulkMove()`, and
  `BulkReplaceService.apply()` for Location and Transferred To. No-ops record nothing; nothing is
  fabricated for existing items.
- **Lifecycle integration (#23):** `ItemHistoryService.trackLifecycle()` records one `retired` or
  `restored` event per item of the subtree in the lifecycle transaction, with the reason key, the last
  effective location, and the container left or entered; contents name the item they went with.
  Retirement is refused while the item or anything in it is on loan (`ITEM_RETIRE_HAS_OPEN_LOAN`), the
  Retire dialog explains it, and a retired item cannot be lent (`TRANSFER_ITEM_RETIRED`, no Transfer
  button). The timeline gains a Lifecycle filter.
- **Loans:** `ItemTransferService` and `POST /api/items/:id/transfers` and
  `.../transfers/:transferId/return`, keeping `transferred_to` in step, with date, overlap, and
  open-loan validation. A return or a new loan entered in the same minute as the moment before it is
  read as that moment, because the date-time field has no seconds; untouched date defaults of the
  Transfer, Mark as returned, and Retire dialogs are sent as "now" for the server's exact clock.
- **API:** `GET /api/items/:id/history` with filters and keyset pagination; `GET /api/items/:id`
  adds `open_transfer`. Other response contracts, including `PATCH /api/items/:id/lifecycle`, are
  unchanged.
- **Deletion:** a permanent delete removes the item's own events, loans, and the operations that
  grouped only its events; other items' events keep their name snapshots.
- **UI:** History card with the five newest entries, `/items/:id/history` timeline with All /
  Locations / Transfers / Lifecycle and Load more, the Loan card with Overdue and Mark as returned,
  the Transfer dialog, and the required *Where is this item now?* choice when an item is taken out of
  its container. English and Ukrainian.
- **Demo:** a curated history (Camping Box move, Speedlight reparenting, a returned loan of the
  Cordless drill) seeded through the services; the lifecycle works there with the same services.
- **Benchmark:** `scripts/history-benchmark.mjs` (opt-in, default 1,000,000 events); the
  100,000-event measurement runs in `npm test`.
- **Docs:** new `docs/features/item-activity-history.md` and its index entry; updated
  `item-lifecycle.md`, `nested-items.md`, `transferred-to-field.md`, `public-demo.md`,
  `database-backup-and-restore.md`, `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (two new sections, the
  loan rule in the retirement section, the Lifecycle filter and events), `AGENTS.md`, and the release
  history (0.59.0 kept as published, 0.60.0 added). Tests that build `ItemService`,
  `BulkReplaceService`, or `ItemLifecycleService` pass the history dependency; schema version
  assertions moved to 9. The task is a GitHub issue, so there is no task file to delete and the roadmap
  is unchanged.

## Measurements

`node scripts/history-benchmark.mjs` on Windows 10 / Node 24 with 10,000 items:

| Events | History bytes | Bytes/event | First page | Deep page | Move of a box with 200 contents |
| --- | --- | --- | --- | --- | --- |
| 100,000 | 16,375,808 | 164 | 1.17 ms | 1.30 ms | 17.5 ms (202 events) |
| 1,000,000 | 166,162,432 | 166 | 1.51 ms | 1.79 ms | 21.1 ms (202 events) |

The timeline query plan is `SEARCH e USING INDEX idx_item_events_item (item_id=?)`.

## Verification

- `npm run lint` — passed.
- `npm test` — 334 tests: 331 passed, 1 skipped (shellcheck not installed), 2 failed. Both failures are
  in `test/landing.test.js` (*the guide renders Markdown safely and sends repository links to GitHub*
  and *a translation that drifts from the canonical guide structure fails the guide build*) and fail
  the same way on an untouched `origin/master` checkout on this Windows machine; they are unrelated to
  this change. New: `test/item-history.test.js` (21 tests, including retire/restore events, the
  open-loan rule in both directions, and same-minute returns), a demo history test in
  `test/demo.test.js`; `test/item-lifecycle.test.js` from #23 runs with the history dependency.
- `npm run build` — passed.
- `npm run test:e2e` with `APP_VERSION=0.60.0` — 227 passed (21.8 min). New:
  `test/e2e/item-history.spec.js` (4 tests, one for the loan rule and the lifecycle events, the phone
  test also checks the four filters fit); `test/e2e/lifecycle.spec.js` from #23 passes unchanged;
  `test/e2e/nesting.spec.js` updated for the required location choice.
