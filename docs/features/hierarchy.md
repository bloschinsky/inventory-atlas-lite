# Hierarchy (Storage Tree and Graph)

## Summary

The **Hierarchy** page shows the whole inventory as a read-only containment hierarchy built from the
existing **Stored inside** links, either as an expandable storage tree or as an interactive graph. It
answers what is inside a container, where an item sits in the containment chain, which top-level
containers exist, and which items are not inside anything. It adds no container entity and no schema
change: `items.parent_item_id` stays the only source of containment, and both views read the same
data and the same client model.

## User-visible behaviour

- **Hierarchy** is a top-level navigation entry, after **Items**, at `/hierarchy`. A **Tree | Graph**
  switch sits next to the search. **Tree** is the default; **Graph** is kept in the address as
  `/hierarchy?view=graph`, so **Back** from an item returns to the graph.
- The hierarchy is headed by **Inventory**, a virtual root that exists only in the interface.
- **Top-level containers** — items without a container that hold at least one item — are the
  branches directly under **Inventory**, sorted by name.
- **Uncontained items** — top-level items that hold nothing — are gathered in one virtual group at
  the end of the root level, with its item count, so hundreds of loose items never flood the root.
  The group is never stored anywhere and starts collapsed in both views.
- Branches start collapsed. Expanding is per node, at any depth; **Expand all** opens every branch and
  the group, and **Collapse all** closes them. The opened branches are shared by the two views, so
  switching keeps them, and they are kept while the page stays open but not across a reload.
- **Search hierarchy** matches item names, ignoring case. Each match is shown together with its whole
  container path, which is expanded automatically, and matches among uncontained items open the
  group. A matching container keeps its contents available, collapsed. **Expand all** and
  **Collapse all** then act on the search result only. Clearing the search returns to the branches
  that were open before it. A search without matches shows *No matching items* in either view.
- The location is the effective location sent by the server — the outermost container's location, the
  same value as on **Items** and the item page. The browser never derives it.
- The page shows a loading state, an error with **Retry**, an empty-inventory state with **Add item**,
  and the no-matches state.

### Tree

- Every item row shows an expand/collapse button when it has contents, the first photo or a
  container/item icon, the name, the category, the effective location, and the number of direct
  contents. The name links to the regular item page. There is no expansion threshold.
- On a phone the rows are indented by a smaller step that stops growing after six levels, so deep
  chains never need sideways scrolling.

### Graph

- A left-to-right tree diagram: **Inventory** is on the left, each column is one containment level,
  and a parent sits midway along its children. Arrows run from a container to each item inside it.
- Nodes are compact Tabler cards of a fixed size: the first photo or an icon, the name (truncated,
  with the full name as a tooltip), the number of direct contents for containers, and the category.
  Items with contents (`children_count > 0`) have a coloured left edge and a box icon; leaves a plain
  border and an item icon. **Inventory** and **Uncontained items** have dashed borders.
- Each node with visible contents has a **+**/**−** button named *Expand/Collapse &lt;name&gt;*.
  Collapsing removes the descendants from the graph and the layout closes the gap. The toggled node
  stays in place, unless the contents it opened would fall outside the pane, which is then fitted
  to them.
- Drag the background to pan, scroll or pinch to zoom (10%–200%); buttons zoom in, zoom out, and
  **Fit to view**. The graph fits itself when it opens, after **Expand all**/**Collapse all**, and
  when the search changes; a search fits its matches and their container paths and never zooms in
  past 100%.
- Clicking a node selects it (outlined); clicking its name, or double-clicking the node, opens the
  item page. Matches of the search are highlighted in yellow.
- The pane height follows the window (`clamp(22rem, 65vh, 44rem)`) and the page never scrolls
  sideways; on a phone the graph fits smaller and stays pannable, and the controls stay above it.
- More than 500 visible nodes show a warning asking to collapse branches, search, or use the Tree,
  instead of drawing the graph and freezing the browser.
- The graph is read-only until Phase 3: nodes cannot be dragged, connected, or deleted, and nothing is
  written.

## Implementation overview

- `GET /api/items/hierarchy` answers `{ items: [...] }`, one flat node per item with `id`, `uuid`,
  `name`, `parent_id`, `category_id`, `category_name`, `thumbnail_id` (first photo or `null`),
  `effective_location`, and `children_count` (direct contents). Nodes are never nested in the response,
  so any view can derive its own structure from `parent_id`. The route is registered before
  `/api/items/:id`.
