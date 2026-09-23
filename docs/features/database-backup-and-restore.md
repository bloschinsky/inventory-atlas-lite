# Database backup and restore

## Summary

**Data / Backup** downloads a consistent SQLite snapshot of the whole inventory and restores such a
snapshot back into the application. Restore is a full replacement: the contents of the selected
backup become the active database. It is not a merge, an import, or a selective restore.

## User-visible behaviour

### Download

- **Download backup** streams a consistent snapshot created with SQLite's backup API, named
  `inventory-YYYY-MM-DD.sqlite`. It contains items, categories, custom fields, values, nesting, and
  the original photo bytes.
- A download is refused with HTTP `503` while a restore or an [inventory reset](inventory-database-reset.md)
  is replacing the database.

### Restore

- **Restore from backup** is a separate section on the same page with its own file picker. It accepts
  `.sqlite`, `.sqlite3`, and `.db`, shows the selected file name and size, and validates the
  contents rather than the name.
- **Validate backup** uploads the file and reports a summary: file name and size, a compatibility
  line including the schema version, and the number of categories, items, custom fields, saved
  values, and photos. Nothing has changed at this point.
- The result is followed by a red warning stating that all current data is replaced, that anything
  created after the backup disappears, that a pre-restore safety backup is written first, and that
  the application briefly refuses changes.
- **Restore backup** is a Bootstrap danger button that stays disabled until `RESTORE` is typed in the
  confirmation field. Both buttons are disabled while a request is running.
- On success the page reports `Backup restored successfully`, the restored counts, and the name of
  the safety backup holding the replaced data, then waits for readiness and reloads into the items
  list so no view keeps replaced data.
- A rejected file produces a short explanation — not a SQLite database, failed integrity check, not
  an Inventory Atlas Lite backup, incompatible or newer schema, too large, more than one file — and
  the current inventory is left exactly as it was.

## Implementation overview

### Reopenable connection

- `server/src/db.js` keeps the `better-sqlite3` connection behind a proxy. Every module reaches the
  connection that is open *now*, so replacing the database file does not leave anything bound to a
  closed connection. Statements and transactions in the repositories are therefore built when
  they are used, never at module load.
- `applySchema()` creates the tables, runs the additive column migrations, and stamps
  `PRAGMA user_version` with `SCHEMA_VERSION` (currently `1`). Databases written before this feature
  report `0` and are upgraded in place. `CORE_SCHEMA` is the shape every version of the application
  has had and is used to recognize a backup; `CURRENT_SCHEMA` is what the running application needs.

### Two-stage API

- `POST /api/restore/validate` takes one `multipart/form-data` field named `backup`. `multer` streams
  it to a private file in `DATA_DIR/restore-staging/` with a server-generated random name — the
  uploaded file name is only echoed back and never influences any path. The limit is
  `RESTORE_MAX_UPLOAD_MB` (default `512`), and exceeding it answers HTTP `413`.
- Validation runs on the staged copy only: non-empty, `SQLite format 3` header, `journal_mode =
  delete` to collapse any journal so the file cannot depend on an external `-wal`, `integrity_check`,
  `user_version` not newer than the application, `CORE_SCHEMA` recognition, migrations if the backup
  is older, `CURRENT_SCHEMA` verification, `foreign_key_check`, and the summary counts. SQLite
  extension loading is never enabled.
- A valid upload returns a 32-byte random hex `restore_token`, its lifetime, the echoed file name and
  size, and the summary. A rejected upload is deleted immediately.
- `POST /api/restore/apply` takes `{ "restore_token": "…", "confirmation": "RESTORE" }`. Missing,
  unknown, expired, or already used tokens and any other confirmation value are refused before
  anything is touched; a rejected confirmation does not consume the token.
- Tokens and staged files expire after ten minutes (`RESTORE_TOKEN_TTL_MS` shortens this in tests),
  are swept on a timer and on each request, cleared on graceful shutdown, and the whole staging
  directory is emptied at startup because an interrupted upload is never resumable.

### Safe replacement

