# CODEX TASK — Restore the Database from a Backup

## Goal

Add a safe **Restore from backup** workflow to **Inventory Atlas Lite**.

The application already allows the user to download a consistent SQLite backup. Extend the existing **Data / Backup** user interface so the user can upload one of these backup files and replace the currently active inventory database with it.

This is a destructive operation. The implementation must validate the uploaded database, automatically preserve the current database, replace it safely, recover from failures, and clearly explain the consequences before applying the restore.

The expected user outcome is:

1. open **Data / Backup**;
2. select a previously downloaded Inventory Atlas Lite SQLite backup;
3. validate and review the backup;
4. explicitly confirm that current data will be replaced;
5. restore the backup;
6. reload the application and see the restored categories, items, fields, relationships, and photos.

---

## First inspect the current implementation

Before making changes:

1. inspect the current database initialization, schema, migrations, connection lifecycle, WAL configuration, and prepared statements;
2. inspect the existing backup endpoint and confirm how it creates a consistent SQLite snapshot;
3. inspect the current **Data / Backup** page and its UI conventions;
4. inspect all tables and relationships, including any features added after the original MVP;
5. inspect the application's production service/restart model;
6. inspect existing tests and documentation;
7. read `AGENTS.md` and follow all existing task-file, feature-documentation, HOW-TO, commit, and push rules.

Do not assume the original MVP schema is still complete. Restore and validation must use the current repository state as the source of truth.

---

## Scope

Implement a full replacement restore.

Restoring a backup must replace the current inventory contents with the contents of the selected backup. It is not a merge, import, append, or conflict-resolution feature.

The restored database must include every data type contained in the backup, including, where implemented:

- categories;
- custom-field definitions;
- custom-field values;
- items;
- nested item/container relationships;
- photos stored as BLOBs;
- IDs, UUIDs, timestamps, and other application-owned metadata.

Do not implement selective restore in this task.

---

## User interface

Extend the existing **Data / Backup** page without redesigning the application.

Keep the current backup download functionality and add a separate **Restore from backup** section.

The restore section must provide:

- a file picker;
- supported filename hints such as `.sqlite`, `.sqlite3`, or `.db`;
- selected filename and file size;
- a **Validate backup** or equivalent first step;
- a validation result summary;
- a strong warning that current data will be replaced;
- explicit final confirmation;
- a clearly destructive restore button using the existing Bootstrap danger style;
- progress/loading state;
- clear success and error states.

Do not trust the filename extension as validation.

### Validation summary

After server-side validation, show useful information that can be obtained safely, for example:

- number of categories;
- number of items;
- number of photos;
- database/schema version when available;
- original filename and size;
- whether the backup is compatible with the current application.

Do not expose internal server filesystem paths.

### Explicit confirmation

The final restore action must require more than selecting a file.

Use an explicit confirmation such as typing:

```text
RESTORE
```

or another equally clear two-step confirmation already consistent with the application.

The warning must explain:

- all current inventory data will be replaced;
- changes made after the selected backup was created will disappear from the active database;
- the application will automatically create a safety backup of the current database before replacement;
- the interface may briefly reload or become unavailable during the operation.

Disable repeated submissions while validation or restoration is running.

---

## API workflow

Use a two-stage server workflow so an uploaded file cannot immediately replace the database.

Suggested API shape:

```text
POST /api/restore/validate
POST /api/restore/apply
```

Adapt names to the existing API style if necessary.

### Stage 1: validate

`POST /api/restore/validate` should:

1. accept one uploaded database file using `multipart/form-data`;
2. stream it to a private temporary file rather than buffering the entire database in RAM;
3. enforce a documented configurable maximum upload size;
4. validate the file as described below;
5. return a lightweight summary and a short-lived, single-use restore token;
6. retain the staged file only until the token expires or is used;
7. delete the staged file immediately when validation fails.

The response must not return a user-controlled server path.

