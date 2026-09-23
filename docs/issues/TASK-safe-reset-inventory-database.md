# TASK — Safe Reset Inventory Database

## Status

Planned.

## Goal

Add a deliberately restricted **Reset Inventory Database** action that removes all inventory data and returns the database to the state of a fresh installation.

This is a destructive maintenance operation and must be protected by:

- explicit Danger Zone UI;
- pre-reset impact summary;
- automatic verified safety backup;
- typed confirmation;
- short-lived one-time reset token;
- maintenance locking;
- fresh-database creation using the current schema/migrations;
- atomic database replacement;
- post-reset verification;
- automatic rollback if reset fails.

Do not implement this as a simple collection of `DELETE FROM ...` statements.

## User-visible scope

Reset must remove inventory-domain data, including all current and future data represented by a fresh `inventory.sqlite`, for example:

- items;
- item photos;
- categories;
- custom fields;
- custom-field values;
- item/container relationships;
- other inventory records stored in the SQLite database.

Reset must preserve application configuration stored outside the inventory SQLite database, including where applicable:

- AI/provider settings and API keys;
- cloud integration credentials;
- application/deployment settings;
- updater/release configuration;
- existing safety/pre-restore/pre-reset backups.

The result must behave like a brand-new inventory database created by the current application version.

## UI — Danger Zone

Add the action to **Data / Backup** in a clearly separated **Danger Zone** section.

Recommended copy:

```text
Reset Inventory Database

Permanently remove all inventory items, photos, categories, and custom fields,
and return Inventory Atlas Lite to a fresh database state.

Application settings are preserved.
A safety backup will be created automatically before reset.
```

Use destructive styling consistent with Tabler.

The reset action must not be placed near normal backup/download actions in a way that makes accidental activation likely.

## Prepare step

Opening the reset confirmation flow must first obtain current impact information from the backend.

Display counts such as:

```text
428 items
27 categories
184 custom fields
613 photos
```

Use the currently relevant inventory tables/counts.
Do not rely on stale client-side counts.

## Confirmation flow

Require both:

1. a checkbox:

```text
I understand that all inventory data will be permanently removed.
```

2. exact typed confirmation:

```text
RESET INVENTORY
```

The final destructive button must remain disabled until both conditions are satisfied.

Recommended button text:

```text
Reset Database
```

The exact confirmation string must also be validated by the backend.
Client-side confirmation alone is insufficient.

## Reset token

Use a two-step backend flow.

Recommended endpoints:

```text
POST /api/database/reset/prepare
POST /api/database/reset/apply
```

### Prepare

`reset/prepare` must:

- verify the application is able to begin the reset flow;
- gather current impact counts;
- create a cryptographically secure short-lived one-time reset token;
- return the counts and token;
- not modify inventory data.

The token must:

- expire after a short period;
- be single-use;
- be invalidated after successful or failed apply;
- be scoped only to database reset;
- not be reusable for restore/update operations.

### Apply

`reset/apply` must require:

```json
{
  "confirmation": "RESET INVENTORY",
  "resetToken": "..."
}
```

Reject:

- missing token;
- expired token;
- reused token;
- invalid token;
- incorrect confirmation phrase.

## Safety backup

Before any destructive database replacement:

1. acquire the appropriate maintenance/reset lock;
2. generate a consistent SQLite snapshot using the existing backup infrastructure / SQLite backup API;
3. store it under a dedicated location such as:

```text
DATA_DIR/pre-reset-backups/
```

4. use a filename such as:

```text
pre-reset-2026-09-23T17-02-41Z.sqlite
```

5. verify the backup's integrity and expected schema before proceeding.

The reset must abort if the safety backup cannot be created and verified.
Never continue with destructive work after a failed backup.

Pre-reset backups must not be removed by the reset operation.

## Reset strategy

Do **not** reset by manually deleting every current table's data.

Instead:

1. create a new temporary database using the current application's canonical schema/migration path;
2. initialize it exactly as a fresh installation would;
3. validate schema compatibility;
4. run SQLite integrity checks;
5. switch the application into the same safe maintenance state used for database replacement;
6. atomically replace the active database with the validated fresh database;
7. reopen/rebind the database connection using the project's existing replacement infrastructure;
8. run application health/readiness checks.

This approach must automatically remain correct when new inventory tables are added later.

## Rollback

If any failure occurs after the original database has been displaced:

1. restore the verified pre-reset backup;
2. reopen/rebind the database;
3. verify readiness;
4. surface a reset failure to the UI.

A failed reset must not leave the application with:

- a missing database;
- a partial database;
- an empty but invalid schema;
- a closed/unusable SQLite connection.

If rollback itself fails, surface a critical operational error with the exact recovery backup path in server logs.

Do not expose filesystem paths containing sensitive configuration through public APIs unless already consistent with project conventions.

