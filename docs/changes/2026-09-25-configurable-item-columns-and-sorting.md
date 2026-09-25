# Configurable item columns and sorting

- **Completed:** 2026-09-25
- **Version:** 0.35.0

## Summary

- The Items list has a **Columns** control (Tabler dropdown with checkboxes and **Reset to default**)
  covering Photo, Name (always shown), Category, Condition, Location, Stored inside, Purchase Date,
  Purchase Price, Serial Number, Transferred To, Created, Updated, and custom fields. The choice,
  the sort column, and the direction are stored in `localStorage` under
  `inventory-atlas.items.view` and reconciled with the current columns on load.
- The old **Sort by** and **Direction** selects are gone. The desktop table sorts from Tabler
  `table-sort` header buttons with `aria-sort`; phones get a compact **Sort** select plus a direction
  button. Cards render the chosen columns as labeled lines.
- Custom fields with the same name (ignoring case) and type across categories merge into one logical
  column keyed `custom:<type>:<encoded name>`; same-name fields of different types stay separate and
  are disambiguated with their type in the picker.
- New `GET /api/items/columns`. `GET /api/items` accepts `fields=<custom keys>` and returns
  `custom_values` for those columns only, loaded with one bulk query per page. `sort` accepts every
  sortable core key and custom keys, resolved only through the `CORE_SORT` whitelist or to known
  field ids bound as a JSON parameter. Empty values sort last in both directions, with `i.id` as the
  stable tie-breaker; numbers, prices, and dates sort by type.
- Search additionally matches text custom field values through an `EXISTS` subquery, independent of
  the visible columns.
- New reusable client pieces: `useTablePreferences.js`, `TableColumnPicker.vue`,
  `SortableHeader.vue`; `itemColumns.js` holds labels and cell formatting. Shared core column
  definitions live in `shared/itemColumns.js`; the server catalog in `server/src/services/itemColumns.js`.
- Documentation: new `docs/features/item-list-columns-and-sorting.md` and index entry; updates to
  `docs/HOW-TO.md`, `application-ui.md`, `purchase-and-serial-fields.md`, `transferred-to-field.md`,
  `nested-items.md`, `effective-location-inheritance.md`, `AGENTS.md`, `docs/ROADMAP.md`, and the
  release history. The completed task file was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 138 passed, 1 skipped (shellcheck is not installed locally), including new service
  tests for core and custom sorting, merged and incompatible fields, requested-only values, hostile
  sort keys, and custom-value search, plus the columns endpoint check in `test/e2e.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 89 passed, including the new `test/e2e/item-columns.spec.js` (column picker,
  locked Name, reload persistence, reset, merged column values, header sorting across pages with the
  category filter, search by a hidden custom value, phone cards and the compact sort). The label
  printing and Ukrainian interface specs were updated for the removed sort selects, and the search
  placeholder text was updated across specs.
