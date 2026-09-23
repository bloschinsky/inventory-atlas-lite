# Transferred To common item field

- **Completed:** 2026-09-23
- **Version:** 0.28.0

## Summary

Added an optional **Transferred To** base field to every item for noting who or where an item went
when it was lent, given away, sold, or otherwise transferred.

Existing SQLite databases receive a nullable `items.transferred_to` column through the additive
startup migration, and the column is part of the current schema used by restore validation. The item
API trims the value, stores empty input as `NULL`, rejects values over 255 characters, and returns
the field in item details and list rows. Saving it never changes the location or any other property.
Item search now also matches the field, and a new `GET /api/items/transferred-to-suggestions`
endpoint returns distinct saved values grouped regardless of case and surrounding whitespace.

The item form has a Transferred To input that reuses the existing autocomplete combobox, now
parameterized by its suggestions endpoint and forwarding input attributes. The item page and the
Items list show an informational `Transferred to: …` Tabler badge only while the field is set. The
Items search placeholder names the new searchable field. AI Add Item is unchanged and leaves the
field empty.

Added the permanent feature document, updated the feature index, the custom-field autocomplete,
application UI, and Playwright documents, the quick guide, the roadmap, and the version history,
removed the completed task file, and advanced the project version from 0.27.0 to 0.28.0.

## Verification

- `npm run lint` passed.
- `npm test` passed: 86 tests passed and 1 platform-dependent test skipped.
- `npm run build` passed.
- `npm run test:e2e` passed with all 74 Chromium tests.
- Service tests cover create with and without the field, null → value → value → null, whitespace
  clearing, validation, location preservation, search, and suggestion grouping and limits. API tests
  cover legacy-database migration, the HTTP create/update/clear flow, search, suggestions, backup
  contents, and persistence across a restart; the restore test verifies the value survives a restore.
- Playwright covers setting the field, the badge on the item page and in the list, the saved value
  being suggested on another item, and the badge disappearing after the field is cleared.
