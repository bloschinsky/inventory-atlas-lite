# Hierarchy category grouping

- **Completed:** 2026-09-29
- **Version:** 0.45.0

## Summary

- The Hierarchy page has two independent switches, **Group by: Location | Category** and **View:
  Tree | Graph**, kept in the address as `?group=category` and `?view=graph` (defaults omitted,
  unknown values fall back to Location and Tree), so all four combinations work and **Back** from an
  item returns to the same one. Location stays the default and its behavior is unchanged.
- `client/src/hierarchyTree.js` was refactored into one internal `project()` that builds a normalized
  tree (`mode`, `byId`, projection `children`/`parentOf`, `groups`, `groupOf`) for both projections:
  `buildLocationTree()` (the former `buildTree()`) and the new `buildCategoryTree()`, which keeps a
  `parent_id` link only when the direct parent has the same `category_id`, groups the remaining roots
  by category under stable `category:<id>` keys (`categoryKey()`), and counts every item of a
  category. `searchTree()`, `expandableKeys()`, and `visibleRows()` now work on either tree; rows
  carry their `group`, a `category` or `uncontained` type (the latter renamed from `group`),
  `contentCount` in the projection, and `storedIn` for a direct container that is not the parent row.
  The new `itemMeta()` gives both views the same secondary line (category and location in Location
  grouping; location and *Stored inside* in Category grouping).
- `client/src/useHierarchyExpansion.js` keeps one browsing expansion set per grouping, still shared by
  Tree and Graph; the search set follows the current projection.
- `HierarchyTree.vue` and `HierarchyGraph.vue` render category rows/nodes (tag icon, purple accent,
  item count) and use projection counts instead of the physical `children_count`; the graph region is
  named *Category graph* in Category grouping. Neither component implements a grouping rule.
- `GET /api/items/hierarchy` is unchanged: the direct container name comes from the same response.
  No schema change, no new endpoint, no writes.
- New and changed `hierarchy.*` messages in English and Ukrainian: `groupBy`, `groups.*`, `storedIn`,
  and per-grouping `intro`, `searchPlaceholder`, `noMatchesText`, and `graphLabel`.
- `docs/issues/TASK-HIERARCHY-PHASE-3-DRAG-DROP.md` now states that structural drag & drop belongs to
  the Location grouping, Category grouping stays read-only, a Category node is never a
  `parent_item_id` or a location, category reassignment is not done by drag & drop, and the Category
  projection must reflect moves made in Location grouping; it adds the matching test, acceptance, and
  out-of-scope items.
- Documentation: `docs/features/hierarchy.md`, `docs/features/README.md`, `docs/HOW-TO.md`,
  `docs/ROADMAP.md`, `AGENTS.md`, and the 0.45.0 release-history entry. The completed task file
  `docs/issues/TASK-HIERARCHY-CATEGORY-GROUPING.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 213 tests: 212 passed, 1 skipped (shellcheck is not installed locally).
  `test/hierarchy.test.js` (23 tests) keeps the 16 Location tests and adds Category coverage: one
  id-keyed node per category with its count, direct same-category nesting at several depths,
  cross-category parents as roots and never inside another category, no nesting across an
  intermediate cross-category parent, every item exactly once, projection versus physical child
  counts, location and *Stored inside* metadata, item and category search with same-category paths,
  the Category graph edges, determinism and node limit, real endpoint data with nothing written, and
  separate per-grouping expansion with a search recomputed on switching.
- `npm run build` — passed.
- `npm run test:e2e` — 115 passed, including two new tests in `test/e2e/hierarchy.spec.js`: Category
  Tree (switching, the category count, expanding a category and a same-category nested item, *Stored
  inside* metadata, the container only under its own category, Item Details and **Back**), Category
  Graph (count, item search without the cross-category container), switching back to Location with
  the physical path intact, no write requests, and the fallback of unknown address values.
- Category Tree, Category Graph, and the phone layout were also checked in screenshots against an
  isolated test database.
