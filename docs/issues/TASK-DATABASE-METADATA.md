# TASK: Add Database Metadata

## Goal

Add persistent metadata to each Inventory Atlas SQLite database so the database has its own identity, human-readable name, timestamps, and schema version information.

This task should establish the foundation for future features such as multiple database profiles, safer backup/restore workflows, QR routing, migrations, and database diagnostics.

## Scope

Implement a database-level metadata model stored inside the SQLite database itself.

Required metadata fields:

- `database_uuid`
- `name`
- `created_at`
- `last_updated_at`
- `schema_version`

## Requirements

### 1. Database metadata storage

Create a dedicated table or equivalent persistent structure for database metadata.

Recommended model:

```text
database_uuid
name
created_at
last_updated_at
schema_version
```

Rules:

- Exactly one metadata record must represent the current database.
- Metadata must be stored inside the SQLite file.
- Metadata must survive backup, restore, file copy, application restart, and transfer to another machine.
- `database_uuid` must be generated once when metadata is first created.
- Existing databases without metadata must be migrated automatically and safely.
- Default database name may be `Inventory Atlas` or another existing application default if already defined by project conventions.

### 2. Database UUID

Add a persistent unique identifier for the database.

Requirements:

- Use a UUID.
- Do not regenerate it on normal application restart.
- Do not regenerate it during ordinary backup/restore of the same database.
- Expose it through backend/service code for future features, but it does not need to be prominently displayed in normal UI.

### 3. Database name

Allow the user to assign a human-readable name to the current database.

Examples:

```text
Home Inventory
Garage
Retro Collection
Kamianets Inventory
```

Requirements:

- Name is editable from Settings.
- Validate empty/invalid values.
- Persist it inside the database.
- Display the current database name in the Settings database section.
- Keep UI simple; no database switching is part of this task.

### 4. Created At

Store the time when the metadata record/database identity was created.

Requirements:

- Set once.
- Do not change on regular writes.
- Do not change on application restart.
- Existing databases receive this value during migration.

### 5. Last Updated At

Track the latest successful data modification in the database.

Update `last_updated_at` after successful write operations that materially change user data or application-managed database content, including at minimum:

- create item
- edit item
- delete item
- category changes
- field definition changes
- item moves / hierarchy changes
- batch operations
- imports
- checklist changes if checklists exist in the current branch
- other persistent write operations affecting inventory data

Do NOT update it for:

- application startup
- page navigation
- read-only API calls
- opening Settings
- search/filter operations

Implementation requirement:

- Centralize this behavior at backend/database/service level where practical.
- Avoid duplicating manual timestamp updates across many frontend actions.
- Timestamp should only advance after a successful persistent write.

### 6. Schema Version

Store the current database schema version in metadata.

Requirements:

- Keep it synchronized with the existing migration/versioning mechanism.
- If the project already uses a migration system, integrate with it rather than creating a conflicting version source.
- If a schema version already exists elsewhere, reuse or mirror it consistently and document the chosen source of truth.

### 7. Settings UI

Add a compact database information section in Settings.

Show at minimum:

```text
Database name
Last updated
```

Optional read-only technical details may include:

```text
Created
Database UUID
Schema version
```

Technical fields should not clutter the main UI.

### 8. Existing database migration

Existing installations must continue working.

On first run after the feature is introduced:

1. Detect missing metadata.
2. Create the metadata structure.
3. Generate `database_uuid`.
4. Set default database name.
5. Set `created_at`.
6. Set `last_updated_at` to a sensible value.
7. Store current schema version.
8. Continue startup without requiring manual intervention.

Do not destroy or rewrite user inventory data unnecessarily.

## Architecture

Keep database metadata behind a dedicated backend abstraction, for example:

```text
DatabaseMetadataRepository
DatabaseMetadataService
```

Follow existing backend architecture and project OOP/SOLID rules.

Frontend code should use API/service methods and must not directly manipulate SQLite metadata.

## API

Add or extend backend endpoints/services as appropriate.

Expected capabilities:

```text
GET current database metadata
UPDATE database name
```

Do not expose unrestricted modification of:

- `database_uuid`
- `created_at`
- `last_updated_at`
- `schema_version`

These are application-managed fields.

## Backup / Restore Behavior

Metadata is part of the SQLite database and therefore must naturally be included in backups.

When restoring a backup as the same database:

- preserve its `database_uuid`
- preserve database name
- preserve metadata history contained in that backup

Do not introduce multi-database import semantics in this task.

## Error Handling

Handle:

- missing metadata
- partially migrated metadata
- invalid database name
- metadata write failure
- migration failure

Application should fail safely without corrupting the database.

## Tests

Add tests for at minimum:

- metadata creation for a new database
- migration of an existing database without metadata
- UUID persistence across restart
- database name update
- `created_at` remaining unchanged
- `last_updated_at` changing after successful writes
- `last_updated_at` not changing after reads
- schema version synchronization
- backup/restore preserving metadata

## Acceptance Criteria

- Every database has a persistent UUID.
- Every database has an editable human-readable name.
- `created_at` is stored and stable.
- `last_updated_at` reflects the latest successful persistent modification.
- Read-only operations do not change `last_updated_at`.
- Schema version is available through the metadata layer.
- Existing databases migrate automatically.
- Settings displays database name and last updated time.
- Backup/restore preserves metadata.
- No existing inventory functionality is broken.
