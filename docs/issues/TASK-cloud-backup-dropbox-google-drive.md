# TASK — Cloud Backup to Dropbox and Google Drive

## Status

Planned.

## Goal

Extend the existing SQLite backup feature with optional cloud destinations:

- Dropbox
- Google Drive

Users must be able to connect a provider, create a backup immediately, and schedule automatic backups.

The cloud feature must reuse the application's existing consistent SQLite backup mechanism. Do not implement backup by copying the live database file directly.

## Architecture

Introduce a provider-neutral cloud backup layer.

Recommended responsibilities:

```text
BackupService
  -> create consistent SQLite snapshot

CloudBackupService
  -> receive snapshot
  -> select configured storage provider
  -> upload
  -> record result/status

StorageProvider
  -> DropboxStorageProvider
  -> GoogleDriveStorageProvider
```

Do not put Dropbox- or Google-specific behavior into the core backup service.

Keep provider adapters under the existing integrations area or the closest project-standard equivalent.

The design must make adding future providers such as S3/WebDAV possible without rewriting the backup workflow.

## Existing backup behavior

Preserve the existing local **Data / Backup** behavior.

Cloud backup must build on the same consistent snapshot produced by the current SQLite online backup logic.

Local backup download and restore must continue to work unchanged.

Cloud backup must never include integration credentials or refresh tokens inside `inventory.sqlite`.

## Settings UI

Add a **Cloud Backup** / **Backup & Cloud Storage** section in Settings.

Display separate provider cards for:

- Dropbox
- Google Drive

Each provider must expose appropriate states/actions:

- Not connected
- Connect
- Connected account/provider status
- Test connection
- Disconnect
- destination folder information where applicable

Only connected providers may be selected as backup destinations.

## Authentication

Use OAuth 2.0.

Do not ask the user to manually paste long-lived Google/Dropbox access tokens into normal application settings.

The implementation must support access-token refresh so scheduled backups can run without interactive login.

Store cloud credentials separately from the SQLite inventory database.

Secrets must:

- never be returned by normal settings APIs;
- never appear in logs;
- never be included in downloaded SQLite backups;
- use restrictive filesystem permissions consistent with the existing AI settings approach.

### Dropbox

Use a Dropbox app with the smallest practical permissions.

Prefer App Folder access so Inventory Atlas Lite cannot access unrelated user files.

Upload backups beneath the app-owned backup location.

### Google Drive

Use the narrowest practical Google Drive scope.

Prefer `drive.file` and create/use a dedicated visible folder such as:

```text
Inventory Atlas Lite/
  Backups/
```

Do not request unrestricted access to the user's entire Drive unless it becomes technically necessary and is explicitly documented.

The user should be able to see and manually download the resulting backup files in Google Drive.

## OAuth deployment considerations

Inventory Atlas Lite has self-hosted web deployments and planned desktop/Electron distributions.

Design OAuth handling so provider auth is not tightly coupled to only one deployment model.

The first implementation must work for the current self-hosted application.

Keep callback/redirect configuration isolated behind provider configuration so Electron can later use a desktop-appropriate callback without replacing the storage-provider abstraction.

Do not make the scheduler depend on a browser tab remaining open.

## Backup now

Add **Backup now** for a connected provider.

Flow:

1. create a consistent SQLite snapshot using the existing backup mechanism;
2. generate a deterministic filename;
3. upload it to the selected provider;
4. report success or failure;
5. remove temporary local upload artifacts after completion.

Recommended filename:

```text
inventory-atlas-lite-YYYY-MM-DDTHH-mm-ssZ.sqlite
```

A failed cloud upload must not affect the live database.

## Scheduled backup

Add configurable automatic backups.

Minimum scheduling options:

- disabled/enabled;
- provider;
- daily;
- weekly;
- time of day.

Store the schedule server-side.

The schedule must execute in the backend process and must not require an open browser.

Persist enough schedule state to survive application restarts.

Avoid duplicate execution after restart or clock changes.

Use the server/deployment timezone deliberately and expose the effective timezone in the UI.

Prefer UTC internally and clearly convert/display the configured local schedule.

