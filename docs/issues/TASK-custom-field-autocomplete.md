# CODEX TASK — Add Autocomplete for Text Custom Fields

## Goal

Improve text custom fields in **Inventory Atlas Lite** by suggesting values that already exist for the same custom field.

Example:

- existing camera items have `Brand = Pentax` and `Brand = Olympus`;
- the user creates another camera and focuses the `Brand` field;
- the UI suggests `Pentax` and `Olympus`;
- typing `Pe` narrows the suggestions to `Pentax`;
- the user may still type and save a completely new value such as `Canon`.

The control must remain a free-text input. Suggestions should speed up repeated data entry, not restrict which values may be saved.

---

## Scope

Implement autocomplete only for custom fields with `type = text`.

Do not change the behaviour of:

- number fields;
- date fields;
- boolean fields;
- core item fields.

Do not introduce a separate brands table, options table, global dictionary, or administration page for suggestion values.

Suggestions must be derived directly from existing non-empty values in `item_field_values` for the selected `field_id`.

---

## Expected behaviour

For each text custom field in the Add/Edit Item form:

1. Keep a normal editable text input.
2. When the input receives focus, show a limited list of the most frequently used existing values for that exact field.
3. When the user types, filter suggestions using a case-insensitive prefix search.
4. Selecting a suggestion places it into the input.
5. The user may ignore the suggestions and enter any new value.
6. A newly saved value must automatically become available in future suggestions without additional administration.
7. Empty and whitespace-only values must never appear.
8. Duplicate values that differ only by case or surrounding whitespace should appear as one suggestion where practical.

Suggestions belong to the exact custom field, not merely to fields with the same name.

For example, `Brand` in the `Cameras` category and `Brand` in the `Lenses` category are separate fields with separate suggestion sets because they have different field IDs.

---

## API

Add a small REST endpoint consistent with the existing API, for example:

```text
GET /api/fields/:id/suggestions?search=Pe&limit=10
```

### Query parameters

- `search` — optional text prefix; an empty value returns the most frequently used suggestions;
- `limit` — optional result limit; default `10`, maximum `20`.

### Response

Return a small JSON array:

```json
[
  {
    "value": "Pentax",
    "usage_count": 7
  }
]
```

### Server requirements

- Return `404` if the custom field does not exist.
- Return `400` if the endpoint is requested for a non-text custom field.
- Trim and validate query parameters.
- Escape SQL wildcard characters supplied by the user.
- Use parameterized SQL only.
- Use case-insensitive prefix matching.
- Exclude `NULL`, empty, and whitespace-only values.
- Deduplicate suggestions case-insensitively.
- Sort first by usage count descending, then alphabetically.
- Never return more than the allowed maximum.

A query conceptually similar to the following is acceptable; adjust it for correct SQLite behaviour and safe parameters:

```sql
SELECT
  MIN(TRIM(value)) AS value,
  COUNT(*) AS usage_count
FROM item_field_values
WHERE field_id = ?
  AND value IS NOT NULL
  AND TRIM(value) != ''
  AND TRIM(value) LIKE ? ESCAPE '\'
GROUP BY TRIM(value) COLLATE NOCASE
ORDER BY usage_count DESC, value COLLATE NOCASE
LIMIT ?;
```

Add an index beginning with `field_id` if it materially helps this query and is not already covered by an appropriate existing index. Do not add speculative indexes unrelated to this feature.

---

## Frontend

Create or reuse a small Vue autocomplete component for text custom fields.

The component should:

- behave as a normal free-text input;
- request suggestions when focused;
- request filtered suggestions after the value changes;
- use a debounce of approximately `150–250 ms`;
- show at most 10 suggestions by default;
- ignore or cancel stale responses so older searches cannot overwrite newer results;
- close the list after selection;
- close the list when focus moves outside the component;
- work with mouse, touch, and keyboard;
- preserve the existing Bootstrap visual style;
- show no dropdown when there are no matching suggestions;
- avoid showing the current input value as a redundant suggestion when it matches exactly.

### Keyboard behaviour

Support at least:

- `ArrowDown` and `ArrowUp` to move through suggestions;
- `Enter` to select the highlighted suggestion;
- `Escape` to close the suggestions;
- `Tab` to leave the field normally without forcing a selection.

Use appropriate accessible combobox/listbox attributes where practical. The input must remain usable if the suggestion request fails.

Do not add a large UI component library solely for this feature. Bootstrap does not need to be replaced.

---

## Add/Edit Item integration

Replace only the plain inputs generated for text custom fields with the autocomplete component.

Existing form behaviour must remain intact:

- changing a category still loads the correct fields;
- existing values appear correctly when editing an item;
- selecting a suggestion updates `field_values[field.id]`;
- manually entered values are submitted unchanged except for the project's existing normalization rules;
- validation for other field types remains unchanged;
- item creation and editing must still work when the suggestions endpoint is unavailable.

Do not enable autocomplete for the item name, description, condition, or location as part of this task.

---

## Error and loading behaviour

- Do not block or disable the input while suggestions load.
- A failed suggestion request should silently leave the user with a normal text input.
- Do not show a page-level error for autocomplete failure.
- Avoid a visible loading spinner unless the request is noticeably slow; this is a lightweight helper, not a primary operation.
- Do not save suggestions separately in the browser.

---

## Tests

Add or extend tests to cover at least:

1. suggestions are returned only for the requested text field;
2. values from a different field are not returned, even if that field has the same name;
3. empty and whitespace-only values are excluded;
4. matching is case-insensitive;
5. prefix filtering works (`Pe` returns `Pentax`);
6. duplicates with different case are grouped where practical;
7. results are ordered by usage count and then alphabetically;
8. the default and maximum limits are enforced;
9. an unknown field returns `404`;
10. a non-text field returns `400`;
11. selecting a suggestion updates the form value;
12. a completely new manually entered value can still be saved;
13. the new saved value appears in later suggestions;
14. existing Add/Edit Item behaviour and tests continue to pass.

---

## Non-goals

Do not add:

- mandatory predefined options;
- a separate value dictionary or reference-data table;
- global suggestions shared across different custom field IDs;
- fuzzy search, typo correction, or full-text search;
- suggestion administration or manual deletion;
- automatic rewriting of existing saved values;
- autocomplete for non-text custom fields;
- external APIs or third-party autocomplete services;
- a large select/combobox dependency.

---

## Acceptance criteria

The feature is complete when:

1. focusing a text custom field shows existing values for that field;
2. typing filters the values case-insensitively;
3. a suggestion can be selected with mouse, touch, or keyboard;
4. the user can still type and save a new arbitrary value;
5. the newly saved value is suggested when creating or editing another item with the same field;
6. suggestions never leak between different custom field IDs;
7. number, date, and boolean fields retain their current controls;
8. autocomplete failure does not prevent item editing or creation;
9. all existing and newly added tests pass.

## Main priority

Keep this a lightweight data-entry improvement. Reuse existing field values, preserve free-text input, and avoid turning the feature into a managed dictionary or reference-data subsystem.
