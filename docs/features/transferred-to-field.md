# Transferred To field

## Summary

Every item has an optional **Transferred To** base property, independent of its category, for noting
who or where the item went when it was lent, given away, sold, or otherwise transferred
(`Vasyl`, `Father`, `Sold via OLX`, `Workshop`). An empty value means no transfer is recorded. The
field is informational only: it has no states, no history, and no effect on any other property.

## Data and API

- `items.transferred_to` is a nullable `TEXT` column. Existing databases receive it through the
  additive startup migration in `server/src/db.js`, so existing items read as `null` and no other
  data is touched. It is part of `CURRENT_SCHEMA`, so a restored older backup is migrated the same
  way, and SQLite backups carry it automatically.
- `POST /api/items` and `PUT /api/items/:id` accept `transferred_to`. The value is trimmed; an empty
  or whitespace-only value, `null`, or an omitted value is stored as `NULL`. Values longer than 255
  characters, the limit of the other short base fields, and non-string values are rejected with a
  `400` `{ "error": { "code", "params" } }` response. The rule lives in `validateTransferredTo`, which shares its
  implementation with the serial-number rule in `server/src/services/itemValidation.js`.
- Saving the field never changes `location`, `parent_item_id`, or any other column.
- Item detail responses and the item list rows include `transferred_to`.
- The normal item search (`GET /api/items?search=`) matches `transferred_to` in addition to the
  name, description, and serial number.
- `GET /api/items/transferred-to-suggestions?search=&limit=` returns
  `[{ "value": "Vasyl", "usage_count": 3 }]`: distinct non-empty saved values grouped by
  `TRIM(transferred_to) COLLATE NOCASE`, filtered by a case-insensitive prefix, ordered by usage and
  then alphabetically. `limit` defaults to `10` and is capped at `20`. User wildcards are escaped.
  `ItemService.transferredToSuggestions` serves it over `ItemRepository.listTransferredToSuggestions`.
- AI Add Item does not ask the model for the field; an AI draft leaves it empty, so the saved item
  stores `NULL` unless the user fills it in during review.

## User interface

- The item form has a **Transferred To** input under Condition and Location. It uses the shared
  `FieldAutocomplete` combobox with the suggestions endpoint above, so previously used values are
  offered on focus and while typing, but any new text can be saved and the field can be cleared.
- When the value is set, the item page shows a `Transferred to: <value>` badge under the item name,
  and the Items list shows the same badge under the name in the desktop table and in the mobile
  cards. The badge uses Tabler's informational `bg-azure-lt` style, wraps long values, and is not
  rendered at all when the field is empty.
- The Items search placeholder reads *Search name, description, serial number or transferred to…*.

## Boundaries

There is no transfer history, no loan/gift/sale type or workflow state, no due date, and no dedicated
list filter; the regular search covers finding items by recipient.

## Verification

- `test/services.test.js` covers create with and without the field, null → value → another value →
  null, whitespace clearing, validation, location preservation, search, and suggestion grouping,
  prefix matching, wildcard escaping, and the limit.
- `test/e2e.test.js` covers migration of a legacy database, the HTTP create/update/clear flow,
  search, the suggestions endpoint, backup contents, and persistence across a restart.
- `test/restore.test.js` verifies that a restored backup keeps the value.
- `test/e2e/items.spec.js` covers the browser workflow: set the field, see the badge on the item
  page and in the list, get the value suggested on another item, clear it, and see the badge
  disappear.
