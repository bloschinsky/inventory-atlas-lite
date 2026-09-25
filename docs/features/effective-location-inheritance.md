# Effective location inheritance

## Summary

An item stored inside another item is displayed at the location of the container that holds it,
through as many nesting levels as there are. The inherited value is calculated on every read; the
item's own saved `location` is never modified and stays the value the form edits.

## User-visible behaviour

- The displayed location of a top-level item is its own **Location** text.
- The displayed location of a contained item is the **Location** of the outermost container of its
  chain. In `Camera → Camera Bag → Box`, all three are displayed at the location of `Box`, whatever
  `Camera` and `Camera Bag` have saved themselves.
- **Item details**, the items table, the narrow-screen line under the item name, and the phone cards
  all show the inherited location. Item details adds the note *Displayed location is inherited from
  the parent container.* below the value while the item sits in a container.
- The item form always loads and saves the item's own **Location**. The input is never disabled or
  cleared, and a hint under it repeats that the displayed location comes from the container while
  **Stored inside** is set.
- Taking an item out of its container immediately shows its own saved location again. Nothing is
  migrated or restored.
- Moving a container to another location immediately changes the displayed location of every item
  inside it, at any depth. No contained record is written.
- When no container in the chain has location text, the location is displayed as the usual `—`.
- The **Placement status** dashboard metrics are unchanged: they still classify items by their own
  saved location and their container link.

## Implementation overview

- No schema change and no stored value. `items.location` and `items.parent_item_id` keep their
  meaning; the effective location is derived in SQL on every read.
- `ItemRepository.search()` prefixes the list query with a recursive CTE that walks down from every
  top-level item and labels each row with its root container, then joins that root for its id, uuid,
  name, and location. The whole page is resolved by the same single statement, so the list makes two
  statements in total (the count and the page) at any nesting depth, plus one bulk statement for
  custom column values when the view requests them. The Location column sorts by this effective
  location.
- Walking downwards from the roots also means a row that somehow belongs to a cycle is simply never
  labelled, and the list still answers.
- `ItemRepository.findRoot(id)` resolves one item upwards through its parents with a depth guard and
  returns the top-most row, or the item itself when it is top-level.
- `ItemService` shapes both into the response fields `effective_location` (`null` when the resolved
  location is empty) and `effective_location_source` (`{ id, uuid, name }`, or `null` when the item
  provides its own location). `GET /api/items`, `GET /api/items/:id`, `POST /api/items`, and
  `PUT /api/items/:id` all carry them.
- Cycle protection in `ItemService.resolveParentId` is untouched, so an inheritance chain always
  terminates.
- UI: `client/src/pages/ItemDetails.vue` (value and note), `client/src/components/ItemResults.vue`
  (table cell and phone card line), and `client/src/pages/ItemForm.vue` (hints only; the field
  still edits the item's own location).

## Verification

- `test/services.test.js` covers the top-level case, single and multi-level inheritance, the
  untouched saved location, taking an item out of its container, moving the container, an empty
  chain, and the two-statement list query.
- `test/e2e.test.js` covers the same rules over HTTP, including that the SQLite row of a contained
  item keeps its own `location` after the container moves.
- `test/e2e/nesting.spec.js` covers the browser workflow: the inherited value and note on item
  details, the inherited value in the items list, and the own location returning after **Clear**.

## Notes and limitations

- Inheritance always resolves to the outermost container, never to the nearest container that
  happens to have location text.
- The items list cannot be searched or filtered by the effective location; only the displayed value
  is inherited.
- The dashboard placement metrics intentionally keep their previous meaning; see
  [Inventory Dashboard](dashboard.md).
- The related container behaviour is documented in [Nested items](nested-items.md).
