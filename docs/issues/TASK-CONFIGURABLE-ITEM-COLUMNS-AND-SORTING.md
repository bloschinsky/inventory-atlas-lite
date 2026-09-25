# TASK: Configurable Item Columns, Sorting, and Custom Field Views

## Goal

Upgrade the Items list into a configurable data view where the user can choose which item fields are visible, sort directly from the table header, and use the same field selection on mobile cards.

Implement this as a reusable table/view configuration mechanism so the same approach can later be reused by other major tables.

---

## Phase 1 — Core Fields, Column Picker, Sorting, Mobile View

### 1. Column picker

Add a `Columns` control to the Items list toolbar/header.

Use a Tabler-compatible dropdown/popover with checkboxes for available core item fields.

Core fields should include at least:

- Photo
- Name
- Category
- Condition
- Location
- Stored Inside
- Purchase Date
- Purchase Price
- Serial Number
- Transferred To
- Created
- Updated

Rules:

- `Name` must always remain visible and cannot be disabled.
- Selection checkbox column and `Actions` are UI columns and are not managed as normal item fields.
- Existing default view should remain approximately:
  - Photo
  - Name
  - Category
  - Condition
  - Location
  - Stored Inside
- Add `Reset to default`.
- Store the selected visible fields in `localStorage`.
- No database/user-preference storage is required.
- Preferences must survive page reloads.

Create reusable frontend abstractions where reasonable, e.g.:

- `TableColumnPicker.vue`
- `useTablePreferences.js`
- reusable sortable header logic

Do not introduce a heavy table library.

---

### 2. Dynamic desktop table rendering

Refactor `ItemResults.vue` so desktop table columns are generated from the selected field configuration instead of being hardcoded.

Requirements:

- Keep current item selection behavior.
- Keep `View` and `Edit` actions.
- Preserve item links.
- Preserve thumbnail behavior.
- Preserve transferred badge behavior where applicable.
- Preserve effective location behavior for nested items.
- Missing values should render consistently as `—`.
- Long values should use existing truncation/title behavior where appropriate.

The selected column order should match the order defined by the application configuration.

---

### 3. Header-based sorting

Remove the current desktop `Sort by` and `Direction` selects from the Items filter block.

Make sortable data column headers clickable.

Behavior:

- First click: ascending.
- Second click: descending.
- Further clicks toggle asc/desc.
- Only one primary sort field is active at a time.
- Show a clear visual indicator on the active sorted column.
- Non-sortable UI columns such as Photo/Actions/selection must not pretend to be sortable.

Sorting must remain server-side.

The API must continue receiving a controlled sort identifier plus `direction=asc|desc`.

Do not sort only the current page in the browser.

Extend the backend sort whitelist instead of interpolating arbitrary SQL from request parameters.

Core fields that should support sorting where meaningful:

- Name
- Category
- Condition
- Location / effective location where practical
- Purchase Date
- Purchase Price
- Serial Number
- Transferred To
- Created
- Updated

For nullable values, keep empty/null values at the end where practical.

Use type-correct sorting:

- numeric values as numbers
- dates as dates
- text case-insensitively
- purchase price by numeric amount

---

### 4. Mobile card rendering

The same visible field configuration must also affect mobile cards.

Do not attempt to reproduce desktop columns on mobile.

Instead:

- Keep Name as the primary card title.
- Keep Photo if enabled.
- Render other selected fields as compact labeled metadata rows.
- Do not render disabled fields.
- Preserve item actions and selection controls.
- Preserve nested-item links where relevant.

Example:

```text
GeForce TNT2
Computer Equipment
Brand: ASUS
Serial Number: 12345XYZ
Purchase Price: USD 45
Location: Office
```

Add a compact mobile sort control, for example:

```text
Sort: Brand ↑
```

The mobile sort selector should preferably offer sortable fields that are currently visible.

---

### 5. Search/filter toolbar cleanup

After moving sorting into table headers/mobile sort control, simplify the filter area.

Keep:

- Search
- Category
- Columns

Remove the old desktop `Sort by` and `Direction` selects.

Existing pagination/filter behavior must remain intact.

---

## Phase 2 — Merged Custom Fields

### 6. Custom fields in the column picker

Extend the available column list with custom fields.

Custom fields with the same logical name across multiple categories should appear as one visible column.

Example:

```text
Computer Equipment -> Brand
Cameras -> Brand
Audio Equipment -> Brand
```

should produce one:

```text
Brand
```

column.

Internally this logical column may map to multiple concrete `custom_fields.id` values.

Do not merge incompatible field definitions blindly.

At minimum, merge only when:

- normalized names match
- field types are compatible

Text-like field types may be treated as compatible if the application already treats their values equivalently.

If two same-name fields have incompatible types, keep them distinct or otherwise disambiguate safely.

---

### 7. Available-columns metadata endpoint

Add an API endpoint for the Items view metadata, for example:

```http
GET /api/items/columns
```

Return a normalized definition of:

- core fields
- merged custom fields
- display label
- stable field key
- data type
- sortable flag
- searchable flag if relevant

Example concept:

