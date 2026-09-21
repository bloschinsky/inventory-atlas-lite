# Restore the database from a backup

- **Completion date:** 2026-09-21
- **Project version:** 0.16.0

## Summary

**Data / Backup** can now restore a downloaded SQLite backup, not only download one. Restoring is a
full replacement of the active inventory and is protected end to end.

- `server/src/db.js` keeps the `better-sqlite3` connection behind a proxy so the database file can be
  replaced without leaving modules bound to a closed connection, moves the schema and the additive
  migrations into a reusable `applySchema()`, and stamps `PRAGMA user_version` with
  `SCHEMA_VERSION = 1`. Databases written before this change report `0` and are upgraded in place.
- `server/src/index.js` builds its statements and transactions when they are used instead of at
  module load, refuses write requests with `503` while a restore is swapping the database, and
  exposes `POST /api/restore/validate`, `POST /api/restore/apply`, and `GET /api/restore/status`.
  `/api/health` reports the same readiness fields, and a backup download and a restore can no longer
  overlap.
- `server/src/restore.js` streams the upload to a private staging file, validates it there (header,
  journal collapse, integrity check, schema recognition, migrations on the staged copy, current
  schema, foreign keys, counts, version ceiling), and issues a short-lived single-use token. The
  apply stage writes and verifies a pre-restore safety backup, verifies the candidate next to the
  active database, closes the connection, removes stale `-wal`/`-shm`, renames atomically, reopens
  and re-verifies, and rolls the safety backup back automatically if anything fails after the swap.
- `client/src/pages/DataBackup.vue` adds the **Restore from backup** section: file picker with size
  and name, **Validate backup**, the validation summary, the destructive warning, the typed
  `RESTORE` confirmation, the danger button, progress and error states, and a reload into the items
  list once the server reports readiness.
- `RESTORE_MAX_UPLOAD_MB` (default `512`) limits an upload; oversized files answer `413`. Safety
  backups live in `DATA_DIR/pre-restore-backups/` and the ten most recent are kept.

Documentation: the restore workflow, warnings, and operator notes were added to `docs/HOW-TO.md`,
`README.md`, and the new `docs/features/database-backup-and-restore.md`, which is linked from the
feature index. The completed task file `docs/issues/TASK-restore-database-backup.md` was removed and
its roadmap entry deleted.

## Verification

- `npm run lint` — clean.
- `npm test` — 39 passed, 1 skipped (shellcheck, unavailable here), including the new
  `test/restore.test.js` with eight restore scenarios.
- `npm run build` — successful.
- `npm run test:e2e` — 31 Playwright tests passed, including the new `test/e2e/restore.spec.js`.
- Manual browser smoke test on a disposable database containing a nested item with a photo and a
  custom field value: download, add an extra item, validate, confirm with `RESTORE`, restore, reload
  into the items list, verify the nesting, photo, and field value, confirm the extra item is gone,
  confirm the pre-restore safety backup exists, reject a corrupted file without changing the data,
  restart the application, and download a valid backup of the restored state.
