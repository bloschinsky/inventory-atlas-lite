# Custom-field autocomplete

## Summary

Text custom fields suggest values that were already saved for the same field, so repeated data entry
(`Brand = Pentax`, `Brand = Olympus`) does not have to be retyped. The control stays a free-text
input: suggestions speed up typing, they do not restrict what can be saved.

## User-visible behaviour

- Focusing a text custom field in the Add/Edit item form shows up to 10 existing values for that
  field, most frequently used first.
- Typing filters the list with a case-insensitive prefix match (`Pe` → `Pentax`).
- A suggestion can be chosen with the mouse, touch, or the keyboard: `ArrowDown`/`ArrowUp` move,
  `Enter` selects, `Escape` closes, `Tab` leaves the field without forcing a selection.
- Any new value can still be typed and saved, and it becomes a suggestion for the next item
  automatically.
- Suggestions belong to one exact custom field. `Brand` in `Cameras` and `Brand` in `Lenses` are
  different fields and never share values.
- Empty and whitespace-only values are never suggested, and values differing only in case or
  surrounding whitespace appear once.
- Number, date, and boolean fields keep their normal controls.
- If the suggestion request fails, the field silently behaves as a plain text input; creating and
  editing items is unaffected.

## Implementation overview

- `GET /api/fields/:id/suggestions?search=&limit=` is served by `CustomFieldService` over
  `CustomFieldRepository`, which groups non-empty
  `item_field_values` by `TRIM(value) COLLATE NOCASE` for that `field_id`, orders by usage count and
  then alphabetically, and returns `[{ "value": "Pentax", "usage_count": 7 }]`. `limit` defaults to
  `10` and is capped at `20`. The endpoint returns `404` for an unknown field and `400` for a
  non-text field. All SQL is parameterized and user wildcards are escaped with `ESCAPE '\'`.
- The existing `idx_field_values_field` index on `item_field_values(field_id, value)` covers the
  query; no additional index was added.
- `client/src/components/FieldAutocomplete.vue` is a small Bootstrap-styled combobox used for text
  custom fields in `client/src/pages/ItemForm.vue`. Its `source` prop is the suggestions endpoint, so
  the same control also serves the [Transferred To field](transferred-to-field.md), and other input
  attributes such as `maxlength` are passed to the input. It loads on focus, debounces input by
  200 ms, discards stale responses through a request counter, hides a suggestion identical to the
  current input, and closes on selection or when focus leaves the component.

## Verification

- `test/e2e.test.js` covers field isolation, exclusion of empty values, case-insensitive prefix
  matching, case-insensitive grouping, ordering, the default and maximum limits, and the `404`/`400`
  responses.
- `test/e2e/suggestions.spec.js` covers the browser workflow: suggestions appear on focus, filter
  while typing, can be selected, and a newly saved value is suggested afterwards.

## Notes and limitations

- Suggestions are derived from saved values only. There is no dictionary table, no administration
  page, and no way to delete or rename a suggestion other than changing the saved item values.
- Matching is prefix-based; there is no fuzzy search or typo correction.
- Autocomplete is not enabled for the item name, description, condition, or location. Transferred
  To has its own suggestions over the saved values of that base field.
