# Item photo order and cover photo

Every item keeps its photos in a persisted order, and one rule decides its cover:

> **The first photo in the persisted photo order is the cover photo.**

There is no separate cover flag (`is_cover`, `is_primary`, or `primary_photo_id`), so the order and
the cover can never disagree. **Make cover** moves a photo to the first position, deleting the cover
makes the next photo the cover, and any reorder can change it.

## User-visible behaviour

- The **Photos** section of Add Item and Edit Item shows saved photos and newly selected files in
  one ordered row. The first tile carries a **Cover** badge; a file that is not uploaded yet carries
  **Not saved**.
- Each tile has four buttons with accessible names and tooltips: **Move photo left**, **Make cover**
  (a star, hidden on the first photo), **Move photo right**, and **Delete photo**. Left is disabled on
  the first photo and right on the last one. The buttons are 44 px touch targets and work with the
  mouse, the keyboard, and touch; focus follows the moved photo so the same arrow can be pressed
  again. There is no drag-and-drop.
- Choosing files adds them to the end of the row instead of replacing the earlier selection. A new
  file can be moved anywhere, including to the cover position, before it is uploaded.
- Order changes are saved with **Save item**, together with the other values. Deleting a saved photo
  in the form still asks for confirmation and acts immediately, as before.
- The Item Details carousel opens on the cover, and its arrows, indicators, and swipe follow the
  persisted order. The Items list, the Hierarchy tree and graph, the contents of a container, checklist
  entries, and checklist runs all show the same cover as the thumbnail.
- Deleting the cover, in the form or on Item Details, makes the next photo the cover. Deleting the
  only photo leaves the item without a thumbnail, as before.

## Data model and migration

- `item_photos.sort_order INTEGER NOT NULL` holds positions `0..n-1` within one item, enforced
  unique by `idx_photos_item_order (item_id, sort_order)`.
- Schema version 7 adds the column to existing databases and numbers each item's photos by
  ascending id, which is exactly the old display order, so no cover changes. The migration runs only
  while the column is missing, inside the schema transaction, and does not advance
  `database_metadata.last_updated_at`: the `item_photos` update trigger is dropped for it and
  recreated with the others right after. Restore validation applies the same migration to an older
  backup's staged copy, and `CURRENT_SCHEMA` requires the column.
- Every read orders by `sort_order, id`; the id only keeps the order deterministic should two
  positions ever be equal.

## Implementation overview

- `ItemPhotoRepository` (`server/src/repositories/itemPhotoRepository.js`)
  - `listMetadata()` returns `id, filename, mime_type, sort_order, created_at` in order;
  - `insertMany()` appends the uploaded files after the current last position, in submitted order,
    in one transaction, and returns the created rows in that order;
  - `writeOrder()` stores a complete id list as `0..n-1`. Only rows whose position changes are
    written, first to negative positions and then to their final ones, so the unique index never
    sees a transient collision;
  - `deleteById()` deletes the photo and closes the gap in the same transaction;
  - `coverPhotoIdSql(itemId)` is the one cover-photo subquery
    (`ORDER BY p.sort_order, p.id LIMIT 1`) embedded by `ItemRepository.search()`, `listChildren()`,
    `listHierarchy()`, `ChecklistRepository.listEntries()`, and `ChecklistRunRepository.listItems()`.
    The unique index serves it directly.
- `PhotoService.reorder()` validates and applies a new order; `photoRoutes.js` stays thin.
- `ItemForm.vue` keeps one list of saved photos and selected files and the order the server last
  confirmed. **Save item** uploads the new files in their visible order (which appends them), turns
  them into saved photos with the returned ids, and sends `PUT …/photos/order` only when the visible
  order differs from the server's. A failed reorder therefore never uploads a file twice.
- `ItemPhotoViewer.vue` has no ordering rule of its own; it shows the photos in the order the API
  returns them.

## API

`PUT /api/items/:id/photos/order` with `{ "photo_ids": [17, 12, 13] }` (the item by id or UUID)
answers `200` with the ordered photo metadata. The list must name every current photo of the item
exactly once:

| Situation | Status | Code |
| --- | --- | --- |
| The item does not exist | 404 | `ITEM_NOT_FOUND` |
| `photo_ids` is not an array of positive integer ids, or repeats an id | 400 | `PHOTO_ORDER_INVALID` |
| The list misses a photo, or names an unknown photo or one of another item | 409 | `PHOTO_ORDER_STALE` |

A stale list — made before another photo was added or deleted — is rejected as a whole and changes
nothing; the browser shows *The photos of this item changed in the meantime. Reload the item and try
again.* Photos can never move between items through this endpoint. `POST /api/items/:id/photos`
returns the created photos with their `sort_order`, and `GET /api/items/:id` lists `photos` in order.

## Coverage

- `test/item-photo-order.test.js`: the fresh schema and unique index; the version 6 migration in id
  order per item with preserved covers, an unchanged `last_updated_at`, idempotence, and the restored
  trigger; restore validation of a version 6 backup; first, multi-file, and appended uploads; reorder
  success and cover swaps; refusal of a missing item, non-arrays, non-integer and duplicate ids,
  foreign, incomplete, unknown, and stale lists without any change; deleting a middle photo, the
  cover, and every photo; the same cover in the Items list, Hierarchy, container contents, checklist
  entries, and checklist runs; and the HTTP contract.
- `test/e2e/photos.spec.js`: Make cover on the third of three photos, the new cover in the Items list
  thumbnail and as the first carousel slide, left and right moves (also by keyboard) that persist
  across a reload, a newly selected file made the cover before upload, and deleting the cover in the
  form promoting the next photo.
