# Rename custom fields without losing values

- **Completed:** 2026-10-04
- **Version:** 0.49.0

## Summary

Implemented GitHub issue #2, *TASK: Rename Custom Fields Without Losing Values*. A custom field can be
renamed in place from **Categories & Fields**. Custom values are linked by the field id, so a rename
updates only `custom_fields.name` (and `updated_at`); no value row is touched, and the id, type, and
category stay the same.

- **API:** `PATCH /api/fields/:id` with `{ "name": "..." }` returns `{ id, category_id, name, type }`.
  Any other property is refused with the new `400 FIELD_UPDATE_UNSUPPORTED_PROPERTY`, so a type or
  category change is never applied silently.
- **Validation:** `fieldNameError()` and `sameFieldName()` were extracted in
  `shared/fieldDefinitions.js` and are used by both the batch field review and the rename: required,
  trimmed, at most 60 characters, not a built-in attribute, and unique within the category without
  regard to case (`409 FIELD_ALREADY_EXISTS`). The unchanged name is a no-op. A unique-constraint
  violation during the `UPDATE` is translated to `FIELD_ALREADY_EXISTS` as well.
- **Layers:** `CustomFieldRepository.findById()` now returns `id, category_id, name, type`, and the new
  `updateName()` is a single `UPDATE`. `CustomFieldService.requireField()` is shared by the rename and
  value suggestions; `rename()` holds the rules; `fieldRoutes.js` stays thin.
- **UI:** a **Rename** button beside **Delete** for every field, using the same prompt pattern as a
  category rename; success reloads the field list and clears the error.
- **Existing behaviour reused:** Items columns keep merging by current name and type (a rename can
  split or merge columns, and stale browser column keys are dropped by the existing reconciliation);
  Batch Add Items and both AI flows read the current names from the repository. No aliases and no
  migration were added.
- **i18n:** `categories.renameFieldPrompt` and the `FIELD_UPDATE_UNSUPPORTED_PROPERTY` error in English
  and Ukrainian.
- **Documentation:** new `docs/features/rename-custom-fields.md` and its index entry; updated
  `docs/HOW-TO.md`, `batch-add-fields.md`, `item-list-columns-and-sorting.md`, `api-error-codes.md`,
  `AGENTS.md`, and the 0.49.0 release-history entry. The task was tracked as a GitHub issue, so there
  was no `docs/issues/` file to remove.

## Verification

- `npm run lint` — passed.
- `npm test` — 247 tests: 246 passed, 1 skipped (shellcheck is not installed locally). New coverage:
  `test/custom-field-rename.test.js` (7 tests: rename with no values and with 25 items of text,
  number, date, and boolean values plus an item without values; unchanged item and template value
  rows; unchanged id, type, and category; trimming; not found, empty, too long, reserved, and
  case-insensitive duplicate names; refused `type`/`category_id`; the same name in another category;
  the database-constraint fallback; column split and merge; suggestions; Batch Add template and
  old-name refusal; create/delete after a rename; and the HTTP contract), plus an AI test in
  `test/ai-providers.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` (with `APP_VERSION=0.49.0`, because the working copy sits on the `v0.48.1` tag) —
  121 passed. `test/e2e/categories.spec.js` adds create field → item value → refused conflicting
  rename → rename → value preserved under the new label on Item details and in Edit Item.
