# Cloud backup to Dropbox and Google Drive

## Summary

**Settings → Cloud Backup** uploads the same consistent SQLite snapshot that **Data / Backup →
Download backup** produces to Dropbox or Google Drive, on demand or on a daily or weekly schedule run
by the server itself. Providers are connected with OAuth 2.0; their refresh tokens stay on the server
in a file of their own and are never part of an inventory backup or an API response.

## User-visible behaviour

- The **Cloud Backup** card lists one provider card each for **Dropbox** and **Google Drive** with a
  status badge: *Not configured* (no app credentials yet; the card shows the redirect URI to register
  and opens the **App credentials** form), *Not connected* (with **Connect Dropbox** / **Connect Google
  Drive**), or *Connected* (account, connection date, destination folder, **Backup now**, **Test
  connection**, and **Disconnect**).
- **App credentials**, a collapsible section on each card, takes the Dropbox app key and app secret or
  the Google Drive client ID and client secret, the same way the AI API key is entered: the secret is
  a password field, is never sent back to the browser, and is shown only as `Saved client secret:
  ••••••••1234. Leave this blank to keep it.` **Save app credentials** stores them and **Remove**
  deletes them. While a provider is connected its app key or client ID is locked and **Remove** is
  disabled, because the stored refresh token only works with that app; the secret alone can still be
  replaced. When the server environment sets the credentials, the section only names the variables
  and the app key or client ID, and nothing can be edited there.
- **Connect** sends the browser to the provider's consent page. On return, Settings reports
  `Dropbox connected.` or the reason the connection failed — for example *Google Drive access was not
  granted, so nothing was connected.* The reason is taken from the server, never from the URL.
- **Backup now** reports `Backup uploaded to <provider> as inventory-atlas-lite-YYYY-MM-DDTHH-mm-ssZ.sqlite.`
  and, when retention could not remove older copies, that separate problem. **Test connection**
  reports `Connected to <provider> as <account>.` **Disconnect** revokes the grant at the provider
  where it still answers and always removes the stored access from the server.
- **Automatic backups**: **Enable automatic backups**, **Back up to** (connected providers only),
  **Frequency** (Daily / Weekly), **Day of week** for weekly runs, and **Time of day**. The card names
  the server time zone the time is entered in, for example `Europe/Kyiv`. The switch is disabled
  until a provider is connected, and disconnecting the scheduled provider switches the schedule off.
- **Retention**: **Keep all backups** or **Keep only the newest backups** with **Backups to keep**
  (1–365).
- **Status**: last successful backup (time, provider, file), last attempt (time, manual or scheduled,
  result), its service, the last error, the retention cleanup result, and the next scheduled run in
  the server time zone.
- **Data / Backup** points to the Settings card; the local download, restore, and reset are unchanged.

## Implementation overview

### Layers

```text
routes/cloudBackupRoutes.js            thin HTTP layer, OAuth state cookie, callback redirect
services/cloudBackupService.js         snapshot → upload → retention → status/history, schedule claims
services/cloudConnectionService.js     OAuth + PKCE, refresh tokens, access tokens, disconnect
cloudBackup/cloudBackupScheduler.js    in-process timer that runs due schedules
cloudBackup/schedule.js                settings validation, next-run computation, backup file names
cloudBackup/jsonFileStore.js           atomic 0600 JSON files under DATA_DIR
cloudBackup/cloudBackupConfig.js       environment configuration and provider endpoints
services/cloudAppSettingsService.js    OAuth app credentials: environment or Settings, masking
integrations/cloudStorageHttp.js       shared transport, timeouts, chunk reader, error normalization
integrations/dropboxStorageProvider.js
integrations/googleDriveStorageProvider.js
```

`CloudBackupService` knows nothing about Dropbox or Google. Each adapter exposes the same small
surface — `authorizationUrl`, `exchangeCode`, `refresh`, `revoke`, `account`, `check`, `upload`,
`list`, `remove`, plus `configured`, `requiredSettings`, and `destination` — so another provider such
as S3 or WebDAV is one more adapter registered in `server/src/app.js`.

### Snapshot and upload

- `BackupService.createSnapshot()` is the one snapshot path: SQLite's online backup API into a
  temporary file under the maintenance guard, exactly as for a download (`createDownload()` now calls
  it). A snapshot is refused with HTTP `503` while a restore or reset replaces the database, and a
  restore or reset waits for a snapshot in progress. The upload itself reads only the temporary copy,
  so it can never affect the live database; the copy is deleted when the run ends, whatever the outcome.
- Only one cloud backup runs per process; a second manual request answers HTTP `409`, and a scheduled
  run that meets a running one is recorded as skipped.
- Dropbox always uses an upload session (`upload_session/start`, `append_v2`, `finish`) in 32 MB
  chunks, so snapshots above the 150 MB single-request limit work. Google Drive uses a resumable upload
  in 32 MB chunks (a multiple of 256 KiB). Neither loads the whole snapshot into memory.
