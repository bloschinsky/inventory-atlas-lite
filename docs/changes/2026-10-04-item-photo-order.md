# Item photo ordering and cover photo selection

- **Completed:** 2026-10-04
- **Version:** 0.50.0

## Summary

Implemented GitHub issue #3, *TASK: Item Photo Ordering and Cover Photo Selection*. Photos now have a
persisted order, and one canonical rule defines the cover: **the first photo in the persisted order is
the cover photo**. No cover flag was added.

- **Schema (version 7):** `item_photos.sort_order INTEGER NOT NULL` with the unique index
  `idx_photos_item_order (item_id, sort_order)`. Existing photos are numbered per item by ascending
  id, so every current cover stays the same. The migration runs once inside the schema transaction,
  leaves `database_metadata.last_updated_at` untouched (the `item_photos` update trigger is recreated
  after it), and also runs on a staged restore candidate; `CURRENT_SCHEMA` requires the column.
- **Repository:** `ItemPhotoRepository` returns metadata ordered by `sort_order, id` (with
  `sort_order`), appends uploads in submitted order, stores a complete order through `writeOrder()`
  (changed rows move through negative positions, so the unique index never collides), and closes the
  gap after a deletion in the same transaction. `coverPhotoIdSql()` is the single cover lookup now
  used by the Items list, container contents, Hierarchy, checklist entries, and checklist runs; the
  `MIN(id)` join and the `ORDER BY p.id LIMIT 1` subqueries are gone.
- **API:** `PUT /api/items/:id/photos/order` with `{ "photo_ids": [...] }` returns the ordered
  metadata. Non-arrays, non-integer or repeated ids answer `400 PHOTO_ORDER_INVALID`; a list that does
  not name exactly the item's current photos (missing, unknown, foreign, or stale) answers
  `409 PHOTO_ORDER_STALE` and changes nothing.
- **UI:** the item form shows saved photos and newly selected files in one ordered row with a
  **Cover** badge, a **Not saved** badge for pending files, and **Move photo left**, **Make cover**,
  **Move photo right**, and **Delete photo** buttons (44 px, keyboard focus follows the moved photo).
  Choosing files appends them. **Save item** uploads new files in their visible order and then stores
  the combined order with the returned ids, so a new file can become the cover in one save.
  `ItemPhotoViewer` keeps the API order and opens on the cover.
- **i18n:** `photos.cover`, `photos.makeCover`, `photos.moveLeft`, `photos.moveRight`,
  `itemForm.makeCover`, `itemForm.movePhotoLeft`, `itemForm.movePhotoRight`,
  `itemForm.unsavedPhoto`, `itemForm.photoOrderHelp`, the shortened `itemForm.photosReady`, and the
  `PHOTO_ORDER_INVALID` and `PHOTO_ORDER_STALE` errors in English and Ukrainian.
- **Documentation:** new `docs/features/item-photo-order.md` and its index entry; updated
  `docs/HOW-TO.md`, `item-photo-carousel.md`, `hierarchy.md`, `database-backup-and-restore.md`,
  `AGENTS.md`, and the 0.50.0 release-history entry. The task was tracked as a GitHub issue, so there
  was no `docs/issues/` file to remove.

## Verification

- `npm run lint` — passed.
- `npm test` — 256 tests: 255 passed, 1 skipped (shellcheck is not installed locally). New coverage in
  `test/item-photo-order.test.js` (9 tests: fresh schema and unique index, the version 6 migration and
  idempotence, restore validation of a version 6 backup, ordered and appended uploads, reorder and cover
  swaps, every invalid and stale reorder without change, deletions of a middle photo, the cover, and
  the only photo, the same cover in all five thumbnail queries, and the HTTP contract). Tests that
  inserted photos directly now set `sort_order`, and the hard-coded schema version expectations moved
  to 7.
- `npm run build` — passed.
- `npm run test:e2e` — 124 tests; 117 passed and the 7 `whats-new.spec.js` tests failed only because
  the working copy sits on the `v0.49.0` tag, which the build reports as the application version.
  With `APP_VERSION=0.50.0` the full suite passes: 124 passed. `test/e2e/photos.spec.js` adds three
  workflows: Make cover on photo 3 with the new Items list thumbnail and first carousel slide, left
  and right moves (also by keyboard) persisting across a reload, a newly selected file made the cover
  before upload, and deleting the cover promoting the next photo.
