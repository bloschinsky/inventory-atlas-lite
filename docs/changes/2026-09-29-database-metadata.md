# Database metadata

- **Completed:** 2026-09-29
- **Version:** 0.42.0

## Summary

- New `database_metadata` table in `server/src/db.js` with exactly one row (`CHECK (id = 1)`):
  `database_uuid`, `name`, `created_at`, `last_updated_at`, and `schema_version`. `SCHEMA_VERSION`
  is now `3`; `PRAGMA user_version` stays the source of truth and the metadata column mirrors it in
  the same transaction.
- `applySchema()` now runs as one transaction. It creates the row for a new database, migrates an
  existing one (new UUID, default name `Inventory Atlas`, `created_at`/`last_updated_at` taken from
  the earliest and latest record timestamps, or the migration time for an empty database), and
  repairs blank values of a damaged row without ever replacing an existing UUID.
- `last_updated_at` is advanced by `AFTER INSERT/UPDATE/DELETE` triggers on every table in
  `TRACKED_TABLES`, so every successful write moves it, rolled-back and refused writes do not, and no
  service or client code has to remember it. Renaming the database advances it too.
- New `DatabaseMetadataRepository`, `DatabaseMetadataService`, and routes
  `GET /api/database/metadata` and `PUT /api/database/metadata` (name only). New error codes
  `DATABASE_NAME_REQUIRED`, `DATABASE_NAME_TOO_LONG`, `DATABASE_NAME_INVALID`, and
  `DATABASE_METADATA_MISSING` in English and Ukrainian.
- The reset checks now expect the single metadata row in an otherwise empty fresh database, which
  gets a new identity; restore brings back the backup's metadata unchanged and migrates older backups.
- New `client/src/components/DatabaseSettings.vue`: a **Settings → Database** card with the editable
  name, **Last updated**, and folded **Technical details** (created, UUID, schema version), with
  `settings.database.*` strings in both locales.
- Documentation: new `docs/features/database-metadata.md` and its index entry; updates to
  `docs/HOW-TO.md`, `docs/features/database-backup-and-restore.md`,
  `docs/features/inventory-database-reset.md`, `docs/ROADMAP.md`, `AGENTS.md`, and the 0.42.0
  release-history entry. The completed task file `docs/issues/TASK-DATABASE-METADATA.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 189 tests: 188 passed, 1 skipped (shellcheck is not installed locally), including the
  new `test/database-metadata.test.js` and the metadata checks added to `test/restore.test.js` and
  `test/reset.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 110 passed, including the new `test/e2e/database-metadata.spec.js`.