- `ItemRepository.listHierarchy()` reads every node in one statement. It reuses `ROOTS_CTE` for the
  root that provides the effective location, and grouped joins for the first photo and the child
  count, so there is no query per item and no photo data is read. `ItemService.hierarchy()` maps the
  root location with the same rule as the items list.
- `client/src/hierarchyTree.js` holds the pure hierarchy rules for both views: `buildTree()`
  (containers, the uncontained group, the child lists), `searchTree()` (matches, their ancestors and
  descendants, and the path to expand), `expandableKeys()`, and `visibleRows()`, which walks only
  expanded branches, so collapsed descendants are never rendered, and gives each row the key of its
  parent row (`ROOT` for the root level, `UNCONTAINED` inside the group). A damaged cyclic chain cannot
  loop the ancestor walk.
- `client/src/useHierarchyExpansion.js` keeps the separate browsing and search expansion sets and
  exposes the visible rows with toggle, expand-all, and collapse-all actions.
  `client/src/pages/Hierarchy.vue` loads the nodes and owns the search, the expansion, and the view
  switch, and passes the same rows to either view.
- `client/src/components/HierarchyTree.vue` renders the rows as one flat list indented by depth.
- `client/src/hierarchyGraph.js` is the library-independent layout: `layoutGraph(rows)` adds the
  virtual root and returns positioned nodes and one parent -> child edge per row. Every leaf takes the
  next line in tree order and a parent is centred between its first and last child, so equal rows give
  equal positions and nodes of a fixed 240 × 64 px box never overlap. `graphBounds()` and
  `fitViewport()` compute the fitted viewport. `GRAPH_NODE_LIMIT` is 500.
- `client/src/components/HierarchyGraph.vue` maps the layout to [Vue Flow](https://vueflow.dev)
  (`@vue-flow/core` 1.48.2, MIT; its `@vueuse/core` and `d3-*` dependencies are MIT/ISC). Vue Flow was
  chosen because it is a maintained Vue 3 node/edge canvas that provides pan, zoom, selection, custom
  Vue node slots, and SVG edges without a WebGL or 3D stack. It is used only as the renderer:
  dragging, connecting, deleting, and double-click zoom are disabled, the layout is recomputed only
  when the visible rows change, and no dagre or force layout is involved. The component is loaded with
  `defineAsyncComponent`, so the library is downloaded only when the Graph view opens. The zoom and
  fit controls are the page's own localized buttons rather than the Vue Flow controls package.
- Toggles in both views are buttons named *Expand/Collapse &lt;name&gt;* with `aria-expanded`; the graph
  pane is a region named *Storage graph*.

## Verification

- `test/hierarchy.test.js` covers the endpoint shape, the first photo, child counts, the effective
  location matching the items list, a single statement over 30 nesting levels with nothing written,
  the tree rules (the empty tree, the uncontained group, containers as root branches, multi-level and
  200-level nesting, collapsed branches, search with ancestor paths and no matches), and the graph
  layout: root branches and the group under the virtual root, edges matching `parent_id` at every
  level, collapse removing and expansion restoring descendants with a deterministic re-layout, no
  overlapping nodes, a search revealing a nested match and the fitted viewport, and a 2 500-item
  inventory drawing only its three visible nodes.
- `test/e2e.test.js` reads the endpoint over HTTP in the nesting acceptance test.
- `test/e2e/hierarchy.spec.js` covers the tree (navigation, expanding and opening a nested item, the
  uncontained group, **Expand all**/**Collapse all**, no write requests, search with the inherited
  location, no matches, clearing a search, a ten-level chain on a phone) and the graph (selecting
  **Graph**, the root, container, and group nodes, collapse and expansion of a branch, search
  highlighting a nested match with its path, the zoom and fit controls, switching back to the Tree
  with the same opened path, opening a nested item by its name and returning with **Back**,
  double-clicking a node, no write requests, and a phone without sideways scrolling).

## Notes and limitations

- Only item names are searched; the broader **Items** search is not used.
- Items are not moved, reordered, or edited from either view; use **Stored inside** in the item form.
  Drag & drop editing is planned as Phase 3.
- Graph node positions are computed, never saved, and there is no minimap.
- The graph draws at most 500 visible nodes at once; wide or fully expanded inventories are better
  read in the Tree, which has no limit.
- Rows that belong to a damaged cycle, which the API cannot create, are not shown because no top-level
  item leads to them. Nothing is repaired automatically.
- All nodes are loaded in one request; branches are not loaded lazily.
- Containment itself is described in [Nested items](nested-items.md), and the displayed location in
  [Effective location inheritance](effective-location-inheritance.md).