- File names are `inventory-atlas-lite-YYYY-MM-DDTHH-mm-ssZ.sqlite` in UTC. Dropbox uploads with
  `mode: add` and never overwrites.

### Destinations and scopes

- **Dropbox**: an app with **App folder** access. The authorization requests only
  `account_info.read files.metadata.read files.content.write` with `token_access_type=offline`.
  Backups go to `/Backups` inside the app folder, which Dropbox shows as `Apps/<app name>/Backups`.
- **Google Drive**: only `https://www.googleapis.com/auth/drive.file`, with `access_type=offline` and
  `prompt=consent` so every connection returns a refresh token. The adapter finds or creates the
  visible folders `My Drive/Inventory Atlas Lite/Backups`; `drive.file` lets it see only what it created.
  The account name comes from `drive/v3/about`, so no profile scope is needed.

### Retention

After a successful upload with **Keep only the newest backups**, the adapter lists only the
application's own backup folder; the service keeps files whose name matches the exact backup-name
pattern, sorts them newest first, and deletes those beyond N — never the file just uploaded, never
any other name, never anything outside that folder. The outcome is stored as `cleanup: { ok, deleted,
error }` next to the successful upload; a cleanup failure never turns the backup into a failure.

### OAuth, credentials, and secrets

- `POST /api/cloud-backup/providers/:provider/connect` creates a 32-byte random `state` and a PKCE
  verifier (S256), keeps them in memory for ten minutes, sets the state in an `HttpOnly`,
  `SameSite=Lax` cookie limited to `/api/cloud-backup/oauth`, and returns the authorization URL.
- `GET /api/cloud-backup/oauth/callback` accepts the callback only when the `state` matches both a
  pending connection and the browser's cookie; it is consumed before anything else, so a replayed or
  forged callback cannot store tokens. The server exchanges the code, requires a refresh token, reads
  the account name, and redirects with `303` to `/settings?cloud=connected&provider=…` or
  `/settings?cloud=error`. Error texts are never reflected through the URL.
- The redirect URI is `CLOUD_BACKUP_REDIRECT_URI` when set; otherwise it is built from the browser's
  `Origin` header (falling back to the request host) plus `/api/cloud-backup/oauth/callback`, and the
  card shows the address to register. A desktop build can supply its own callback through the same
  setting without touching the adapters.
- `DATA_DIR/cloud-backup-credentials.json` (mode `0600`, written atomically) holds per provider the
  account name, connection time, and refresh token, and under `apps` the app credentials entered in
  Settings (`{ clientId, clientSecret }`). Access tokens live in memory, are refreshed a
  minute before expiry, and a token the provider rejects early is refreshed once and the call
  retried, so scheduled runs need no interactive login. A rotated refresh token replaces the stored one.
- `DATA_DIR/cloud-backup.json` holds the settings, the next run, the last success, and the last 20
  attempts; it contains no secrets. Neither file is inside `inventory.sqlite`, so no download, cloud
  backup, or restore carries or replaces them.
- Tokens, codes, and request bodies are never logged or returned. Log lines name the provider, the
  operation, the HTTP status, and the normalized message only.

### Scheduling

- The schedule is a local wall-clock time in the server process's time zone (`TZ`, else the system
  zone), exposed as `timezone` by the API. `nextRunAt` is stored as a UTC instant; the hours are
  re-applied after moving the date so a daylight-saving change does not shift a run.
- `CloudBackupScheduler` checks every 30 seconds with an unreferenced timer and stops on shutdown.
  `CloudBackupService.claimDueRun()` writes the following `nextRunAt` *before* the backup starts, so a
  restart, a crash, or a clock change cannot run one slot twice; a clock moved back just waits for the
  stored instant. Runs missed while the server was down are caught up once after start, not once per
  missed slot.
- Saving the settings recomputes `nextRunAt` from now. Scheduled failures are recorded and logged and
  never reach the process; the next slot is always planned.

### API

| Method and path | Purpose |
| --- | --- |
| `GET /api/cloud-backup` | Time zone, callback path, providers (configured, connected, account, destination, redirect URI override), settings, status, history |
| `PUT /api/cloud-backup/settings` | `{ schedule: { enabled, provider, frequency, weekday, time }, retention: { mode, keep } }`; answers with the overview |
| `PUT /api/cloud-backup/providers/:provider/app` | `{ clientId, clientSecret }`; a blank secret keeps the saved one for the same app; answers with the overview |
| `DELETE /api/cloud-backup/providers/:provider/app` | Removes the app credentials entered in Settings; refused while connected or when they come from the environment |
| `POST /api/cloud-backup/providers/:provider/connect` | Starts OAuth; returns `{ authorizationUrl }` |
| `GET /api/cloud-backup/oauth/callback` | Completes OAuth and redirects to Settings |
| `POST /api/cloud-backup/providers/:provider/test` | `{ message, account }` |
| `POST /api/cloud-backup/providers/:provider/backup` | Backup now; returns the recorded attempt |
| `DELETE /api/cloud-backup/providers/:provider` | Disconnect; returns `{ revoked }` |