```json
{
  "fields": [
    {
      "key": "name",
      "label": "Name",
      "type": "text",
      "sortable": true,
      "core": true
    },
    {
      "key": "custom:brand",
      "label": "Brand",
      "type": "text",
      "sortable": true,
      "core": false,
      "fieldIds": [12, 37, 81]
    }
  ]
}
```

Exact response shape may differ, but use stable identifiers.

Do not use raw field names as SQL fragments.

---

### 8. Fetch only needed custom values

Do not automatically attach every custom field value for every item in the list response.

Allow the Items request to specify which custom fields are needed for the current view, for example:

```http
GET /api/items?fields=custom:brand,custom:model
```

The server should return values only for requested custom columns.

Avoid N+1 queries.

Prefer a single query, controlled joins/subqueries, or a small fixed number of bulk queries.

The list must remain efficient when the database contains many custom fields.

---

### 9. Server-side sorting by merged custom fields

Support sorting by selected custom fields.

Example:

```http
GET /api/items?sort=custom:brand&direction=asc
```

Requirements:

- Resolve the stable logical field key server-side.
- Map it only to known custom field IDs.
- Never directly inject request values into SQL.
- Sorting must cover the complete filtered result set before pagination.
- Use type-appropriate sorting.
- Keep null/empty values at the end where practical.
- Add deterministic fallback ordering by item ID.

---

### 10. Global search improvements

Keep global Search independent from visible fields.

The user must be able to find an item by a field even when that field is not currently displayed.

Extend search to relevant custom fields.

At minimum include:

- item name
- description
- serial number
- transferred to
- searchable text-like custom field values

Avoid N+1 queries.

Search must still combine correctly with:

- category filter
- sorting
- pagination

---

## Backend architecture

Keep current service/repository separation.

Relevant existing areas include:

- `server/src/routes/itemRoutes.js`
- `server/src/services/itemService.js`
- `server/src/repositories/itemRepository.js`
- `server/src/repositories/customFieldRepository.js`

Use the existing sort whitelist pattern as the basis for safe dynamic sorting.

Do not allow request parameters to become raw SQL identifiers or fragments.

Keep implementation aligned with existing OOP/SOLID project rules.

---

## Frontend architecture

Relevant existing areas include:

- `client/src/pages/ItemsList.vue`
- `client/src/components/ItemResults.vue`

Prefer configuration-driven rendering rather than adding more hardcoded `v-if` columns.

A column definition should conceptually contain information such as:

```js
{
  key,
  label,
  type,
  sortable,
  visibleByDefault
}
```

Use shared formatting helpers for values such as:

- purchase price
- dates
- empty values
- linked parent items

---

## Persistence

Store Items view preferences in browser storage.

Suggested key:

```text
inventory-atlas.items.view
```

Persist at least:

- visible field keys
- active sort key
- sort direction

Handle stale preferences safely:

- ignore fields that no longer exist
- preserve newly added default/core fields according to application rules
- `Reset to default` restores the built-in configuration

---

## Performance requirements

The implementation must remain responsive with:

- thousands of items
- many categories
- many custom fields

Avoid:

- loading all custom fields for all rows
- N+1 field queries
- client-side sorting of paginated data
- client-side filtering of only the current page

All search/sort/filter operations must apply before pagination on the server.

---

## Tests

Add/update automated tests for at least:

### Backend

- core field sorting ascending/descending
- custom field sorting
- numeric custom field sorting
- date sorting
- null/empty values
- category + search + sort combination
- merged same-name custom fields
- incompatible same-name custom fields
- requested custom values only
- invalid/unknown sort keys are handled safely
- search matches custom field values

### Frontend / E2E

- column picker toggles fields
- Name cannot be hidden
- Reset to default works
- preferences survive reload
- desktop header sorting changes direction
- mobile cards reflect selected fields
- mobile sorting works
- custom field column displays values from multiple categories
- pagination remains correct after sorting/filtering

Run existing lint, unit tests, and E2E tests.

---

## Acceptance Criteria

The task is complete when:

1. User can choose visible Items fields from a `Columns` control.
2. The choice persists across reloads.
3. Desktop table renders selected fields dynamically.
4. Mobile cards render the same selected data as metadata.
5. Desktop sorting is performed from column headers.
6. Mobile has an equivalent compact sorting control.
7. Old `Sort by` / `Direction` controls are removed from the desktop filter block.
8. Core item fields can be displayed and sorted where meaningful.
9. Same-name compatible custom fields across categories appear as one logical column.
10. Custom field sorting is server-side and type-aware.
11. Global search includes relevant custom field values regardless of visible columns.
12. Custom field values are loaded efficiently without N+1 queries.
13. Pagination remains correct.
14. Existing item selection, links, nested-location behavior, actions, and current features continue to work.
15. No arbitrary SQL can be injected through dynamic field/sort parameters.
16. Existing tests pass and new behavior is covered by automated tests.

---

## Out of Scope

Do not add in this task:

- multi-column sorting
- drag-and-drop column reordering
- saved named views/presets
- per-user server-side preferences
- column resizing
- spreadsheet-style inline editing
- new third-party data-grid libraries