## Retention

Add a configurable retention option for cloud-generated backups.

Minimum options:

- keep all;
- keep last N backups.

When `keep last N` is enabled:

1. upload the new backup successfully;
2. enumerate only backups owned by Inventory Atlas Lite in its configured backup folder;
3. delete excess older backups;
4. never delete unrelated provider files.

Retention cleanup failure must not mark an otherwise successful backup upload as a database-backup failure; report cleanup status separately.

## Status/history

Expose basic operational state in the UI.

At minimum show:

- last successful cloud backup time;
- last attempted backup time;
- selected provider;
- last error, if any;
- next scheduled run when scheduling is enabled.

Persist lightweight operational metadata outside the inventory data model unless there is a strong project-standard reason otherwise.

Do not store secrets in status/history records.

## Concurrency

Respect the existing backup/restore locking behavior.

Cloud backup must not create unsafe overlap with:

- restore;
- local backup generation;
- application update backup operations where relevant.

Multiple scheduled/manual cloud backup jobs must not run concurrently against the same application instance.

## API

Implement clear server endpoints/services for:

- provider status;
- connect/auth initiation;
- OAuth callback completion;
- disconnect;
- test connection;
- manual cloud backup;
- schedule read/update;
- cloud backup status/history.

Follow existing API/service/repository separation and OOP/SOLID rules in `AGENTS.md`.

Never expose provider secrets to the client.

## Failure handling

Handle and surface at least:

- provider not configured;
- OAuth denied/cancelled;
- expired/revoked refresh token;
- network timeout;
- provider unavailable;
- quota/storage limit;
- invalid destination;
- upload failure;
- scheduler failure;
- retention cleanup failure.

Scheduled failures must not crash the server.

A later scheduled run must still be attempted unless the integration is no longer usable.

## Tests

Add automated tests for:

### Core/services

- cloud backup uses the existing consistent snapshot path;
- successful manual upload;
- upload failure leaves live DB untouched;
- scheduler persistence/restart behavior;
- duplicate-run prevention;
- retention rules;
- disconnect removes usable credentials;
- secrets do not appear in exported database backups;
- provider errors are normalized.

### Provider adapters

Mock Dropbox and Google HTTP/OAuth interactions.

Do not require real user cloud credentials in CI.

Cover:

- auth/token refresh;
- upload;
- list;
- delete for retention;
- revoked credentials;
- network/API errors.

### Playwright

Mock provider/backend behavior and cover:

1. provider appears disconnected;
2. connect flow completion;
3. manual Backup now;
4. schedule configuration;
5. status display;
6. disconnect.

## Security

- Apply least-privilege provider scopes.
- Do not log OAuth authorization codes, access tokens, or refresh tokens.
- Do not return tokens to the browser after server-side OAuth completion.
- Protect OAuth state against CSRF.
- Validate redirect/callback state.
- Use secure random state values.
- Document any required environment variables/client IDs/secrets.
- Preserve the project's trusted-LAN/Tailscale security assumptions; do not silently introduce public-facing auth claims.

## Documentation

When implemented:

- add a feature document under `docs/features/`;
- update `docs/features/README.md`;
- update `docs/HOW-TO.md`;
- document required provider app/OAuth configuration;
- update deployment documentation where environment variables/callback URLs are required;
- update `docs/ROADMAP.md`;
- add the required `docs/changes/YYYY-MM-DD-*.md` record;
- follow the task-file lifecycle in `AGENTS.md`.

## Acceptance criteria

- Existing local backup and restore continue to work.
- Dropbox can be connected via OAuth and receive a valid SQLite backup.
- Google Drive can be connected via OAuth and receive a valid SQLite backup.
- Scheduled backups run server-side without an open browser.
- OAuth refresh allows later unattended backup execution.
- Backup retention never deletes unrelated cloud files.
- Cloud credentials are not stored in `inventory.sqlite`.
- Cloud credentials never appear in downloaded backups or normal API responses.
- Provider failures do not damage the database or crash the application.
- Provider-specific code is isolated behind a storage abstraction.
- Automated service/API/provider and Playwright coverage passes.
