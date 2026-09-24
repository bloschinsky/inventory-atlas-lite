# Cloud backup to Dropbox and Google Drive

- **Completed:** 2026-09-24
- **Version:** 0.32.0

## Summary

- Added a provider-neutral cloud backup layer. `CloudBackupService` takes the snapshot through the new
  `BackupService.createSnapshot()` (the path `createDownload()` now uses as well), uploads it through
  the chosen storage adapter, applies retention, and records status and history; only one cloud backup
  runs at a time and every snapshot respects the restore/reset maintenance lock.
- Added `DropboxStorageProvider` (App folder, upload sessions, minimal scopes) and
  `GoogleDriveStorageProvider` (`drive.file`, visible `Inventory Atlas Lite/Backups` folder,
  resumable uploads), both in 32 MB chunks over the shared `CloudStorageHttp` transport that
  normalizes timeouts, unreachable providers, revoked grants, rate limits, quota, invalid destinations,
  and upload failures.
- Added `CloudConnectionService`: OAuth 2.0 authorization code flow with PKCE, a single-use random
  state bound to an `HttpOnly` `SameSite=Lax` cookie, refresh tokens in
  `DATA_DIR/cloud-backup-credentials.json` (`0600`, outside SQLite), in-memory access tokens with
  automatic refresh and one retry, test connection, and disconnect with revocation.
- Added `CloudBackupScheduler` and restart-safe schedule claims in `DATA_DIR/cloud-backup.json`:
  daily or weekly at a local time in the server time zone, the next run persisted before each run, a
  single catch-up after downtime, and failures recorded without affecting the process.
- Added the `/api/cloud-backup` routes, the **Cloud Backup** card in Settings
  (`client/src/components/CloudBackupSettings.vue`), and a pointer to it on **Data / Backup**.
- Configuration: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  optional `CLOUD_BACKUP_REDIRECT_URI` and `TZ`, and the test-only `CLOUD_BACKUP_TEST_ENDPOINT`.
- Tests: `test/cloud-backup.test.js`, `test/e2e/cloud-backup.spec.js`, and the shared local API stub
  `test/e2e/cloudProviderStub.js`, which the Playwright configuration now starts with the suite.
- Documentation: new `docs/features/cloud-backup.md` and its index entry; updates to
  `docs/HOW-TO.md`, `README.md`, `docs/proxmox.md`, `AGENTS.md`, `docs/ROADMAP.md`, `.gitignore`, and
  the release history; removal of the completed task file
  `docs/issues/TASK-cloud-backup-dropbox-google-drive.md`.

## Verification

- `npm run lint` — passed.
- `npm test` — 119 passed, 1 skipped (shellcheck is not installed locally), including the 15 new
  cloud backup tests.
- `npm run build` — passed.
- `npm run test:e2e` — 80 passed, including the two new cloud backup browser tests.
- All provider traffic in the automated tests went to the local stub. No real Dropbox or Google
  account was connected, so the OAuth setup against the live providers was not verified manually.
