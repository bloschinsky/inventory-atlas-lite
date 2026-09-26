# Bulk Replace Field Value

## Summary

**Data / Backup → Replace field value** replaces one exact saved value of one field with another on
every item that has it, for example `Location: Garage → KP Garage`. The user reviews a preview of the
affected items and confirms; the server then finds the matches again and writes them in one SQLite
transaction.

## User-visible behaviour

- Supported fields: **Condition**, **Location**, **Transferred To**, and every custom field of type
  `text`. Name, description, serial number, dates, prices, numbers, booleans, **Stored inside**, and
  **Category** are not offered.
- A custom field is one concrete field of one category, listed as `Field (Category)`. Same-name fields
  in other categories are never included, and the preview states the scope
  (*Only the Brand field of the Cameras category*).
- **Current value** and **New value** use the shared autocomplete control and list the distinct saved
  values of the selected field with their usage counts (`Garage 17`), most used first, filtered by a
  case-insensitive substring of the typed text.
- Matching is exact apart from surrounding whitespace and letter case (in any script, so `ГАРАЖ`
  matches `гараж`). A value is always replaced as a whole: `TP Garage`, `Big Garage`, and `KP Garage`
  never match `Garage`.
- **Preview changes** writes nothing. It shows the field, both values, the number of affected items,
  up to 100 affected items with category and saved value, and — when the new value is already used by
  other items — how many, together with how many items will additionally get it. With no match it
  shows an empty state and the replace button is disabled.
- **Replace in N items** is the explicit confirmation. Editing the field or either value discards the
  preview. The success message reports the count the server actually changed.
- The stored replacement is the entered text trimmed. Items that already hold the new value are not
  rewritten.
- Location replacement edits only the saved `items.location` of matching items. Contained items keep
  their own rows and follow the container through the existing
  [effective location inheritance](effective-location-inheritance.md).
- There is no undo, no substring or pattern replacement, and one field per operation.

## Implementation overview

- API, registered in `server/src/routes/itemRoutes.js` before `/api/items/:id`:
  - `GET /api/items/bulk-replace/fields` → `{ core: ['condition', 'location', 'transferredTo'], custom: [{ id, name, category_id, category_name }] }`;
  - `GET /api/items/bulk-replace/values/:type/:id?search=&limit=` → `[{ value, usage_count }]`, where
    `type` is `core` (then `id` is a core key) or `custom` (then `id` is a field id); `limit` defaults
    to 10 and is capped at 50;
  - `POST /api/items/bulk-replace/preview` with `{ field, from, to }` → `{ field, from, to, count, existingCount, items }`;
  - `POST /api/items/bulk-replace` with the same body → `{ updated }`.
  `field` is `{ "type": "core", "key": "location" }` or `{ "type": "custom", "fieldId": 42 }`.
- `server/src/services/bulkReplaceService.js` holds the rules: field resolution, request validation,
  normalization (`trim().toLowerCase()`), grouping of distinct values, matching, and the transaction
  of the apply step. Matching runs in JavaScript over the `(item_id, value)` pairs of the one field, so
  case folding also covers non-ASCII letters and no `LIKE` pattern is ever involved. The apply step
  reads and matches again inside its transaction; the preview count from the client is never sent or
  trusted.
- `server/src/repositories/bulkReplaceRepository.js` holds the SQL. Core keys map to columns through a
  fixed whitelist (`condition`, `location`, `transferred_to`); no column name comes from a request.
  Item ids travel as one JSON parameter. A custom replacement updates `item_field_values` and then
  `items.updated_at` of the changed items; a core replacement updates the column and `updated_at`.
- Refusals: `BULK_REPLACE_UNSUPPORTED_FIELD`, `FIELD_NOT_FOUND` (404) for an unknown custom field id,
  `BULK_REPLACE_TEXT_ONLY` for a non-text custom field, `BULK_REPLACE_SOURCE_REQUIRED`,
  `BULK_REPLACE_TARGET_REQUIRED`, `BULK_REPLACE_SAME_VALUE` when both values normalize to the same
  value, and the regular `TRANSFERRED_TO_TOO_LONG` limit for Transferred To.
- Client: `client/src/components/BulkReplaceValue.vue` is the card on `DataBackup.vue`.
  `FieldAutocomplete.vue` gained an optional `showCounts` prop for the usage-count badges.

## Verification

- `test/bulk-replace.test.js` covers exact Location replacement, case-insensitive and whitespace
  matching (including Cyrillic), untouched substring values, untouched records that already hold the
  target, an existing target value, Condition, Transferred To, one text custom field, same-name fields
  in different categories, rejection of unsupported and non-text fields and invalid values, a preview
  that writes nothing, re-evaluation on apply, rollback when a write fails, effective location
  inheritance after replacing a container's Location, and value discovery.
- `test/e2e/bulk-replace.spec.js` covers the browser workflow: choosing a counted value, the preview
  with its warning and affected items, confirmation, the saved and inherited results, the custom-field
  scope, and the disabled action for a value no item has.
