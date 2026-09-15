# Custom field autocomplete

- Completed: 2026-09-15
- Version: 0.4.0

## Summary

Text custom fields in the Add/Edit Item form now suggest the values already saved for that exact field, so repeated data entry is faster. The control stays a free-text input: any new value can still be typed, saved, and is then offered as a suggestion for the next item.

## Implemented changes

- Added `GET /api/fields/:id/suggestions`, which returns the existing non-empty values of one text custom field with their usage counts. It accepts an optional `search` prefix and an optional `limit` (default `10`, maximum `20`), responds with `404` for an unknown field and `400` for a non-text field, trims its parameters, escapes user-supplied SQL wildcards, and uses parameterized case-insensitive matching only.
- Grouped suggestions by the trimmed value with `COLLATE NOCASE` so values differing only by case or surrounding whitespace collapse into one entry, ordered by usage count and then alphabetically.
- Added the `idx_field_values_field` index on `item_field_values(field_id, value)` to back that lookup. It is created with `IF NOT EXISTS` on every start, so existing databases pick it up in place.
- Added `client/src/components/FieldAutocomplete.vue`, a small Bootstrap-styled combobox that requests suggestions on focus, refreshes them with a 200 ms debounce while typing, ignores stale responses, and supports mouse, touch, and the `ArrowDown`, `ArrowUp`, `Enter`, `Escape`, and `Tab` keys. It falls back silently to a plain text input when the request fails.
- Used the component for text custom fields in `ItemForm.vue` only. Number, date, and boolean fields, the core item fields, and the parent item search keep their current controls.
- Raised the version to `0.4.0` because this is a new user-facing feature.

## Verification

- `npm run lint` — passed.
- `npm test` — passed, including the new API test covering field isolation between two `Brand` fields, whitespace and empty exclusion, case-insensitive prefix matching, case-insensitive grouping, ordering, wildcard escaping, the default and maximum limits, and the `404` and `400` responses.
- `npm run build` — passed.
- `npm run test:e2e` — passed, 8 Playwright tests in Chromium, including the new `suggestions.spec.js` covering focus suggestions, typed filtering, keyboard and mouse selection, saving a brand-new value, and seeing that value suggested for the next item.
