# TASK: Multiple Database Profiles — Single Active Database

## Dependency

Depends on completion of the Database Metadata task.

The application must already support persistent database metadata including:

- `database_uuid`
- `name`
- `created_at`
- `last_updated_at`
- `schema_version`

## Goal

Allow Inventory Atlas to manage multiple SQLite database files while keeping the architecture simple:

```text
multiple database files
        ↓
one active database
        ↓
one backend instance
        ↓
one application/server
```

This task is intentionally NOT a full multi-workspace implementation.

Only one database may be active at a time.

## Non-Goals

Do NOT implement:

- simultaneous access to multiple databases in one application session
- per-request `databaseId`
- routes such as `/api/databases/{id}/items`
- separate backend/server process per database
- multiple concurrent SQLite contexts for different clients
- desktop using one database while LAN/mobile uses another
- cross-database search
- cross-database item moves
- cross-database relations
- automatic synchronization between databases

These may be considered future architecture work.

## User Experience

Add a database management section in Settings.

Example:

```text
Database

Current database
[ Home Inventory ▼ ]

Manage databases
```

Database list example:

```text
● Home Inventory
  Garage
  Retro Collection
  Test Database
```

The currently active database must be clearly indicated.

## Core Features

### 1. Database registry

Maintain an application-level registry of known database files.

The registry should store only information required to locate/manage database profiles, for example:

```text
database_uuid
file_path or managed filename
last_opened_at
optional local display/cache metadata
```

The canonical database name and database metadata remain inside each SQLite database.

Do not make the registry the source of truth for database identity.

### 2. Managed database directory

Use a dedicated application data directory for managed databases.

Example:

```text
/data/databases/

home.sqlite
garage.sqlite
retro-collection.sqlite
```

Actual path must follow existing Docker, Electron, Linux/macOS/Windows storage conventions used by the project.

Do not hardcode platform-specific paths.

### 3. Active database

Persist which database profile is currently active.

At application startup:

1. Load database registry.
2. Resolve the active database.
3. Verify that the file exists and can be opened.
4. Run schema/migration checks.
5. Open that database as the application's single active SQLite connection/context.
6. Start normal application services.

If the active database is missing or invalid, fail gracefully and allow recovery/selection where practical.

### 4. Switch database

Allow the user to switch the active database from Settings.

Required flow:

1. User selects another database.
2. Complete or reject any in-progress write transaction safely.
3. Close/dispose the current database connection/context.
4. Validate target database.
5. Run required migration checks.
6. Open target database.
7. Update active database state.
8. Refresh/invalidate cached application data.
9. Reload application state/UI so no records from the previous database remain visible.

The frontend must never mix data from two databases.

A full application reload is acceptable if it is the safest implementation.

### 5. Create new database

Allow creation of a new database profile.

User provides at minimum:

```text
Database name
```

Application must:

- create a new SQLite file
- initialize schema
- initialize database metadata
- generate a new `database_uuid`
- register the database
- optionally switch to it after creation

Use existing migration/bootstrap logic rather than maintaining a second schema initialization path.

### 6. Add / Import existing database

Allow adding an existing compatible Inventory Atlas SQLite database.

Process:

1. Select/import SQLite file.
2. Validate that it is an Inventory Atlas database or can be safely migrated.
3. Read metadata.
4. Run migration checks.
5. Add it to the database registry.
6. Do not overwrite the currently active database.
7. Allow user to switch to it.

### 7. Duplicate UUID handling

An imported/copied database may contain the same `database_uuid` as a database already registered.

This commonly occurs when a database file was copied manually or restored from backup.

Required behavior:

- Detect duplicate `database_uuid`.
- Do not silently register two independent profiles with the same database identity.

Provide a safe import behavior.

Recommended rule:

```text
Restore/replace existing database
→ preserve UUID

Import as a new independent database
→ generate a new database UUID
```

If this task does not modify the existing Restore workflow directly, structure backend code so the distinction can be supported cleanly.

### 8. Remove database profile

Allow removing a database from the application's profile list.

Important distinction:

```text
Remove from application
```