### Stage 2: apply

`POST /api/restore/apply` should accept:

```json
{
  "restore_token": "short-lived-single-use-token",
  "confirmation": "RESTORE"
}
```

It must:

- reject missing, expired, already-used, or unknown tokens;
- reject an incorrect confirmation value;
- re-check the staged file before replacement;
- serialize restore operations so only one can run at a time;
- prevent concurrent backup/restore operations from interfering;
- create a consistent safety backup of the active database;
- replace the database using the safe procedure below;
- return success only after the restored database is open and verified.

Tokens and staged files must expire automatically after a short documented period. Clean them on expiry, use, server startup, and graceful shutdown where practical.

---

## Uploaded database validation

Perform validation entirely on the server. Client-side checks are only convenience.

Before any active data is changed, verify at least:

1. the upload exists and is not empty;
2. the file has a valid SQLite header;
3. SQLite can open the staged file without modifying the uploaded original;
4. `PRAGMA integrity_check` returns `ok`;
5. the database contains all required application tables;
6. required columns, indexes, and relationships are compatible with the current application;
7. foreign-key validation succeeds, for example using `PRAGMA foreign_key_check`;
8. the schema is from a supported Inventory Atlas Lite version;
9. basic count/summary queries complete successfully;
10. the file does not depend on an uncommitted external WAL file.

Use the project's existing schema version or migration mechanism when present.

If no explicit schema version exists, introduce the smallest maintainable compatibility mechanism appropriate for the current project, such as `PRAGMA user_version` or an application metadata table. Preserve compatibility with valid backups created before this change when their actual schema can be recognized safely.

If an older compatible backup needs migrations, apply migrations only to a private staged copy and validate it again before replacement. Never mutate the user's uploaded source while it is still being assessed.

Reject:

- arbitrary non-SQLite files;
- corrupted SQLite files;
- SQLite databases from unrelated applications;
- incomplete or incompatible schemas;
- backups from an unsupported newer schema version;
- files exceeding the configured limit;
- multiple uploaded files;
- path-like filenames or any attempt to control server file placement.

Return useful user-facing errors without exposing stack traces, SQL statements, or filesystem paths.

---

## Safe replacement procedure

The active database must never be overwritten directly by the uploaded request body.

Implement a controlled restore sequence:

1. acquire an application-level restore lock;
2. reject or temporarily block new write operations with a clear `503 Service Unavailable` response while the final swap is in progress;
3. let in-flight database operations finish or fail safely;
4. create a consistent pre-restore safety backup using SQLite's supported backup mechanism;
5. place the validated candidate on the same filesystem as the active database so atomic rename is available;
6. checkpoint and close the active SQLite connection cleanly;
7. ensure stale active-database `-wal` and `-shm` files cannot be attached to the restored database;
8. atomically replace the active database file;
9. reopen the database and enable the normal pragmas/configuration;
10. run integrity, foreign-key, schema, and minimal application queries again;
11. recreate or reinitialize prepared statements and database-dependent services;
12. release maintenance mode only when the application is ready.

The exact internal design may use a reopenable database manager, a controlled process restart, or another robust approach compatible with both development and production execution. It must not depend exclusively on systemd being present unless the existing project explicitly supports only systemd deployment.

Do not leave application modules using prepared statements bound to a closed or replaced database connection.

### Atomicity and durability

- Write and validate temporary files before renaming them into place.
- Keep temporary and active database files on the same filesystem for atomic replacement.
- Use unique unpredictable temporary names.
- Use restrictive file permissions.
- Sync/flush files and the containing directory where required by the chosen platform-safe approach.
- Never follow user-controlled symlinks.
- Never derive a destination path from the uploaded filename.

---

## Automatic safety backup and rollback

Before replacing the active database, automatically create a consistent backup of it.

Store pre-restore backups in a dedicated application-controlled directory, for example:

