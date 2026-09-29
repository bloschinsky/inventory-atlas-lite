# Database metadata

## Summary

Every Inventory Atlas Lite SQLite database carries its own identity: a UUID, a human-readable name,
when it was created, when its data last changed, and its schema version. The values live in the
database file itself, so they travel with every backup, restore, file copy, and move to another
machine. **Settings → Database** shows them and lets the user rename the database.

## User-visible behaviour

- **Settings → Database** sits between **Interface** and **AI**. It shows **Database name** in an
  editable field with **Save name**, and **Last updated**. **Technical details** is folded by default
  and shows **Created**, **Database UUID**, and **Schema version**.
- Saving trims the name and reports `Database name saved.` An empty name is refused by the form; the
  server also refuses a blank name, one longer than 100 characters, or one with control characters,
  such as a line break. Any other text is allowed and shown exactly as saved.
- Timestamps are shown in the browser's time zone and the active interface language.
- There is no database switching; the card always describes the database the server has open.

## Storage

- `database_metadata` has one row, enforced by `id INTEGER PRIMARY KEY CHECK (id = 1)`, with
  `database_uuid`, `name`, `created_at`, `last_updated_at`, and `schema_version`.
- Timestamps are ISO 8601 UTC strings with milliseconds (`2026-09-29T10:15:30.123Z`), so two writes
  in the same second still order correctly.
- The default name is `Inventory Atlas` (`DEFAULT_DATABASE_NAME` in `server/src/db.js`).

## Creation and migration

`applySchema()` in `server/src/db.js` creates and repairs the row on every open, and now runs as one
transaction, so a failed migration leaves the database exactly as it was.

- A new database gets a random v4 UUID, the default name, and `created_at = last_updated_at = now`.
- A database from before this feature (schema version 2 or older, including a restored older backup)
  gets a new UUID and the default name. `created_at` is the earliest `created_at` of its categories,
  custom fields, items, photos, and templates, and `last_updated_at` the latest `updated_at` (or photo
  `created_at`); an empty database uses the time of the migration. Inventory rows are not touched.
- A damaged row keeps every value that is still usable: a blank name, UUID, `created_at`, or
  `last_updated_at` is filled in, and `schema_version` is brought to the current one. An existing
  UUID is never replaced, so normal restarts and restores of the same database keep it.

## Schema version

`PRAGMA user_version` remains the source of truth, as used by restore validation and the reset
checks. `SCHEMA_VERSION` is now `3` (version 3 added `database_metadata`), and
`database_metadata.schema_version` mirrors it: `applySchema()` writes both in the same transaction.

## Last updated

`last_updated_at` advances through SQLite triggers, not through code in the services. `applySchema()`
creates an `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` trigger on every table listed in
`TRACKED_TABLES` (`categories`, `custom_fields`, `items`, `item_field_values`, `item_photos`,
`item_templates`, `item_template_field_values`). Consequences:

- every successful write moves the timestamp: items created, edited, moved, or deleted, categories,
  custom fields, batch imports, photos, templates, and Bulk Replace Field Value. A future inventory
  table only has to join `TRACKED_TABLES`;
- a trigger runs inside its statement's transaction, so a refused or rolled-back write (for example an
  invalid batch import) never moves the timestamp;
- reads, searches, the Dashboard, page navigation, opening Settings, and application startup do not
  write to those tables and leave the timestamp alone;
- renaming the database also advances `last_updated_at`; the repository sets it in the same `UPDATE`.

## Backend and API

- `server/src/repositories/databaseMetadataRepository.js` reads the row and updates the name.
- `server/src/services/databaseMetadataService.js` validates the name and exposes the metadata to the
  routes and to future features. A missing row, which only happens when the file was edited outside
  the application, answers `500 DATABASE_METADATA_MISSING`; the next start recreates it.
- `server/src/routes/databaseMetadataRoutes.js`:
  - `GET /api/database/metadata` returns
    `{ database_uuid, name, created_at, last_updated_at, schema_version }`;
  - `PUT /api/database/metadata` takes `{ "name": "…" }` and returns the updated metadata. Every
    other field in the body is ignored; the UUID, timestamps, and schema version cannot be set
    through the API.
- Errors: `DATABASE_NAME_REQUIRED`, `DATABASE_NAME_TOO_LONG` (`{ max: 100 }`),
  `DATABASE_NAME_INVALID`, and `DATABASE_METADATA_MISSING`.

## Backup, restore, and reset

- Backups are SQLite snapshots, so they contain the metadata row. Restoring one brings back its UUID,
  name, and both timestamps unchanged.
- Restore validation requires `database_metadata` in `CURRENT_SCHEMA`; an older backup gains it on
  its staged copy like any other migration. Restore does not change the identity of a restored
  database, and there is no import-as-new-database behaviour.
- A reset creates a new database, so the fresh database gets a new UUID and the default name. Its
  checks expect exactly one row in `database_metadata` and no rows anywhere else. The pre-reset
  backup keeps the previous identity.

## Tests

- `test/database-metadata.test.js`: creation, restart persistence, migration of a version 2 database
  with dates taken from its records, an empty legacy database, repair of a damaged row, schema version
  mirroring, rollback of a failed migration, name validation and application-managed fields, a missing
  row, `last_updated_at` after every kind of write, and unchanged `last_updated_at` after reads and
  refused writes.
- `test/restore.test.js`: a restored backup keeps its metadata across the restore and a restart, and a
  legacy backup gains an identity; `test/reset.test.js`: a reset gets a new identity while the
  pre-reset backup keeps the old one.
- `test/e2e/database-metadata.spec.js`: the Settings card, the name validation, saving, reload, and
  the technical details.
