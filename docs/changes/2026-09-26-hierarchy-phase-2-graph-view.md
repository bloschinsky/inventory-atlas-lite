# Hierarchy, Phase 2: Graph View

- **Completed:** 2026-09-26
- **Version:** 0.41.0

## Summary

- The **Hierarchy** page has a **Tree | Graph** switch next to the search. Tree stays the default;
  Graph is kept in the address as `?view=graph`, so **Back** from an item returns to it.
- Graph draws the same visible rows as the Tree as a deterministic left-to-right tree: the virtual
  **Inventory** root on the left, one column per level, each leaf on its own line in tree order, and
  each parent centred along its children, with arrowed edges from container to contents. Nodes are
  fixed-size Tabler cards with the photo or icon, name, direct content count, and category;
  containers (`children_count > 0`) have a coloured edge, virtual nodes a dashed border, search
  matches a yellow highlight, and the selected node an outline.
- Pan, zoom (10%–200%), **Fit to view**, zoom buttons, node selection, per-node expand/collapse with
  re-layout (the toggled node stays in place, or the view fits newly opened contents that would be
  off-screen), **Expand all**/**Collapse all**, opening an item by its name or a double-click, and an
  automatic fit to the search matches and their container paths. More than 500 visible nodes show a
  warning instead of the graph. The graph is read-only: dragging, connecting, and deleting nodes are
  disabled and nothing is written.
- Shared model: `visibleRows()` in `client/src/hierarchyTree.js` now gives each row its parent key and
  exports the virtual `ROOT` key; the expansion state moved from `HierarchyTree.vue` into the new
  `client/src/useHierarchyExpansion.js`, owned by the page and shared by both views, so switching
  keeps the opened branches. The new `client/src/hierarchyGraph.js` holds the library-independent
  layout, bounds, fitting, and node limit.
- New dependency `@vue-flow/core` 1.48.2 (MIT), pinned exactly; it is used only as the pan/zoom/
  selection renderer in `client/src/components/HierarchyGraph.vue`, which is loaded on demand so the
  library is not part of the main bundle. No layout library, force simulation, WebGL, or server change
  was added; the Graph uses the Phase 1 `GET /api/items/hierarchy` endpoint.
- New `hierarchy.*` strings for the view switch, graph controls, hint, and size warning in English and
  Ukrainian, and graph styles in `client/src/style.css` built from Tabler variables for both color
  modes.
- Documentation: `docs/features/hierarchy.md` now covers both views (library choice, layout strategy,
  virtual nodes, limitations, read-only status); updates to `docs/features/README.md`,
  `docs/HOW-TO.md`, `docs/ROADMAP.md`, the Phase 3 task header, `AGENTS.md`, and the release history.
  The completed task file `docs/issues/TASK-HIERARCHY-PHASE-2-GRAPH-VIEW.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 178 tests: 177 passed, 1 skipped (shellcheck is not installed locally), including six
  new graph layout tests in `test/hierarchy.test.js` (virtual root and group, edges matching
  `parent_id`, collapse/expand re-layout, no overlaps, search reveal and fitting, a 2 500-item collapsed
  inventory drawing three nodes).
- `npm run build` — passed; Vue Flow is emitted as a separate `HierarchyGraph` chunk.
- `npm run test:e2e` with `APP_VERSION=0.41.0` (the uncommitted working copy still sat on the previous
  tag) — 109 passed, including the new graph tests in `test/e2e/hierarchy.spec.js`: switching to
  Graph, expanding and collapsing branches, the uncontained group, search highlighting a nested match,
  zoom and fit controls, switching back to Tree with the same opened path, opening a nested item and
  returning with **Back**, selecting and double-clicking a node, no write requests, and a phone
  viewport without sideways scrolling.
- Screenshots of the graph in light and dark mode, with a search, and at phone width were checked
  manually.