`RestoreService` in `server/src/services/restoreService.js` performs the swap in one serialized
operation, with the staged uploads and their tokens held by `server/src/restore/stagingStore.js` and
the SQLite file checks in `server/src/restore/databaseFile.js`. The maintenance state, the safety
backup, the swap, and the rollback live in `server/src/restore/databaseMaintenance.js`, which the
[inventory reset](inventory-database-reset.md) shares:

1. only one restore or reset runs at a time, and it waits for in-flight backup downloads;
2. while it runs, every `POST`, `PUT`, `PATCH`, and `DELETE` outside `/api/restore/` and
   `/api/database/reset/` answers HTTP `503`, so nothing can write to the connection being replaced;
3. the staged file is validated again;
4. free disk space is checked, and a safety backup of the live database is written to
   `DATA_DIR/pre-restore-backups/pre-restore-<UTC timestamp>Z.sqlite` with SQLite's backup API, its
   journal collapsed and its integrity and schema verified;
5. the validated file is copied to a unique, `0600`, unpredictable name next to the active database
   and verified again there, so the final step is an atomic same-filesystem rename;
6. the connection is checkpointed and closed, stale `-wal`/`-shm`/`-journal` files of the replaced
   database are removed, the candidate is renamed into place, and the directory entry is synced
   where the platform allows it;
7. the database is reopened with the normal pragmas, then re-verified with `integrity_check`,
   `foreign_key_check`, the schema check, and the counting queries before success is reported;
8. the staged upload is deleted and the safety backups are pruned to the ten most recent.

If any step after the close fails, the safety backup is copied back, reopened, and verified, and the
request reports that the restore failed and the previous data was recovered. If that recovery itself
fails, no file is deleted, writes stay blocked, the exact paths are logged on the server only, and
the client receives a critical error instead of an uncertain application.

### Readiness

`GET /api/restore/status` returns `{ ready, restoring, resetting, critical }`, which the page polls
before it reloads after a restore or a reset. `GET /api/health` carries the same four fields and keeps answering `200` during a restore,
with `database: "maintenance"`, so container and deployment health checks do not fail over a
few-second maintenance window.

## Operator notes

- `RESTORE_MAX_UPLOAD_MB` — maximum size of an uploaded backup, default `512`.
- `DATA_DIR/pre-restore-backups/` — safety copies; the ten most recent are kept. A failing cleanup is
  logged and never fails a restore or deletes user data, and the copy written by the running restore
  is never removed by it.
- `DATA_DIR/restore-staging/` — staged uploads only; emptied at startup.
- The application has no authentication, so anyone who can reach it over the network can replace the
  whole inventory. It must stay on a trusted LAN or VPN and must not be exposed to the Internet.

## Verification

- `test/restore.test.js` covers validating and restoring a real downloaded backup, the returned
  summary, replacement instead of merge, restored photos, nesting and field values, persistence
  across a restart, a valid download after the restore, the rejection of a non-SQLite file, an empty
  file, a corrupted database, an unrelated database, an incomplete schema, a newer schema version,
  several files and an oversized upload, the migration path for a pre-versioning backup with the
  uploaded source left untouched, token expiry, replay and confirmation rules, the safety backup and
  its contents, automatic rollback after a simulated failure during the swap, serialization of
  concurrent restores, `503` for writes and downloads during the swap, and staging cleanup after
  success, failure, expiry, and an interrupted run.
- `test/e2e/restore.spec.js` covers the browser workflow: validation, the disabled danger button
  until `RESTORE` is typed, the success message with the safety backup name, the automatic reload,
  and the restored data in the items list.
- Manual smoke test with a nested item, a photo, and a custom field value: restore, corrupt-file
  rejection, application restart, and a new backup download.

## Notes and limitations

- Restore always replaces everything. There is no merge, no selective restore, and no CSV or JSON
  import or export.
- Backups from a newer schema version are refused by design.
- The AI API key lives in `ai-settings.json` under `DATA_DIR` and is not part of a SQLite backup, so
  restoring a backup neither changes nor recovers it.
- The maintenance window blocks writes only; reads that arrive during the swap may fail and are
  retried by the page.