```text
DATA_DIR/pre-restore-backups/
```

Use names such as:

```text
pre-restore-2026-09-17T12-30-00Z.sqlite
```

Requirements:

- the safety backup must pass an integrity check before the swap continues;
- report a generic backup identifier or filename to the user after success, not an unsafe absolute path;
- document a simple retention policy;
- never delete the only recovery copy during the same restore operation;
- do not silently consume unlimited disk space;
- never delete user data merely because retention cleanup fails.

If any step after the active database is closed or replaced fails:

1. restore the pre-restore safety backup automatically;
2. reopen and verify the original database;
3. return the application to a usable state;
4. report that the restore failed and the original data was recovered;
5. retain useful server-side error details in logs without exposing them to the client.

If automatic rollback itself fails, keep all recoverable database files, stop accepting writes, log exact recovery paths server-side, and present a clear critical error rather than continuing with uncertain data.

---

## Concurrency and maintenance behaviour

During validation, normal application use may continue because the staged database is isolated.

During the final restore:

- allow only one restore operation;
- do not run a backup download and restore swap simultaneously;
- temporarily reject new create/update/delete/photo operations;
- ensure no request can write to the old connection after the swap;
- keep the maintenance window as short as practical;
- provide a health/readiness state the frontend can poll;
- reload or redirect the frontend after success so all views use restored data.

The UI must handle a brief connection interruption gracefully if the chosen safe implementation requires a process restart.

---

## Upload handling and resource limits

SQLite backups may contain image BLOBs and can be much larger than ordinary form uploads.

Requirements:

- stream uploads to disk;
- do not use in-memory upload storage for the database file;
- make the maximum restore size configurable through an environment variable;
- choose and document a reasonable default;
- return HTTP `413 Payload Too Large` when exceeded;
- check available disk space where practical before staging and before creating the safety backup;
- clean partial uploads after disconnects and failures;
- do not weaken the existing photo upload limits.

---

## Success behaviour

After a successful restore:

- return a clear success result;
- provide the restored summary counts;
- provide the safety-backup filename/identifier;
- make the application ready again before success is reported;
- clear old frontend state and reload inventory data;
- navigate to a stable page such as the items list or Data / Backup page;
- show a message such as `Backup restored successfully`;
- ensure a subsequent normal backup download contains the restored data.

Do not claim success merely because the uploaded file was copied.

---

## Security requirements

This project may intentionally have no authentication, so the restore endpoint is especially sensitive.

Requirements:

- preserve the existing trusted-LAN/VPN-only security warning;
- do not expose restore endpoints through permissive cross-origin configuration;
- require the server-issued short-lived token and explicit confirmation for the final apply request;
- use cryptographically random tokens;
- make tokens single-use;
- never execute SQL supplied separately by the user;
- never enable SQLite extension loading for validation or restore;
- do not trust MIME type, extension, or filename;
- do not log uploaded database contents or sensitive inventory values;
- avoid returning raw database errors to the browser;
- do not add authentication as part of this task unless separately requested.

Document that anyone who can access the unauthenticated application network interface may potentially perform destructive operations, so it must not be exposed directly to the public Internet.

---

## Documentation updates

Follow the repository's existing documentation lifecycle rules.

At minimum:

- update the Data / Backup section of `docs/HOW-TO.md` with the exact restore workflow and warnings;
- create or update the permanent implemented-feature document for backup/restore;
- update `docs/features/README.md` or the repository's equivalent feature index;
- update the root README only where its feature summary or documentation links require it;
- document the maximum restore-size environment variable;
- document the pre-restore safety-backup directory and retention behaviour for operators;
- remove this task file after implementation only when the repository's `AGENTS.md` rules say the task is fully complete and verified.

Do not describe restore as available before it is implemented and tested.

---

## Tests

Add automated tests covering at least:

