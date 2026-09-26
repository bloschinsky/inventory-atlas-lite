# Bulk Replace Field Value

- **Completed:** 2026-09-26
- **Version:** 0.39.0

## Summary

- New **Replace field value** card on **Data / Backup** (`client/src/components/BulkReplaceValue.vue`):
  choose Condition, Location, Transferred To, or one text custom field (listed with its category),
  pick the current value from the saved values with usage counts, enter the new value, review the
  preview, and confirm with **Replace in N items**.
- New API next to the item routes: `GET /api/items/bulk-replace/fields`,
  `GET /api/items/bulk-replace/values/:type/:id`, `POST /api/items/bulk-replace/preview`, and
  `POST /api/items/bulk-replace`. Core fields are addressed by key through a server-side column
  whitelist, custom fields by their stable id.
- `BulkReplaceService` matches whole values ignoring surrounding whitespace and case (including
  non-ASCII letters), never substrings; the apply step matches again inside one SQLite transaction and
  returns the actual `updated` count. `BulkReplaceRepository` holds the SQL. Location replacement only
  edits saved `items.location`, so contained items follow through effective-location inheritance.
- `FieldAutocomplete.vue` gained an optional `showCounts` prop for usage-count badges.
- New error codes `BULK_REPLACE_UNSUPPORTED_FIELD`, `BULK_REPLACE_TEXT_ONLY`,
  `BULK_REPLACE_SOURCE_REQUIRED`, `BULK_REPLACE_TARGET_REQUIRED`, and `BULK_REPLACE_SAME_VALUE`, and
  the `bulkReplace.*` interface strings, in English and Ukrainian.
- Documentation: new `docs/features/bulk-replace-field-value.md` and its index entry; updates to
  `docs/HOW-TO.md`, `docs/features/custom-field-autocomplete.md`, `docs/ROADMAP.md`, `AGENTS.md`, and
  the release history. The completed task file `docs/issues/TASK-BULK-REPLACE-FIELD-VALUE.md` was
  removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 166 tests: 165 passed, 1 skipped (shellcheck is not installed locally), including the
  11 new tests in `test/bulk-replace.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 103 passed, including the new `test/e2e/bulk-replace.spec.js` (counted value
  suggestions, preview with the existing-value note and affected items, confirmation, saved and
  inherited results, custom-field scope, and the disabled action without matches). The suite ran with
  `APP_VERSION=0.39.0`, because the uncommitted working copy still resolves its version from the
  `v0.38.0` tag on `HEAD`, which the What's New specs compare against `package.json`.
