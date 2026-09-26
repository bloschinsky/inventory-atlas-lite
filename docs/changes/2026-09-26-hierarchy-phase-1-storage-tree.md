# Hierarchy, Phase 1: Storage Tree

- **Completed:** 2026-09-26
- **Version:** 0.40.0

## Summary

- New top-level **Hierarchy** page at `/hierarchy`, listed after **Items** in the navigation. It shows
  a read-only storage tree under a virtual **Inventory** root: top-level containers are the root
  branches, and every top-level leaf is gathered in one virtual **Uncontained items** group with its
  count. Neither virtual node is stored.
- Rows show an expand/collapse toggle, the first photo or an icon, the name linking to the item page,
  the category, the server-provided effective location, and the direct child count. Nesting depth is
  unlimited; **Expand all** and **Collapse all** have no threshold.
- **Search hierarchy** matches item names, keeps and expands each match's ancestor path, keeps a
  matching container's contents reachable, and restores the previous browsing expansion when cleared.
  Loading, API error with **Retry**, empty inventory, and no-matches states are included, and the
  phone layout caps the indentation.
- New `GET /api/items/hierarchy` returns flat lightweight nodes read by one statement
  (`ItemRepository.listHierarchy()`, reusing `ROOTS_CTE` and grouped joins for photos and child
  counts) through `ItemService.hierarchy()`. No schema change; `parent_item_id` is never written.
- Client: `client/src/pages/Hierarchy.vue`, `client/src/components/HierarchyTree.vue`, the pure rules
  in `client/src/hierarchyTree.js`, the route, the navigation entry, tree styles, and new `nav.hierarchy`
  and `hierarchy.*` strings in English and Ukrainian.
- Documentation: new `docs/features/hierarchy.md` and its index entry; updates to `docs/HOW-TO.md`,
  `docs/features/nested-items.md`, `docs/ROADMAP.md`, the Phase 2 and Phase 3 task headers, `AGENTS.md`,
  and the release history. The completed task file
  `docs/issues/TASK-HIERARCHY-PHASE-1-STORAGE-TREE.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 172 tests: 171 passed, 1 skipped (shellcheck is not installed locally), including the
  new `test/hierarchy.test.js` and the hierarchy read added to the nesting test in `test/e2e.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 99 passed, including the new `test/e2e/hierarchy.spec.js` (navigation, expanding
  and opening a nested item, the uncontained group, Expand/Collapse all, no write requests, search with
  the ancestor path and inherited location, no matches, and a ten-level chain on a phone). The 7
  `whats-new.spec.js` tests failed in that run only because the uncommitted working copy still sat on
  the `v0.39.1` tag, so the build reported 0.39.1; rerun with `APP_VERSION=0.40.0`, the What's New,
  Version History, and About specs passed (21 of 21).
