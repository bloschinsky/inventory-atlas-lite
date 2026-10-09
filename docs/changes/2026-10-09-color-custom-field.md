# Color custom field with twelve presets, Custom HEX, sorting, and filtering

- **Completed:** 2026-10-09
- **Version:** 0.61.0
- **Issue:** #27

## Summary

- **New field type `color`** in `FIELD_TYPES`, so Categories & Fields, Batch Add Fields, AI Add Fields,
  and the API offer it next to Text, Number, Date, and Boolean. It stays an optional, category-scoped
  custom field.
- **Shared contract (`shared/colors.js`):** twelve presets (Black `#171717` … Pink `#E886B2`) in sort
  order, then `custom`. Values are stored in the existing `value TEXT` columns as canonical compact JSON,
  `{"key":"brown","hex":"#795548"}`. `readColor()` accepts the object or its JSON text with exactly `key`
  and `hex`, normalizes the HEX to uppercase, and refuses unknown groups, malformed JSON, extra
  properties, an invalid HEX, and a preset with a different HEX; `validateFieldValue()` reports
  `INVALID_CUSTOM_FIELD_COLOR`. Empty values are `NULL`, and a custom shade is never reclassified.
- **Schema version 10:** the `custom_fields.type` `CHECK` is built from `FIELD_TYPES`. Older tables are
  rebuilt from their own stored definition with only that `CHECK` replaced: ids, columns, other
  constraints, item and template values, the `AUTOINCREMENT` counter, and the touch triggers are kept;
  foreign keys are off only around the migration transaction, and `last_updated_at` is not moved.
  Tables without a type `CHECK` (the oldest databases) are left alone. Restore migrates older backups on
  the staged copy.
- **Sorting and filtering on the server:** a Color column sorts by palette rank, then Custom, then by
  HEX, with unset values last in both directions. `GET /api/items` accepts `colorField` + `color`
  (a group key or `unset`). The filter compares the stored key, so Custom covers every custom shade.
  Not set is limited to the categories that have the field. Both combine with the other filters, the
  count, and pagination.
- **Interface:** `ColorPicker.vue` is an accessible radio group of swatches in a 4-column grid with
  checkmarks, outlines for both modes, Custom with a native color input and a HEX box, a preview, and
  Clear. It is used by the item form, the template editor, and the Batch Add Items preview.
  `ColorValue.vue` shows the swatch and localized name in details (with the HEX), the table, and the
  phone cards. The Items page has a color filter when a Color column exists. Labels are in English and
  Ukrainian.
- **Integrations:** templates, duplicates, and drafts carry the stored value. Batch import reads an
  object or a JSON string, and its template writes `null`. AI Add Item is told the preset names and maps
  a preset name to the preset, keeps a valid HEX as Custom, and drops anything else. The public demo's
  Travel & Outdoor category gained a Color field.
- **Docs:** `docs/features/color-custom-field.md` (new) with its index entry. Updated
  `item-list-columns-and-sorting.md`, `batch-add-fields.md`, `batch-add-items.md`, `ai-add-fields.md`,
  `ai-add-item.md`, `public-demo.md`, `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (same structure),
  `AGENTS.md`, and the 0.61.0 release notes.

## Verification

- `npm run lint` passed.
- `npm test` ran 342 tests: 339 passed, 1 skipped, 2 failed. Both failures are the guide tests in
  `test/landing.test.js`. They fail the same way on an untouched `master` checkout on this Windows
  machine and are unrelated to this change. New: `test/color-field.test.js` (7 tests) and an AI
  color-mapping test in `test/ai-providers.test.js`. Schema-version and field-type assertions in the
  existing suites now expect version 10 and the new type.
- `npm run build` passed.
- `npm run test:e2e` with `APP_VERSION=0.61.0`: 232 passed (22.5 min). New: `test/e2e/color-field.spec.js` (5 tests).
  An earlier full run showed that the spec's single 5-item category pushed the Dashboard spec's
  category out of the top six in the shared database. The spec now spreads those items over three
  categories.
