# Checklists, Phase 1: core checklists and check sessions

- **Completed:** 2026-09-29
- **Version:** 0.46.0

## Summary

- New **Checklists** section (main navigation after Templates): reusable checklists in **Packing** or
  **Verification** mode that reference existing inventory items in a user-controlled order. Every
  start creates an independent run; the check state lives only in runs, never on items.
- Schema version 4 adds `checklists`, `checklist_items`, `checklist_runs`, and `checklist_run_items`
  through the additive `applySchema()` path, so existing databases and older backups migrate in place.
  Item references use `ON DELETE SET NULL` with name snapshots, so item deletion is never blocked;
  checklist deletion cascades to its entries and sets `checklist_id` to `NULL` on its runs, which stay
  readable. A unique `(checklist_id, item_id)` index prevents duplicate live references. The tables
  join `CURRENT_SCHEMA` and `TRACKED_TABLES`; the restore summary and reset impact gain `checklists`
  and `checklistRuns` counts.
- Backend: `ChecklistRepository`, `ChecklistRunRepository`, `ChecklistService` (definitions and the
  `{ id }`/`{ item_id }` membership contract with validation and duplicate refusal),
  `ChecklistRunService` (server-side snapshot on start, `pending`/`confirmed`/`missing` states with
  `checked_at`, notes up to 500 characters, completion, read-only completed runs), and
  `routes/checklistRoutes.js` with the endpoints under `/api/checklists` and `/api/checklist-runs`.
  `shared/checklists.js` holds the modes, states, note limit, and count rule; `presentLocation` is now
  exported from `itemService.js` for the effective location of checklist entries.
- Frontend: `Checklists.vue` (cards with mode, item count, last run and result, Open/Start/Edit/Delete,
  and **Runs of deleted checklists**), `ChecklistForm.vue` with `ChecklistItemPicker.vue` (item search
  reusing `GET /api/items`, category/location/container context, Add/Added, move up/down, remove),
  `ChecklistDetails.vue` (expected items, deleted-item badges, Start/Run again/Continue run, run
  history), `ChecklistRun.vue` (phone-first run page with 44 px Packed/Present, Missing, Pending
  buttons, notes, progress, pending confirmation, completion, Run again), `ChecklistRunHistory.vue`,
  and `client/src/checklists.js` for mode-dependent labels. New `checklists.*`, `counts.*`, and
  `errors.CHECKLIST_*` messages in English and Ukrainian; the backup text and restore summary mention
  checklists.
- Documentation: new `docs/features/checklists.md`; updated `docs/features/README.md`,
  `docs/HOW-TO.md`, `docs/ROADMAP.md`, `docs/features/database-backup-and-restore.md`,
  `docs/features/inventory-database-reset.md`, `AGENTS.md`, the Phase 2 task (now unblocked), and the
  0.46.0 release-history entry. The completed task file
  `docs/issues/TASK-CHECKLISTS-PHASE-1-CORE.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 222 tests: 221 passed, 1 skipped (shellcheck is not installed locally). New
  `test/checklists.test.js` (8 tests) covers both modes, ordering, validation and duplicates, pending
  start, marking and correcting states, counts, completion and read-only history, Run again leaving
  older runs untouched, snapshots over checklist edits and item renames, deleted items, checklist
  deletion keeping runs, and the version 3 → 4 migration. `test/e2e.test.js` adds the API contract,
  backup contents, and persistence over a restart; `test/restore.test.js` and `test/reset.test.js`
  now seed checklist data and verify it through restore, the summaries, and the reset.
- `npm run build` — passed.
- `npm run test:e2e` — 118 passed on the tagged `v0.46.0` commit. (Before committing, the 7
  `whats-new.spec.js` tests failed only because Vite takes the version from the `v0.45.0` tag on
  `HEAD` while the bump is uncommitted.) The new `test/e2e/checklists.spec.js` (3 tests) covers create → add → reorder → start → mark
  packed/missing → correct → note → reload → pending confirmation → complete → history → run again
  with the old run unchanged, Verification labels, deleted items and deleted checklists, and a
  phone-width run without horizontal scrolling. `test/e2e/reset.spec.js` expects the two new counts.
- The run page at phone width and the list, details, and editor pages on desktop were also checked in
  screenshots against an isolated test database.
