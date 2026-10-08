# Nested items

## Summary

An item can be stored inside another item, so a box, case, or drawer that is itself an inventory
record can hold other records. The hierarchy answers "what is in this box?" without adding a
separate container, room, or shelf entity.

## User-visible behaviour

- **Add/Edit item** has an optional **Stored inside** field. It searches existing items by name and
  shows the selected parent as a badge that can be cleared, which returns the item to the top level.
- The selector never offers the edited item itself or anything already stored inside it.
- **Item details** shows `Stored inside` with a link to the parent, and a **Contents** section
  listing the direct children with their thumbnails and links.
- **Audit contents** in that **Contents** section starts a Verification run of the container's direct
  contents or, when the contents are nested deeper, optionally of all nested contents, collected on the
  server from the current hierarchy. The run is a snapshot, the container keeps a compact **Recent
  audits** list, and completing an audit never changes `parent_item_id`, `location`, or the effective
  location of any item. See [Checklists](checklists.md#container-audits).
- The **Items** list shows the direct container in a `Stored inside` column that links to it, and as
  a `Stored inside:` line on phone cards, while that column is chosen (it is by default). Only the
  direct parent is shown; the list is not a tree.
- Nesting has no depth limit, and an item has at most one direct parent.
- The plain-text `Location` field keeps describing where the physical object is, while
  `Stored inside` describes which other record holds it. A contained item is displayed at the
  location of its outermost container; its own saved `Location` is untouched and still editable. See
  [Effective location inheritance](effective-location-inheritance.md).
- An item that still contains other items cannot be deleted; its contents must be moved or deleted
  first. Its audits never block deletion; they stay readable under the container's name snapshot.
- Changing the parent never affects the category, custom field values, or photos.

### Bulk move

- The **Items** list selection (the same one used for QR labels) can be moved into one container at
  once with **Move to…** in the selection bar. The selection is explicit: row and card checkboxes,
  the table header checkbox, and on phones **Select all items on this page**; the page-wide controls
  cover only the items of the current page. The selection is kept while paging, searching,
  filtering, and sorting, and nothing outside it is ever selected implicitly.
- The **Move selected items** dialog searches destination items by name and shows each candidate's
  category and direct container to tell equal names apart. It never offers a selected item or
  anything stored inside the selection. Choosing a destination shows the confirmation
  *Move the selected items into "<name>"?*; **Move** applies it.
- **Selection roots.** A selection root is a selected item that has no selected ancestor. Only the
  roots are placed inside the destination; every other selected item stays inside its selected
  container, so the existing nested structure is preserved and never flattened. Selecting `Box A` and
  the `Camera` inside it and moving them to `Box B` yields `Box B → Box A → Camera`: only `Box A`
  gets a new parent. When the selection nests, the dialog says how many top-level selected groups
  will be moved and that nested selected items stay inside their selected parent containers.
- The move is atomic. The destination must exist and must be neither a selection root nor inside
  one; an unknown or since-deleted selected item, or such a destination, rejects the whole request
  and nothing moves. The dialog stays open with the error, and the selection is kept.
- Roots that are already directly inside the destination are reported as unchanged and not written;
  when all of them are, the notice says that nothing changed.
- After a successful move the selection is cleared, a notice says how many selected items are now
  inside the destination, and the list is loaded again, so **Stored inside** and the inherited
  **Location** are current without a page reload. Item details, **Contents**, and the Hierarchy tree
  and graph show the new structure the next time they load.
- Only `parent_item_id` and `updated_at` of each moved root change. Saved `location` values, names,
  categories, other attributes, custom field values, photos, and every descendant row stay exactly as
  they were; the displayed location changes only through
  [effective location inheritance](effective-location-inheritance.md).

### Retired items

A container and its contents always share one lifecycle status: retiring a leaf takes it out of its
container, retiring a container either retires its whole subtree or nothing, an active item can never
be stored in a retired container, and **Move to…** refuses retired items. See
[Item lifecycle](item-lifecycle.md).

## Implementation overview

- `items.parent_item_id` is a nullable self-reference with `ON DELETE RESTRICT`, indexed by
  `idx_items_parent`. Databases created before the feature receive the column through an in-place
  `ALTER TABLE` in `server/src/db.js`, so existing data stays valid with `parent_item_id = NULL`.
- `POST /api/items` and `PUT /api/items/:id` accept `parent_item_id` (an item ID or `null`).
  `ItemService.resolveParentId` rejects an unknown parent (`PARENT_ITEM_NOT_FOUND`) and passes the
  rest to `ItemService.assertCanContain`, the single containment rule shared with the bulk move: a
  parent that is one of the moved items is `ITEM_CANNOT_CONTAIN_ITSELF`, and a parent whose container
  chain (`ItemRepository.listAncestorIds`, a recursive CTE) reaches a moved item is
  `ITEM_PARENT_CYCLE`, so indirect cycles such as `A → B → C → A` are refused with HTTP `400`.
- `GET /api/items` joins the parent row and returns `parent_id` and `parent_name` for each listed
  item, so the list needs no extra request per row.
- `GET /api/items/:id` returns `parent_item_id`, a `parent` summary (`id`, `uuid`, `name`), and
  `children` summaries (`id`, `uuid`, `name`, category name, condition grade, thumbnail ID). The full
  descendant tree is never expanded in a response.
- `GET /api/items/parent-candidates?search=&excludeId=` returns at most 20 lightweight candidates,
  each with its direct container's name, with the excluded item and its descendants
  (`ItemRepository.listSubtreeIds`) filtered out.
- `POST /api/items/bulk-parent/preview` takes `{ item_ids, search }` and answers
  `{ selected_count, root_count, candidates }`, the candidates excluding every selected subtree; it
  never writes. `PATCH /api/items/bulk-parent` takes `{ item_ids, parent_item_id }` and answers
  `{ selected_count, root_count, moved_count, unchanged_count, parent: { id, uuid, name }, moved_root_ids }`.
- `item_ids` accepts numeric IDs or UUIDs (the client sends the selection's UUIDs) and is
  de-duplicated. Both routes run `ItemService.resolveSelection` (`BULK_MOVE_NO_ITEMS`,
  `BULK_MOVE_INVALID_ITEMS`, and `404 BULK_MOVE_ITEMS_NOT_FOUND` with the missing `count`) and
  `ItemService.selectionRoots`, which drops every selected item with a selected ancestor
  (`ItemRepository.listAncestorLinks`). The move then requires a destination
  (`BULK_MOVE_PARENT_REQUIRED`, `PARENT_ITEM_NOT_FOUND`), applies `assertCanContain` to all roots, and
  writes the roots not already there with one `UPDATE`, all inside one SQLite transaction that reads
  the current hierarchy rather than the browser's view of it.
- Every hierarchy walk passes its IDs as one JSON parameter and uses `UNION`, so a large selection
  never reaches SQLite's bound-parameter limit and a damaged cycle cannot loop.
- `DELETE /api/items/:id` answers HTTP `409` while the item has children. Contained items are never
  deleted automatically and never silently moved to the root.
- UI: `client/src/pages/ItemForm.vue` (selector), `client/src/pages/ItemDetails.vue` (parent link
  and Contents section), `client/src/components/ItemResults.vue` (the list column, the card line, and
  the selection checkboxes), `client/src/pages/ItemsList.vue` (the selection bar with **Move to…** and
  the phone page selection), and `client/src/components/BulkMoveDialog.vue` (destination search,
  summary, confirmation, and the move). The selection itself is `client/src/labelSelection.js`.

## Verification

- `test/e2e.test.js` covers assigning, reading, moving, and clearing a parent, the self-parenting and
  direct/indirect cycle rejections, the `409` on a non-empty container, deletion after the contents
  are moved, and hierarchy survival across a restart and in a downloaded backup.
- `test/e2e/nesting.spec.js` covers the browser workflow: place an item inside another, follow the
  parent link, see it under **Contents**, and reach the container from the items list column.
- `test/bulk-move.test.js` covers the bulk move at the service level: unrelated leaves and
  containers, a selected parent with a selected child or grandchild, several subtrees, only roots
  reparented, destinations equal to or inside a selection root, unknown items and destinations,
  malformed requests, duplicate IDs and UUIDs, rollback of a failed write, unchanged roots, the
  effective location with untouched saved values, custom fields, and photos, the preview candidates,
  and the single-item cycle rules. `test/e2e.test.js` checks both routes over HTTP.
- `test/e2e/bulk-move.spec.js` covers the browser workflow: `Box A` and its `Camera` moved into
  `Box B` keep `Box B → Box A → Camera` in the list, item details, Contents, and the Hierarchy tree;
  a destination made invalid in the meantime is refused with nothing moved and the selection kept;
  and phone cards selected with **Select all items on this page** are moved.

## Notes and limitations

- Cycle protection is enforced on the server; the client filtering is only a convenience.
- There is no drag-and-drop tree and no recursively expanded tree on the items list. Bulk move only
  places items inside a container: it cannot take them out to the top level, and it has no undo.
  The whole containment tree is browsed read-only on the [Hierarchy](hierarchy.md) page.
- The items list cannot be filtered or sorted by container; it only displays the direct parent.
- The SQLite backup contains the hierarchy automatically because it is a plain column on `items`.
