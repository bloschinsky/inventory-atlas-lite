# Item list columns and sorting

## Summary

The **Items** list is a configurable view. A **Columns** control chooses which item fields are shown,
including custom fields merged across categories; the desktop table sorts from its column headers and
phones use a compact **Sort** control. Sorting, searching, filtering, and paging all happen on the
server before the page is cut, and the view choice is remembered in the browser.

## Behavior

- **Columns** lists the core columns in a fixed order — Photo, Name, Category, Condition, Location,
  Stored inside, Purchase Date, Purchase Price, Serial Number, Transferred To, Created, Updated —
  followed by the custom field columns in alphabetical order. **Name** is always checked and
  disabled. **Reset to default** restores Photo, Name, Category, Condition, Location, and Stored
  inside with the Name ascending sort. The menu closes on an outside click or Escape.
- The selection checkbox and the **View**/**Edit** actions are interface controls, not columns.
- **Merged custom columns.** Category fields whose trimmed, lower-cased names and types match form
  one column (`Brand` in Cameras and `brand` in Audio → one **Brand** column, named after the oldest
  field). The same name with different types stays separate, and the picker then adds the translated
  type in brackets, for example *Year (Number)* and *Year (Text)*.
- **Desktop table** (`lg` and wider): one cell per chosen column in the catalog order; a missing value
  is `—`; text is truncated with the full value in `title`; Location is the effective (inherited)
  location; Stored inside links to the container. Purchase Price uses the locale money formatter,
  Purchase Date and custom dates the date formatter, Created/Updated the date-time formatter, and
  yes/no fields show the translated Yes/No. Other custom values are shown exactly as stored.
- **Sorting.** Sortable headers are Tabler `table-sort` buttons and the header cell carries
  `aria-sort`. A new column sorts ascending; the active column toggles between ascending and
  descending. Photo and Stored inside are not sortable and have no sort button. Changing the sort
  returns to page 1.
- **Phone cards** (below `lg`): the name is the title; the thumbnail is shown only while Photo is
  chosen; the category is an unlabeled line; every other chosen column with a value is a
  `Label: value` line (empty values are omitted); Stored inside stays a link. The **Sort** select
  offers the sortable visible columns (plus the active one if it is hidden) and the arrow button
  beside it reverses the direction.
- The **Transferred to: …** badge under the name is shown only while the Transferred To column is
  hidden, so the value is never shown twice.
- **Search** is independent of the visible columns. It matches name, description, serial number,
  Transferred To, and every `text`-type custom field value; it combines with the category filter,
  the sort, and paging.

## API

- `GET /api/items/columns` → `{ "fields": [...] }`. A core entry has `key`, `type`, `sortable`,
  `searchable`, `visibleByDefault`, `core: true`, and `required: true` for `name`; its label is a
  translation (`items.fields.<key>`), never server text. A custom entry has
  `key: "custom:<type>:<encoded lower-case name>"`, `label` (the user's field name), `type`,
  `sortable: true`, `searchable` (`true` for text), `core: false`, and `fieldIds`.
- `GET /api/items` accepts `sort` (a column key), `direction` (`asc`|`desc`), and `fields` (a
  comma-separated list of custom column keys). Each listed item carries `custom_values`, an object
  keyed by the requested column keys that have a value; nothing else is loaded.
- Unknown `sort` keys fall back to the name, unknown `fields` keys are ignored, and a non-`desc`
  direction is ascending. No request value ever becomes SQL.

## Implementation overview

- `shared/itemColumns.js` defines the core columns, the default sort, and the custom column key, and
  is imported by both the server and the client.
- `server/src/services/itemColumns.js` (`buildItemColumns`) merges the custom fields into the catalog
  as a pure function. `ItemService.columns()` serves it; `ItemService.list()` resolves `sort` and
  `fields` against the catalog to known field ids only, and builds `custom_values` from one bulk
  query for the page.
- `ItemRepository.search()` selects the sort expression from the `CORE_SORT` whitelist or a fixed
  per-type custom wrapper whose field ids are bound as one JSON parameter. It orders by
  `(expression) IS NULL`, the expression, and `i.id`, so empty values stay last in both directions
  and pages are stable. Text sorts `COLLATE NOCASE`, numbers and purchase prices `CAST(... AS REAL)`
  (the amount only, whatever the currency), ISO dates and timestamps as text, and Location by the
  effective location. The text custom search is an `EXISTS` subquery inside the same count and page
  statements. `ItemRepository.listColumnValues()` loads the requested values for the page with
  `json_each` parameters.
- Client: `client/src/useTablePreferences.js` is a reusable browser-storage view state (visible keys,
  known keys, sort, direction) with `reconcile`, `reset`, and `toggleSort`;
  `client/src/components/TableColumnPicker.vue` and `client/src/components/SortableHeader.vue` are
  reusable table controls; `client/src/itemColumns.js` labels the columns and formats a cell's text;
  `ItemsList.vue` loads the catalog with the categories and requests only the visible custom
  columns; `ItemResults.vue` renders the table and the cards from the column list.
- Preferences are stored under `inventory-atlas.items.view` in `localStorage`. Once the catalog
  loads, keys that no longer exist are dropped, a default-visible column that the saved state has
  never offered is added, and an unknown sort returns to Name ascending. Blocked storage only loses
  the persistence.

## Verification

- `test/services.test.js` covers type-correct core sorting with empty values last in both
  directions, category sorting, hostile and unknown sort keys, merged and incompatible same-name
  fields, numeric and date custom sorting, requested-only custom values, text custom search, and
  search + category + sort + pagination together.
- `test/e2e.test.js` checks the columns endpoint and the `sort`/`fields` parameters over HTTP.
- `test/e2e/item-columns.spec.js` covers toggling columns, the locked Name column, persistence over
  a reload, Reset to default, a merged custom column with values from two categories, header sorting
  in both directions across two pages, the category filter with the sort, search by a hidden custom
  value, and phone cards with the compact sort control.

## Boundaries

Only one sort column at a time. There is no column reordering, resizing, saved named views, or
server-side preferences. Stored inside is not sortable, and Purchase Price compares amounts without
currency conversion. Number, date, and yes/no custom values are not part of the free-text search.
