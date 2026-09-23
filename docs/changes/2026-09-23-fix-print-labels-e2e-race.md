# Fix the print-labels browser test race

- **Completed:** 2026-09-23
- **Version:** 0.29.1

## Summary

The GitHub release workflow failed for `v0.28.0` and `v0.29.0` in `npm run test:e2e`, both times in
`print-labels.spec.js` › `selects items across pages and filters, then prints them from one batch
request`. The test records API requests to prove that the print view loads its labels with a single
`POST /api/items/labels`. It started recording right after clicking **Items**, but the Items page
requests `GET /api/items` only after its categories have loaded. On the slower CI runner that list
request was sent inside the recording window and was counted, so the recorded requests were
`GET /api/items` plus `POST /api/items/labels`. The application behaved correctly.

The test now waits for the Items list response before it starts recording. No application code
changed. Because the failed releases were never published, the version advances to 0.29.1 with a
release-history entry that points to the 0.28.0 and 0.29.0 features, and the existing tags stay as
they are.

## Verification

- Reproduced the CI failure locally by delaying `/api/categories` and `/api/items/labels` in the
  test: without the fix it failed with the same `GET /api/items` difference, and with the fix it
  passed. The temporary delays were removed afterwards.
- `print-labels.spec.js` passed three times in a row with `--repeat-each 3`.
- `node scripts/release-notes.mjs v0.29.1` and `node scripts/validate-release-version.mjs v0.29.1`
  passed.
- `npm run lint` passed.
- `npm test` passed: 89 tests passed and 1 platform-dependent test skipped.
- `npm run build` passed.
- `npm run test:e2e` passed with all 75 Chromium tests.