1. validating a real backup produced by the existing backup endpoint;
2. returning useful summary counts for a valid backup;
3. restoring categories, items, custom fields, values, photos, and nested relationships that exist in the current schema;
4. confirming that active data is replaced rather than merged;
5. preserving restored data after an application restart;
6. downloading a new valid backup after restoration;
7. rejecting a non-SQLite file;
8. rejecting a corrupted SQLite file;
9. rejecting a SQLite database with an unrelated or incomplete schema;
10. rejecting an unsupported newer schema version;
11. handling an older compatible backup through the supported migration path, if applicable;
12. rejecting files over the configured size limit;
13. rejecting multiple files;
14. rejecting missing, invalid, expired, replayed, and already-used restore tokens;
15. rejecting an incorrect confirmation value;
16. ensuring failed validation leaves the active database unchanged;
17. creating and validating a pre-restore safety backup;
18. simulating a failure during or after the swap and verifying automatic rollback;
19. ensuring stale WAL/SHM state cannot corrupt or alter the restored database;
20. serializing simultaneous restore attempts;
21. preventing normal writes during the final swap;
22. cleaning staged files after success, failure, expiry, and interrupted upload;
23. ensuring the Node process remains usable or restarts cleanly according to the chosen design;
24. verifying the UI requires validation and explicit confirmation before restore;
25. verifying the UI reloads and displays restored data after success;
26. ensuring all existing backup and application tests continue to pass.

Use temporary directories and disposable databases in tests. Never run restore tests against developer or user data.

Run at least:

```bash
npm test
npm run build
```

Also perform a manual browser smoke test with a nontrivial database containing at least one photo and one nested item relationship.

---

## Manual acceptance scenario

1. Start with an inventory containing `Box A` and `Helios 44-2`, with the lens stored inside the box and with a photo attached.
2. Download a backup from **Data / Backup**.
3. Add a new item named `Temporary item` after the backup is created.
4. Open **Restore from backup** and select the downloaded database.
5. Validate it and confirm that its summary is plausible.
6. Enter the explicit confirmation and apply the restore.
7. Wait for the application to become ready and reload.
8. Verify that `Box A`, `Helios 44-2`, nesting, fields, and the photo are present.
9. Verify that `Temporary item` is absent because restore replaces rather than merges.
10. Verify that a pre-restore safety backup was created.
11. Restart the application and verify the restored state remains.
12. Download another backup and verify it is a valid SQLite database containing the restored state.

Repeat with a corrupt file and verify that the current database remains unchanged.

---

## Non-goals

Do not add:

- merge or append import;
- selective table, category, item, or photo restore;
- CSV/JSON import;
- scheduled backups;
- cloud backup synchronization;
- Dropbox integration;
- backup encryption;
- multi-user permissions or authentication;
- restore from arbitrary remote URLs;
- restore across unsupported future schemas;
- a general database administration UI;
- direct editing of SQLite files in the browser.

---

## Acceptance criteria

The feature is complete when:

1. the Data / Backup page supports selecting and validating an Inventory Atlas Lite SQLite backup;
2. the UI shows a useful summary and a clear destructive warning;
3. restore requires a short-lived server token and explicit final confirmation;
4. corrupt, unrelated, oversized, and incompatible databases are rejected before active data changes;
5. the current database is automatically backed up before replacement;
6. the active database is replaced safely without merging old data;
7. the application reopens the restored database and verifies it before reporting success;
8. failures during replacement automatically roll back to the original database;
9. concurrent writes, backups, and restores cannot corrupt the database;
10. restored items, hierarchy, custom data, and photos survive restart;
11. temporary uploads and expired restore sessions are cleaned safely;
12. existing backup download functionality continues to work;
13. user and operator documentation is updated;
14. all existing and new tests pass;
15. the production build succeeds.

## Main priority

Protect the user's inventory above convenience. A failed or invalid restore must leave the existing database usable, and a successful restore must be verifiably complete before the application tells the user it succeeded.
