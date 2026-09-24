# Cloud backup app credentials in Settings

- **Completed:** 2026-09-24
- **Version:** 0.32.1

## Summary

- The Dropbox app key and app secret and the Google Drive client ID and client secret can now be
  entered in **Settings → Cloud Backup → App credentials** instead of only through
  `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET` and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- New `CloudAppSettingsService` resolves the credentials per provider: the environment wins when it
  sets the app key or client ID; otherwise the values saved under `apps` in the owner-only
  `DATA_DIR/cloud-backup-credentials.json` are used. The storage adapters now read them through an
  `app()` callback, so a change applies without a restart.
- The secret behaves like the AI API key: it is never returned by the API (only
  `hasClientSecret` and a `••••••••1234` mask), a blank field keeps it, and a changed app key or client
  ID drops it unless it is entered again. **Remove** deletes the saved credentials. Changing the app key
  or client ID, or removing the credentials, is refused while the provider is connected, because its
  refresh token only works with that app; environment-provided credentials are read-only in Settings.
- New API routes `PUT` and `DELETE /api/cloud-backup/providers/:provider/app`; the overview carries a
  client-safe `app` view per provider. New component `client/src/components/CloudAppCredentials.vue`.
- The Playwright suite now configures Google Drive through Settings and keeps Dropbox in the
  environment, so both sources are covered.
- Documentation: `docs/features/cloud-backup.md`, `docs/HOW-TO.md`, `README.md`, `docs/proxmox.md`,
  `AGENTS.md`, and the release history.

## Verification

- `npm run lint` — passed.
- `npm test` — 120 passed, 1 skipped (shellcheck is not installed locally), including the new app
  credentials service test and the extended cloud backup API test.
- `npm run build` — passed.
- `npm run test:e2e` — 81 passed, including the new Google Drive app credentials browser test.
