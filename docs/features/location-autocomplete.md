# Location autocomplete

## Summary

The **Location** field of the shared item form suggests the locations already in use in the
connected inventory, so common places such as `Garage` do not have to be retyped. The suggestions
come from Atlas itself, not from the browser's form history, so they look and work the same on
desktop browsers and on iPhone Safari. Location stays free text: a suggestion only fills the field.

## User-visible behaviour

- Focusing **Location** in Add Item, Edit Item, a duplicated or AI-drafted item, or a template form
  shows up to 10 locations in use, most used first and then alphabetically, even while the field is
  empty. Typing narrows them with a case-insensitive prefix match (`gar` → `Garage`), Cyrillic
  included (`гар` → `Гараж`).
- A suggestion is chosen by tap, click, or `ArrowDown`/`ArrowUp` and `Enter`. It sets the whole
  exact value and never submits the form. `Escape` closes the list, `Tab` leaves the field, and a tap
  elsewhere closes it, all keeping the typed text. `Enter` without a highlighted suggestion submits
  the form as before.
- Any new location can be typed and saved; it is suggested for the next item.
- Spellings that differ only in case or surrounding spaces are one suggestion, shown in the most
  used spelling. Empty locations are never offered.
- Only locations someone actually sees are offered: the Location of each active item that is not
  stored inside another item. A nested item is displayed at its outermost container's Location, so
  its own saved value is hidden and never suggested, and a container counts once however many items
  it holds. Retired items add nothing.
- On a phone whose keyboard leaves too little room below the field, the list opens above it and
  scrolls within the visible space. Options are at least 44 px tall on touch screens.
- If the request fails, Location behaves as a plain text field.

The Specific location, the translation button, and the detach/rehome choice that rewrites Location
programmatically are unchanged.

## Implementation overview

- `GET /api/items/location-suggestions?search=&limit=` returns `[{ "value": "Garage", "usage_count": 3 }]`.
  It needs `inventory:read`, like the item reads (Administrator, Viewer, and tokens with that scope);
  see [authentication and access](authentication-and-access.md).
- `ItemRepository.listRootLocations()` reads `TRIM(location)` with a count per exact spelling over
  active items with `parent_item_id IS NULL`, in one parameterless query. `ItemService.locationSuggestions`
  folds the case with `toLocaleLowerCase()` (SQLite's `NOCASE` and `LIKE` fold ASCII only), filters
  by prefix, picks the most used spelling of each group, sorts by usage and then `localeCompare`, and
  caps `limit` at 20 (default 10; anything that is not a number uses the default). The search text
  is only compared in JavaScript, so it never reaches SQL. The query reads one row per distinct
  top-level location, which stays small for a personal inventory.
- `client/src/components/ItemDraftFields.vue` renders Location with the shared
  `FieldAutocomplete.vue` (same `id="item-location"`, `v-model`, and placeholder). The combobox's
  touch selection, outside-tap closing, keyboard highlight, and viewport-aware placement are
  described in [custom-field autocomplete](custom-field-autocomplete.md); they also apply to
  Transferred To and text custom fields.
- No schema change and no new interface string.

## Verification

- `test/services.test.js` covers case and whitespace grouping, Cyrillic case folding, ordering,
  stale nested values, a container counted once, retired items, a box taken out of its container,
  wildcard and quote characters, and the limit bounds. `test/e2e.test.js` calls the endpoint over
  HTTP.
- `test/e2e/location-autocomplete.spec.js` covers the desktop flow (combobox attributes, suggestions
  on focus, filtering, deduplication, nested and retired items, keyboard and mouse selection without
  a submit, a new value saved and then suggested), a failing endpoint, and, with touch emulation at
  390 px, tap selection, a tap outside, 44 px options, and the list opening above the field in a
  short viewport.

## Notes and limitations

- Matching is prefix-based; there is no fuzzy search, and suggestions cannot be renamed or removed
  other than by editing the items.
- The list is positioned in CSS above or below the field; it is not moved out of its container, so
  a future parent with `overflow: hidden` would clip it.
