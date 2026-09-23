# Inventory database reset

## Summary

**Data / Backup → Danger Zone → Reset Inventory Database** removes the whole inventory and returns
the application to the database state of a fresh installation of the running version. It does not
delete rows table by table: a new database is created through the normal schema path, verified, and
swapped in as a whole after a verified safety backup of the current one, with automatic rollback if
the replacement fails. Settings stored outside the SQLite file and all existing backups are kept.

## User-visible behaviour

- The **Danger Zone** is a separate red-bordered card at the bottom of **Data / Backup**, below
  **Where the data lives** and away from the download and restore actions. It explains that items,
  photos, categories, and custom fields are removed permanently, that application settings are
  preserved, and that a safety backup is created first. Its **Reset Inventory Database** button is an
  outline danger button that only opens a dialog.
- Opening the dialog asks the server for the current impact and lists the number of items,
  categories, custom fields, custom field values, and photos that will be removed. The counts are
  never taken from client state.
- **Reset Database** stays disabled until the checkbox *I understand that all inventory data will be
  permanently removed.* is ticked and exactly `RESET INVENTORY` is typed. The phrase is compared
  exactly, without trimming or case folding, on the client and on the server.
- On success the page reports `Database reset completed.` and `Inventory Atlas Lite is ready for a
  fresh inventory.`, names the pre-reset safety backup, waits for readiness, and reloads into the
  empty items list.
- Any failure is shown in the dialog. Because a failed apply consumes the confirmation token, the
  dialog then offers **Try again**, which loads fresh counts and a new token.
- The dialog cannot be closed while the reset runs.

## Implementation overview

### API

- `POST /api/database/reset/prepare` refuses to start while a restore or reset runs (`409`) or a
  failed replacement awaits manual recovery (`503`). Otherwise it returns
  `{ counts: { categories, items, fields, fieldValues, photos }, resetToken, expiresInSeconds }` and
  changes nothing.
- `POST /api/database/reset/apply` takes `{ "resetToken": "…", "confirmation": "RESET INVENTORY" }`
  and answers `{ message: "Database reset completed.", counts, safetyBackup }` with the bare file name
  of the safety backup; no server path is returned.
- Both endpoints accept only `POST` with a JSON body. Any other content type, including a form post or
  a request that carries its values in the query string, is refused with `415`, so a plain
  cross-site form cannot trigger them without a CORS preflight the server never grants.

### Reset token

- `ResetService` in `server/src/services/resetService.js` creates 32 random bytes per prepare and
  keeps only the SHA-256 hash and the expiry of the most recent one. Preparing again invalidates the
  previous token, so a stale dialog can never apply.
- The token lives five minutes (`RESET_TOKEN_TTL_MS` shortens it in tests), is compared in constant
  time, and is consumed by the first apply that presents it — whether that apply succeeds or fails.
  Only a wrong confirmation phrase is rejected before the token is looked at.
- It is held separately from restore sessions and cannot be used for a restore or an update. The
  token is never logged.
- Missing, invalid, already used, and expired tokens each get their own `400` message.

### Replacement

`ResetService` shares `DatabaseMaintenance` in `server/src/restore/databaseMaintenance.js` with the
restore. In order:

1. the maintenance lock is taken for `reset`; a running restore or reset answers `409`, and from now
   on writes outside the restore and reset endpoints answer `503`;
2. in-flight backup downloads are awaited, and free disk space is checked;
3. a snapshot of the live database is written with SQLite's backup API to
   `DATA_DIR/pre-reset-backups/pre-reset-<UTC timestamp>Z.sqlite`, its journal collapsed, and its
   integrity and schema verified. If writing or verifying fails, the reset stops with nothing changed
   and the unverified file is removed;
4. a candidate database is created next to the active one by `createFreshDatabase()` in
   `server/src/db.js`, which runs the same `applySchema()` a fresh installation runs. It is checked
   with `integrity_check`, the `CURRENT_SCHEMA` shape, the current `user_version`, and a row count of
   every table, so tables added in later versions are covered automatically;
5. the connection is checkpointed and closed, stale sidecar files are removed, the candidate is
   renamed over the active file, and the directory entry is synced where the platform allows it;
6. the database is reopened with the normal pragmas and verified again: integrity, schema,
   `foreign_key_check`, `PRAGMA foreign_keys = 1`, current `user_version`, and every table empty.

If step 5 or 6 fails, the safety backup is copied back, reopened, and verified, and the request
answers `500` stating that the previous inventory was recovered. If that recovery fails too, writes
stay blocked, no file is deleted, the exact safety backup and database paths are logged on the
server only, and the client receives a critical error. `GET /api/health` and
`GET /api/restore/status` report `resetting: true` while the lock is held.

### Messages

Prepare blocked by another operation, missing, invalid, reused, or expired token, wrong confirmation,
insufficient disk space, safety backup creation or verification failure, fresh database creation
failure, fresh database integrity or schema failure, failure during the swap or the post-reset health
check with a successful rollback, and a failed rollback each produce a distinct user-facing message.

## Operator notes

- `DATA_DIR/pre-reset-backups/` holds one verified, self-contained SQLite file per reset. Resets never
  prune it; delete old copies manually. A copy can be put back through **Restore from backup**.
- `ai-settings.json`, `pre-restore-backups/`, the updater's `backups/`, and any other file in
  `DATA_DIR` are never touched by a reset.
- The Proxmox updater takes its own backup while the service is stopped, so it cannot overlap a reset
  running inside the application.
- The application has no authentication. The confirmation, the checkbox, and the single-use token
  protect against accidental activation only; anyone who can reach the interface can reset the
  inventory. Keep it on a trusted LAN or VPN.

## Verification

- `test/reset.test.js` covers the prepare counts and token, prepare changing nothing, `415` for form
  and query-string requests, wrong phrases, missing, invalid, reused, superseded, and expired tokens,
  a successful reset whose schema matches a newly installed database exactly and whose tables are all
  empty, the verified pre-reset backup holding the removed inventory, untouched `ai-settings.json`,
  pre-restore and older pre-reset backups, enforced foreign keys, new data right after the reset and
  after a restart, abort without changes when the safety backup cannot be written or verified or the
  fresh database cannot be created or verified, automatic rollback after a failure during the swap
  and after it, and mutual exclusion of reset, restore, backup downloads, and normal writes.
- `test/e2e.test.js` checks the `resetting` field of the health response.
- `test/e2e/reset.spec.js` seeds categories, custom fields, values, nested items, and photos, then
  verifies the counts in the dialog, the disabled button until the checkbox and the exact phrase are
  given, the success message and safety backup name, the empty items list, and that a new category
  can be created afterwards.

## Notes and limitations

- The reset always removes everything in the inventory database. There is no selective reset.
- External settings, API keys, updater configuration, and backup archives are out of scope by design.
