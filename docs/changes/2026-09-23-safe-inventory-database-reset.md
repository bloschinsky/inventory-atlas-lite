# Safe inventory database reset

- **Completed:** 2026-09-23
- **Version:** 0.30.0

## Summary

- Added **Reset Inventory Database** to a new red **Danger Zone** card at the bottom of
  **Data / Backup**. Its dialog (`ResetDatabaseDialog.vue`) loads the current counts from the server,
  and **Reset Database** stays disabled until the acknowledgement checkbox is ticked and exactly
  `RESET INVENTORY` is typed. On success the page names the pre-reset backup and reloads into the
  empty items list.
- Added `POST /api/database/reset/prepare` and `POST /api/database/reset/apply` (JSON bodies only,
  `415` otherwise). Prepare changes nothing and issues a five-minute single-use token, of which only
  the hash of the newest one is kept; apply checks the phrase on the server and consumes the token.
- `ResetService` writes and verifies `DATA_DIR/pre-reset-backups/pre-reset-<UTC timestamp>Z.sqlite`,
  creates a fresh candidate through the same `applySchema()` path as a new installation
  (`createFreshDatabase()` in `db.js`), verifies its integrity, schema, version, and emptiness, swaps
  it in atomically, and verifies the reopened database. A failure after the original is displaced
  rolls the safety backup back; a failed rollback blocks writes and logs the recovery path on the
  server only. Pre-reset backups are never pruned.
- Extracted the maintenance state, safety backup, swap, reopen check, and rollback from
  `RestoreService` into `server/src/restore/databaseMaintenance.js`, shared by restore and reset, so
  the two operations, backup downloads, and normal writes can never overlap. The health and restore
  status responses gained a `resetting` field, and the maintenance `503` message now covers both
  operations.
- Documentation: new `docs/features/inventory-database-reset.md` and its index entry, updates to
  `docs/features/database-backup-and-restore.md`, `docs/HOW-TO.md`, `README.md`, `docs/proxmox.md`,
  `AGENTS.md`, and `docs/ROADMAP.md`, a release-history entry, and removal of the completed task file
  `docs/issues/TASK-safe-reset-inventory-database.md`.

## Verification

- `npm run lint` — passed.
- `npm test` — 94 passed, 1 skipped (shellcheck is not installed locally), including the new
  `test/reset.test.js` (prepare, tokens, successful reset against a fresh-install schema, preserved
  settings and backups, restart, abort and rollback for every failure step, and mutual exclusion
  with restore, downloads, and writes) and the unchanged `test/restore.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 76 passed, including the new `test/e2e/reset.spec.js`.
- Manual check of the Danger Zone card and the dialog in light and dark mode against a temporary
  `DATA_DIR`.
