# Bulk Replace: choose a custom field through its category

- **Completed:** 2026-09-26
- **Version:** 0.39.1

## Summary

- The **Field** select of **Replace field value** no longer lists every text custom field of every
  category. It offers Condition, Location, Transferred To, and **Custom text field…**.
- **Custom text field…** reveals a **Category** select (only categories that have a text custom field)
  and a **Custom field** select with only that category's text fields, starting at the first one. The
  field select stays disabled, and nothing can be previewed, until a category is chosen.
- The core fields still apply to items of every category. The API is unchanged: the client builds both
  lists from `/api/items/bulk-replace/fields`.
- Interface strings: `bulkReplace.coreFields` and `bulkReplace.customFields` were replaced by
  `bulkReplace.customFieldChoice` and `bulkReplace.customField`, in English and Ukrainian.
- Documentation: `docs/HOW-TO.md`, `docs/features/bulk-replace-field-value.md`, and the release
  history.

## Verification

- `npm run lint` — passed.
- `npm test` — 166 tests: 165 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `npm run test:e2e` — 103 passed (run with `APP_VERSION=0.39.1`, as the uncommitted working copy
  still resolves its version from the `v0.39.0` tag). `test/e2e/bulk-replace.spec.js` now also checks
  that the custom field select is disabled before a category is chosen and lists only the chosen
  category's text fields, not its number field or another category's text field.
