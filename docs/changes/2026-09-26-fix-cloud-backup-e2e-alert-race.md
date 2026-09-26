# Fix cloud backup browser test alert race

- **Completed:** 2026-09-26
- **Version:** 0.40.1

## Summary

- The `v0.40.0` release workflow failed in `npm run test:e2e`:
  `cloud-backup.spec.js` › *reports a cancelled Google Drive connection and keeps it disconnected*
  matched `getByRole('alert')` against two elements. The AI settings card had added its own
  *Could not load the model list* alert next to the expected Google Drive error.
- Cause: Settings loads the AI model list whenever an API key is saved, and earlier specs leave the
  suite's test key saved. In CI the server passed that list request on to the real OpenAI API, which
  rejected the test key, and whether that alert appeared before the assertion depended on timing.
- `test/e2e/cloud-backup.spec.js` now answers `/api/ai/models` in the browser for every test, so the
  Settings page never reaches a real AI provider, and it reads the cancelled-connection alert from the
  **Cloud Backup** card only.
- No application change. The version moves to 0.40.1 because the `v0.40.0` tag is already pushed and
  was never published as a release; the tag is not moved or rewritten.

## Verification

- `npx eslint test/e2e/cloud-backup.spec.js` — passed.
- `npx playwright test ai-providers cloud-backup` — 5 passed, with the AI provider spec running first
  so that it leaves an API key saved, as in CI.
- `npm run lint` — passed.
- `npm test` — 172 tests: 171 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `npm run test:e2e` — 106 passed (run with `APP_VERSION=0.40.1` before the commit, since the working copy
  still sat on the `v0.40.0` tag).