Provider ids are `dropbox` and `google-drive`. Writes answer `503` during a restore or reset like
every other write.

### Error handling

Failures become `{ "error": { "code", "params" } }` as described in
[`api-error-codes.md`](api-error-codes.md), for example `CLOUD_NOT_CONFIGURED` (`409`),
`CLOUD_ACCESS_REVOKED`, `CLOUD_ACCESS_REJECTED`, `CLOUD_TIMEOUT` (`504`), `CLOUD_UNREACHABLE` and
`CLOUD_PROVIDER_UNAVAILABLE`, `CLOUD_RATE_LIMITED` (`503`), `CLOUD_QUOTA` (`507`), the folder and upload
codes, and `CLOUD_REQUEST_FAILED`. The adapters keep their internal classification (`not_configured`,
`auth_revoked`, `unauthorized`, `timeout`, `unavailable`, `rate_limited`, `quota`, `invalid_destination`,
`upload_failed`, `provider_error`) in a separate `reason` property. A denied or cancelled consent, an
expired or forged callback, and a missing refresh token have their own codes. The history, the cleanup
result, and the last connection failure are stored as `{ code, params }`.

## Operator notes

The app credentials can be entered in Settings or set in the environment. When
`DROPBOX_APP_KEY` or `GOOGLE_CLIENT_ID` is set, the environment wins and Settings shows the provider's
credentials read-only; values saved in Settings are then ignored.

| Variable | Meaning |
| --- | --- |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | Optional Dropbox app credentials. The secret is optional; Dropbox works once the key is set. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth client (type *Web application*). Both are required together. |
| `CLOUD_BACKUP_REDIRECT_URI` | Optional fixed callback URL, for example behind a reverse proxy. |
| `TZ` | Optional time zone for schedules, for example `Europe/Kyiv`. |
| `CLOUD_BACKUP_TEST_ENDPOINT` | Test-only: sends every provider call to a local stub. Never set it in production. |

The redirect URI registered with the provider must match the address the browser uses exactly,
including scheme and port, for example `http://localhost:3000/api/cloud-backup/oauth/callback`.
Dropbox accepts plain HTTP only for `localhost`; Google accepts plain HTTP only for `localhost` and
does not accept private IP addresses. For a LAN installation, open the application through
`http://localhost:3000` once (for example with `ssh -L 3000:localhost:3000 <server>`) to connect, or
serve it over HTTPS on a real host name, such as a Tailscale `https://<host>.<tailnet>.ts.net`
address. The connection keeps working afterwards from any address, because only the refresh token is
needed. Setup steps are in the [quick how-to](../HOW-TO.md#back-up-to-dropbox-or-google-drive).

The application still has no authentication: anyone who reaches it can connect, disconnect, or trigger
a cloud backup. Keep it on a trusted LAN or VPN.

## Verification

- `test/cloud-backup.test.js` runs against `test/e2e/cloudProviderStub.js`, a local stub of both APIs:
  schedule computation and validation, file-name rules, app credentials from the environment or
  Settings (masking, the secret kept for the same app and dropped for another, the lock while
  connected, removal), PKCE and scopes, refresh tokens kept only in
  the `0600` credentials file, forged, replayed, and denied callbacks, Dropbox upload sessions and
  Google resumable uploads in several chunks that restore to a valid SQLite database, the shared
  snapshot path and its cleanup, an upload failure that leaves the live database untouched, retention
  that keeps other files and folders, a cleanup failure reported separately, token refresh after a
  restart and after an early rejection, a revoked grant, disconnect with and without a reachable
  provider, restart-safe scheduling without duplicate runs and with a single catch-up, the one-job
  lock and the restore lock, secrets absent from downloaded and uploaded backups, normalized errors,
  and the HTTP API including the state cookie, the `Origin`-based redirect URI, an unconfigured
  provider, and the absence of tokens in every response.
- `test/e2e/cloud-backup.spec.js` covers the browser workflow against the same stub: disconnected
  providers, Dropbox credentials shown read-only from the environment, Google Drive credentials
  entered, masked, locked while connected, and removed in Settings, the full Connect round trip, Test connection, Backup now, the status list, schedule and
  retention configuration surviving a reload, Disconnect switching the schedule off, and a cancelled
  Google Drive consent.

## Notes and limitations

- One schedule for one provider; Backup now works with every connected provider.
- The Dropbox app folder name is chosen when the Dropbox app is created and is not shown by the API.
- No live Dropbox or Google account is used by the automated tests.
- Cloud backups are not restored from the cloud directly: download the file from Dropbox or Google
  Drive and use **Restore from backup**.
