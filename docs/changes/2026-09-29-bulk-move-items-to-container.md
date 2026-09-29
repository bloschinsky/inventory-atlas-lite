# Bulk move items to container

- **Completed:** 2026-09-29
- **Version:** 0.43.0

## Summary

- New `PATCH /api/items/bulk-parent` (`{ item_ids, parent_item_id }`) and a read-only
  `POST /api/items/bulk-parent/preview` (`{ item_ids, search }`) in `server/src/routes/itemRoutes.js`.
- `ItemService` gained `resolveSelection` (de-duplicated numeric IDs or UUIDs; any missing item
  rejects the request), `selectionRoots` (a selection root is a selected item with no selected
  ancestor), `bulkMovePreview`, and `bulkMove`. The move validates the destination against every root
  and writes only the roots that are not already there, in one SQLite transaction over the current
  hierarchy, so selected subtrees keep their internal structure and a refusal moves nothing.
- The containment check was extracted into `ItemService.assertCanContain`, now used by both the item
  form (`resolveParentId`) and the bulk move. It walks the destination's container chain
  (`ItemRepository.listAncestorIds`) instead of collecting the moved item's descendants; the error
  codes are unchanged. `listDescendantIds` was replaced by `listSubtreeIds(ids)`, and
  `listAncestorLinks`, `findRefs`, and `setParent` were added. Every walk passes its IDs as one JSON
  parameter and uses `UNION`. Parent candidates now also return `parent_name`.
- New error codes `BULK_MOVE_NO_ITEMS`, `BULK_MOVE_INVALID_ITEMS`, `BULK_MOVE_ITEMS_NOT_FOUND`, and
  `BULK_MOVE_PARENT_REQUIRED`, and `items.bulkMove.*` interface strings, in English and Ukrainian.
- Client: **Move to…** in the Items selection bar, a phone-only **Select all items on this page**
  button, and the new `client/src/components/BulkMoveDialog.vue` with destination search (category and
  direct container shown), the selection-root summary, the confirmation, errors kept in the dialog,
  and focus returned to **Move to…**. A success clears the selection, reloads the list, and shows a
  focused notice. The selection remains the existing `labelSelection`.
- `test/e2e/dashboard.spec.js`: the older-filter-response test now gives its clicked category more
  items than any other category in the shared test database, because the category chart lists only
  the six largest and the new spec's categories pushed a one-item category out of it.
- Documentation: `docs/features/nested-items.md` (new Bulk move section, implementation, tests,
  limitations), `docs/features/hierarchy.md`, `docs/features/qr-label-printing.md`,
  `docs/features/README.md`, `docs/HOW-TO.md`, `docs/ROADMAP.md`, `AGENTS.md`, and the 0.43.0
  release-history entry. The completed task file
  `docs/issues/TASK-BULK-MOVE-ITEMS-TO-CONTAINER.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 202 tests: 201 passed, 1 skipped (shellcheck is not installed locally), including the
  new `test/bulk-move.test.js` and the bulk move API test in `test/e2e.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 113 passed, including the new `test/e2e/bulk-move.spec.js` (preserved
  `Box B → Box A → Camera` nesting across the list, item details, Contents, and the Hierarchy tree; a
  refused move with nothing moved and the selection kept; phone card selection).