and:

```text
Delete database file permanently
```

must not be treated as the same action.

Default/safe behavior:

- removing a profile does not immediately destroy user data

If permanent deletion is exposed:

- require explicit confirmation
- use existing dangerous-action UX conventions
- do not allow accidental deletion of the active database

### 9. Rename database

Database rename must update the `name` stored in database metadata.

Do not require renaming the physical SQLite filename.

Filename and database display name are separate concepts.

### 10. Migration behavior

Each database may be opened after being unused across several application versions.

Example:

```text
Home DB      schema v14
Garage DB    schema v11
Test DB      schema v8
```

When switching/opening a database:

1. Inspect schema version.
2. Validate compatibility.
3. Create safety backup if required by existing migration strategy.
4. Run migrations.
5. Open the database only after successful migration.

Migration failure must not corrupt the database or leave the app connected to a partially migrated state.

### 11. Backup / Restore integration

Existing backup/restore functionality must continue working.

At minimum:

- backup applies to the currently active database
- UI should clearly indicate which database is being backed up
- restore must not accidentally overwrite a different database profile
- restoring the active database should preserve that database's identity according to current restore semantics

Future-friendly behavior may support:

```text
Restore backup
○ Replace current database
○ Import as new database
```

If "Import as new database" is implemented here:

- create/register a separate database file
- generate a new `database_uuid` when necessary to avoid identity collision

### 12. LAN behavior

The backend has one globally active database.

Therefore all connected clients see the same active database.

If desktop switches from:

```text
Home
```

to:

```text
Garage
```

LAN/mobile clients must also operate on `Garage` after state refresh/reconnect.

Document this behavior in code/comments or developer documentation.

Do NOT attempt per-client active databases in this task.

### 13. QR / deep-link compatibility

Do not redesign the complete QR feature here unless required by current code.

However:

- database UUID must remain stable
- avoid architecture that assumes item numeric IDs are globally unique across databases
- future deep links should be able to include database identity

Do not introduce cross-database QR routing unless already required by an existing task.

## Backend Architecture

Keep database selection behind dedicated abstractions.

Recommended responsibilities:

```text
DatabaseRegistry
DatabaseManager
ActiveDatabaseService
DatabaseConnectionFactory
```

Responsibilities should include:

- list registered databases
- resolve active database
- validate database files
- switch connections safely
- create database
- import/register database
- expose current database metadata

Existing repositories/services should continue operating against one active database context without requiring `databaseId` parameters everywhere.

Follow project OOP/SOLID rules.

## Frontend

Settings should provide:

- current database name
- current database last updated time
- database selector
- manage databases action
- create database
- add/import database
- rename database
- remove profile

Keep the UI compact and appropriate for Inventory Atlas Lite.

Do not expose unnecessary database-engine terminology to normal users.

## Safety

Before any destructive or risky operation:

- close active transactions
- validate file paths
- prevent path traversal
- prevent accidental overwrite
- preserve backups where appropriate
- never delete an SQLite file merely because a registry entry is removed unless the user explicitly chooses permanent deletion

## Tests

Add tests covering at minimum:

- startup with one database
- startup with multiple registered databases
- active database persistence
- switching database
- no data leakage after switch
- creating a new database
- importing an existing database
- duplicate UUID detection
- removing a database profile
- migration when opening an older database
- invalid/missing database file handling
- backup of current database
- LAN/global active-database behavior at service level where applicable

## Acceptance Criteria

- User can register/manage multiple Inventory Atlas SQLite databases.
- Only one database is active at any time.
- No separate server is created per database.
- Existing API/repositories continue to operate against the active database.
- User can switch databases safely from Settings.
- UI fully refreshes after switching and does not mix data.
- User can create a new database.
- User can add/import an existing compatible database.
- Duplicate database UUIDs are detected and handled safely.
- Each database runs its own migration checks when opened.
- Backup/restore remains safe and tied to the intended database.
- LAN clients use the same globally active database.
- No simultaneous multi-workspace architecture is introduced.
- Existing single-database users continue working without manual migration steps.