## Concurrency and maintenance mode

Reset must not overlap with:

- restore;
- local backup generation;
- cloud backup generation;
- update backup/database swap;
- another reset operation.

Reuse the existing backup/restore maintenance and database-swap infrastructure where practical.

During the final replacement window, writes must be blocked.
Return an appropriate maintenance/unavailable response for conflicting writes.

## Post-reset behavior

After successful reset:

- the database contains zero user-created inventory data;
- the current schema is fully initialized;
- application settings outside SQLite remain intact;
- the server remains healthy;
- the UI is redirected/refreshed to a sensible empty state, such as Items or Dashboard.

Show a success message such as:

```text
Database reset completed.
Inventory Atlas Lite is ready for a fresh inventory.
```

Also indicate that a safety backup was created.
Do not automatically restore or delete that backup.

## API/security requirements

Inventory Atlas Lite currently assumes trusted LAN/VPN/Tailscale access and does not have user authentication.

This task must not claim to turn the application into a publicly secure service.

However, the destructive endpoint must still be hardened against accidental invocation:

- POST only;
- exact confirmation phrase;
- one-time reset token;
- short token expiry;
- CSRF-safe request behavior consistent with project architecture;
- no GET-based destructive action;
- no reset via query string;
- no browser-only protection;
- no action from stale UI state.

Never log the full reset token.

## Error handling

Provide clear user-facing errors for at least:

- prepare already blocked by another maintenance operation;
- expired reset token;
- invalid/reused reset token;
- confirmation mismatch;
- safety backup creation failure;
- safety backup verification failure;
- fresh database initialization failure;
- integrity/schema validation failure;
- database swap failure;
- post-reset health-check failure;
- rollback performed successfully;
- rollback failure.

## Tests

Add strong automated regression coverage.

### Service/API

Cover:

- prepare returns current counts;
- prepare returns a short-lived reset token;
- prepare does not modify data;
- wrong confirmation is rejected;
- missing token is rejected;
- expired token is rejected;
- reused token is rejected;
- safety backup is created;
- reset aborts if safety backup creation fails;
- reset aborts if safety backup validation fails;
- fresh database contains current schema;
- successful reset removes all inventory data;
- configuration files outside SQLite remain untouched;
- pre-reset backup survives reset;
- application can create new inventory data immediately after reset;
- restart after reset works;
- conflicting backup/restore/reset operations are blocked;
- rollback restores the original database after simulated swap/post-swap failure.

### Schema regression

Create test inventory data covering all current inventory tables before reset.

After reset, verify:

- all user inventory content is gone;
- all required tables/indexes exist;
- schema validation passes;
- foreign keys remain enabled;
- application health endpoint reports ready.

### Playwright

Cover the destructive UI flow with an isolated temporary test database:

1. seed several items/categories/photos/custom fields;
2. open Data / Backup;
3. open Danger Zone reset dialog;
4. verify impact counts;
5. verify final button is initially disabled;
6. check acknowledgement checkbox;
7. type an incorrect phrase and verify it remains disabled/rejected;
8. type `RESET INVENTORY`;
9. apply reset;
10. verify success message;
11. verify inventory is empty;
12. verify application remains usable.

Never run this test against the developer's normal `data/` database.

## Documentation

When implemented:

- add a feature document under `docs/features/`;
- update `docs/features/README.md`;
- document reset and recovery behavior in `docs/HOW-TO.md`;
- document the pre-reset backup location in deployment documentation;
- update `docs/ROADMAP.md`;
- add the required `docs/changes/YYYY-MM-DD-*.md` record;
- update `AGENTS.md` if database replacement/reset structure changes;
- follow the task-file lifecycle.

## Non-goals

Do not add:

- factory reset of external settings;
- deletion of API keys;
- deletion of cloud credentials;
- deletion of updater configuration;
- deletion of existing backup archives;
- per-table selective reset options;
- remote unauthenticated automation endpoint for reset;
- simple SQL-table truncation as the primary implementation.

## Acceptance criteria

- Reset is available only in a clearly marked Danger Zone.
- The user sees current inventory impact counts before confirmation.
- Exact typed confirmation `RESET INVENTORY` is required.
- Backend validation is mandatory.
- A short-lived one-time reset token is required.
- A consistent and verified safety backup is created before destructive work.
- Reset aborts if safety backup creation or verification fails.
- Reset creates a fresh current-schema database rather than manually clearing known tables.
- Database replacement uses maintenance locking and safe swap behavior.
- Failed replacement/post-reset verification automatically restores the pre-reset backup.
- Successful reset leaves the application healthy with zero inventory data.
- Settings stored outside SQLite remain intact.
- Pre-reset backups remain available after reset.
- Automated service/API/schema and Playwright coverage passes.
