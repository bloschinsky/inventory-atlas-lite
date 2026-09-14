# Nested items (containers)

- Completed: 2026-09-14
- Version: 0.2.0

## Summary

Added optional item nesting so that an item can be stored inside another item, with server-side cycle protection and a guarded deletion of non-empty containers.

## Implemented changes

- Added the nullable self-referencing column `items.parent_item_id` with `ON DELETE RESTRICT`, an index on it, and an in-place migration for databases created before this change.
- Extended item creation and update with `parent_item_id`, rejecting a missing parent, self-parenting, and direct or indirect cycles through a recursive descendant lookup.
- Extended the item details response with `parent_item_id`, a compact `parent` reference, and the direct `children` summaries used by the details page.
- Added `GET /api/items/parent-candidates` for the **Stored inside** selector, which searches by name, excludes the edited item and its descendants, and returns at most 20 results.
- Rejected deletion of an item that still contains other items with HTTP `409` instead of cascading or silently detaching them.
- Added a **Stored inside** search-and-clear control to the item form and a parent link plus a **Contents** list to the item details page.
- Extended the automated tests with a hierarchy scenario covering assignment, moving, clearing, candidate exclusion, cycle rejection, container deletion, backup, and restart.
- Incremented the project version from `0.1.1` to `0.2.0` for a meaningful new feature.

## Verification

- `npm run lint` passes.
- `npm test` and `npm run build` were not run: the available Node.js on this machine is 18.14.0, while the project requires 20.19+ and the installed `better-sqlite3` binary targets Node.js 24.
