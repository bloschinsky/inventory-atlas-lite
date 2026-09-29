# Hierarchy location grouping

- **Completed:** 2026-09-29
- **Version:** 0.44.0

## Summary

- The Hierarchy page is now `Inventory → Location → container branches / Uncontained items → nested
  contents` in both the Tree and the Graph. Location nodes are virtual: no schema change, no
  `locations` table, and `GET /api/items/hierarchy` is unchanged; the client groups the top-level
  items of that one response by their server-provided `effective_location`.
- `client/src/hierarchyTree.js`: `buildTree()` groups top-level branches by `normalizeLocation()`
  (trimmed, lower-cased, empty means No location), names each group by its most used spelling
  (ties in code-point order), sorts named locations by name with No location last, counts every real
  item of a location including descendants, and records each reachable item's location. Virtual keys
  are the strings `inventory`, `location:<normalized>`, and `uncontained:<normalized>`; No location
  uses the reserved `location:` and `uncontained:`. The single global Uncontained items group was
  replaced by one group per location. `searchTree()` also matches location names and expands the
  location of every item match; `expandableKeys()` and `visibleRows()` include location and group
  rows; the new `rowName()` gives both views the same accessible row names.
- `HierarchyTree.vue` and `HierarchyGraph.vue` render location rows/nodes with a pin icon, azure
  styling, and the item count; group toggles are named *Uncontained items — &lt;location&gt;*. Graph edges
  are now identified by their target node. New `hierarchy.noLocation` and `hierarchy.uncontainedIn`
  messages and updated intro, placeholder, and no-match text in English and Ukrainian.
- The future `docs/issues/TASK-HIERARCHY-PHASE-3-DRAG-DROP.md` was rewritten for the Location-aware
  hierarchy: its dependency on this task, the removal of the global Uncontained assumptions, the two
  mutation concepts (**Store inside** vs **Move to location**), per-location Uncontained and No
  location drop semantics, subtree and cross-location examples, a unified explicit
  `PATCH /api/items/:id/placement` endpoint, distinct drop-target UX, a two-concept **Move to…**
  fallback, and the required Location-aware tests.
- Documentation: `docs/features/hierarchy.md`, `docs/features/README.md`, `docs/HOW-TO.md`,
  `docs/ROADMAP.md` (Phase 3 and Category Grouping unblocked), `AGENTS.md`, and the 0.44.0
  release-history entry. The completed task file
  `docs/issues/TASK-HIERARCHY-LOCATION-GROUPING-BEFORE-PHASE-3.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 206 tests: 205 passed, 1 skipped (shellcheck is not installed locally). The rewritten
  `test/hierarchy.test.js` (16 tests) covers named locations as virtual nodes, containers under their
  location, per-location Uncontained groups and no global group, No location for null/blank values,
  `Garage`/` garage `/`GARAGE` grouping with unmodified item data, whole branches despite nested
  saved locations, descendant-inclusive counts, search with the location path and by location name,
  Expand all keys, the graph nodes and edges through locations, collapse/expand, no overlaps, the node
  limit, and the unchanged single-statement endpoint.
- `npm run build` — passed.
- `npm run test:e2e` — 113 passed, including the updated `test/e2e/hierarchy.spec.js` (Tree and Graph
  location nodes and counts, per-location groups, Expand/Collapse all, search by item and location,
  No location, Tree/Graph expansion kept) and `test/e2e/bulk-move.spec.js` (a moved subtree read
  under its new location).
- The Tree, a location search, and a Graph search were also checked in screenshots against an isolated
  test database.
