# Hierarchy (Storage Tree and Graph)

## Summary

The **Hierarchy** page shows the whole inventory as a read-only hierarchy grouped by effective
location and then by the existing **Stored inside** links, either as an expandable storage tree or as
an interactive graph. It answers where things are, what is inside a container, where an item sits in
the containment chain, which top-level containers each location has, and which items are not inside
anything. It adds no location or container entity and no schema change: `items.parent_item_id` stays
the only source of containment, the text `items.location` stays the only stored location, and both
views read the same data and the same client model.

The canonical hierarchy is:

```text
Inventory
→ Location
→ container branches / Uncontained items
→ nested contents
```

## User-visible behaviour

- **Hierarchy** is a top-level navigation entry, after **Items**, at `/hierarchy`. A **Tree | Graph**
  switch sits next to the search. **Tree** is the default; **Graph** is kept in the address as
  `/hierarchy?view=graph`, so **Back** from an item returns to the graph.
- The hierarchy is headed by **Inventory**, a virtual root that exists only in the interface.
- **Locations** are the level directly under **Inventory**. Each is a virtual grouping node with a pin
  icon, sorted by name, followed by **No location**. A location node shows the total number of real
  items in all of its branches, descendants included; virtual nodes are never counted. Location nodes
  are not items: they have no item page and cannot be edited, dragged, or used as a destination.
- Grouping uses the **effective location** sent by the server — the outermost container's location,
  the same value as on **Items** and the item page. Only top-level items are grouped; everything
  inside them stays in their branch, so the saved locations of nested items never split a branch
  across locations. The browser never derives the effective location itself.
- **Normalization.** Surrounding spaces and letter case are ignored for grouping, so `Garage`,
  ` garage `, and `GARAGE` are one location. The node is named by the most used spelling among the
  top-level items of the group; equally used spellings fall back to the first in code-point order, so
  the name is always the same for the same data. Saved item text is never rewritten.
- **No location** gathers every top-level branch whose effective location is empty, blank, or unset.
  It is always last, behaves like any other location node in both views, and is never stored.
- Inside each location, **top-level containers** — items without a container that hold at least one
  item — come first, sorted by name. **Uncontained items** — top-level items that hold nothing — are
  gathered in that location's own virtual group, with its item count, so loose items never flood the
  level. A location without loose items has no group. There is no global Uncontained items group.
- Branches, locations, and groups start collapsed. Expanding is per node, at any depth; **Expand all**
  opens every location, group, and branch, and **Collapse all** closes them. The opened nodes are
  shared by the two views, so switching keeps them, and they are kept while the page stays open but
  not across a reload.
- **Search hierarchy** matches item names and location names, ignoring case. An item match is shown
  together with its location and its whole container path, which are expanded automatically; matches
  among loose items open their location's group. A matching container keeps its contents available,
  collapsed. A matching location is highlighted and opened one level, with all of its branches
  available. The **No location** label is interface text and is not searched. **Expand all** and
  **Collapse all** then act on the search result only. Clearing the search returns to the nodes that
  were open before it. A search without matches shows *No matching items* in either view.
- The page shows a loading state, an error with **Retry**, an empty-inventory state with **Add item**,
  and the no-matches state.

### Tree

- Location rows have a tinted background, a pin icon (a crossed-out pin for **No location**), the
  location name, and the item count badge.
- Every item row shows an expand/collapse button when it has contents, the first photo or a
  container/item icon, the name, the category, the effective location, and the number of direct
  contents. The name links to the regular item page. There is no expansion threshold.
- Toggles are named *Expand/Collapse &lt;name&gt;*; a group's name includes its location, for example
  *Expand Uncontained items — Garage*.
- On a phone the rows are indented by a smaller step that stops growing after six levels, so deep
  chains never need sideways scrolling.

### Graph

- A left-to-right tree diagram: **Inventory** is on the left, then the location column, then each
  containment level. A parent sits midway along its children. Arrows run from the root to each
  location, from a location to its containers and group, and from a container to each item inside it.
- Nodes are compact Tabler cards of a fixed size. Location nodes have an azure border and pin icon,
  the name, and the total item count. Item nodes show the first photo or an icon, the name (truncated,
  with the full name as a tooltip), the number of direct contents for containers, and the category.
  Items with contents (`children_count > 0`) have a coloured left edge and a box icon; leaves a plain
  border and an item icon. **Inventory** and **Uncontained items** have dashed borders.
- Each node with visible contents has a **+**/**−** button named *Expand/Collapse &lt;name&gt;*.
  Collapsing removes the descendants from the graph and the layout closes the gap. The toggled node
  stays in place, unless the contents it opened would fall outside the pane, which is then fitted
  to them.
- Drag the background to pan, scroll or pinch to zoom (10%–200%); buttons zoom in, zoom out, and
  **Fit to view**. The graph fits itself when it opens, after **Expand all**/**Collapse all**, and
  when the search changes; a search fits its matches and their paths and never zooms in past 100%.
- Clicking a node selects it (outlined); clicking an item name, or double-clicking an item node, opens
  the item page. Double-clicking a location or group opens nothing. Matches of the search, items and
  locations, are highlighted in yellow.
- The pane height follows the window (`clamp(22rem, 65vh, 44rem)`) and the page never scrolls
  sideways; on a phone the graph fits smaller and stays pannable, and the controls stay above it.
- More than 500 visible nodes show a warning asking to collapse branches, search, or use the Tree,
  instead of drawing the graph and freezing the browser. Location and group nodes count toward it.
- The graph is read-only until Phase 3: nodes cannot be dragged, connected, or deleted, and nothing is
  written.

## Implementation overview

- `GET /api/items/hierarchy` answers `{ items: [...] }`, one flat node per item with `id`, `uuid`,
  `name`, `parent_id`, `category_id`, `category_name`, `thumbnail_id` (first photo or `null`),
  `effective_location`, and `children_count` (direct contents). Nodes are never nested in the response,
  so any view can derive its own structure from `parent_id`. The route is registered before
  `/api/items/:id`. The location grouping needs nothing more, so the endpoint is unchanged by it.
- `ItemRepository.listHierarchy()` reads every node in one statement. It reuses `ROOTS_CTE` for the
  root that provides the effective location, and grouped joins for the first photo and the child
  count, so there is no query per item or per location and no photo data is read.
  `ItemService.hierarchy()` maps the root location with the same rule as the items list.
- `client/src/hierarchyTree.js` holds the pure hierarchy rules for both views:
  - `buildTree()` groups the top-level items by `normalizeLocation(effective_location)` (trimmed and
    lower-cased; empty means no location) into `locations`, each with its key, display name,
    containers, uncontained leaves, and total `itemCount`, and records the location of every item
    reachable from a top-level item in `locationOf`. Named locations are sorted by name and No location
    is last.
  - Virtual keys are strings and item keys are numbers, so they never collide: `inventory` (`ROOT`),
    `location:<normalized>` (`locationKey()`), and `uncontained:<normalized>` (`uncontainedKey()`). A
    named location's normalized text is never empty, so `location:` and `uncontained:` are the reserved
    keys of No location, and no location name can produce them.
  - `searchTree()` returns the matches (item ids and location keys), the visible items, and the path to
    expand, including the location and group keys. `expandableKeys()` lists every location, group, and
    container that has visible contents. `visibleRows()` walks only expanded nodes, so collapsed
    descendants are never rendered, and gives each row its depth and the key of its parent row.
    `rowName()` is the accessible name of a row for both views. A damaged cyclic chain cannot loop the
    ancestor walk.
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
  when the visible rows change, and no dagre or force layout is involved. Each node has exactly one
  incoming edge, so an edge is identified by its target. The component is loaded with
  `defineAsyncComponent`, so the library is downloaded only when the Graph view opens. The zoom and
  fit controls are the page's own localized buttons rather than the Vue Flow controls package.
- Toggles in both views are buttons named *Expand/Collapse &lt;name&gt;* with `aria-expanded`; the graph
  pane is a region named *Storage graph*.

## Verification

- `test/hierarchy.test.js` covers the endpoint shape, the first photo, child counts, the effective
  location matching the items list, a single statement over 30 nesting levels with nothing written
  and the grouping built from that one response, and real endpoint data grouped by the top-level
  location with spaced legacy text and saved nested locations left untouched. The tree rules cover the
  empty tree; named locations as virtual root-level nodes with per-location groups, reserved keys, and
  no global group; normalization of `Garage`/` garage `/`GARAGE`, the deterministic display name, blank
  and null locations under No location, and unmodified items; branches kept whole under the top-level
  location with descendant counts and 200-level nesting; row names; search with the location and
  ancestor path; and search by location name. The graph layout covers location nodes under the root,
  edges through the locations matching `parent_id` at every level, collapse and expansion with a
  deterministic re-layout, no overlapping nodes, a search revealing a nested match or a location and
  the fitted viewport, and a 2 500-item inventory drawing only its visible nodes with the node limit.
- `test/e2e.test.js` reads the endpoint over HTTP in the nesting acceptance test.
- `test/e2e/hierarchy.spec.js` covers the tree (navigation, a location row with its count, two
  spellings in one location, no global group, expanding a location and opening a nested item, the
  location's own Uncontained items group, **Expand all**/**Collapse all** including locations, no
  write requests, search with the location path and the inherited location, a nested saved location
  not splitting its branch, search by location name, No location, no matches, clearing a search, a
  ten-level chain on a phone) and the graph (selecting **Graph**, the root and location nodes with
  their count, the container and group nodes, collapse and expansion of a branch, browse expansion
  kept when switching to the Tree, search highlighting a nested match with its location path, the
  zoom and fit controls, switching back to the Tree with the same opened path, opening a nested item
  by its name and returning with **Back**, double-clicking a location and an item node, no write
  requests, and a phone without sideways scrolling). `test/e2e/bulk-move.spec.js` reads a moved
  subtree under its new location.

## Notes and limitations

- Location grouping is read-only. Location nodes cannot be renamed, merged, or dropped onto; to move
  something to another location, change its **Location** (or its outermost container's) in the item
  form. Drag & drop, including placement onto a location, is specified for Phase 3.
- Locations are flat free text: there are no nested locations, addresses, or location records.
- Only item and location names are searched; the broader **Items** search is not used.
- Items are not moved, reordered, or edited from either view; use **Stored inside** in the item form,
  or **Move to…** on the **Items** list for several items at once (see
  [Nested items](nested-items.md#bulk-move)). Both views read the result on their next load, and a
  bulk move keeps selected subtrees intact, so descendants stay below the same moved roots, follow the
  location of their new outermost container, and search paths follow the new containers.
- Graph node positions are computed, never saved, and there is no minimap.
- The graph draws at most 500 visible nodes at once; wide or fully expanded inventories are better
  read in the Tree, which has no limit.
- Rows that belong to a damaged cycle, which the API cannot create, are not shown and are not matched
  by a search, because no top-level item leads to them. Nothing is repaired automatically.
- All nodes are loaded in one request; branches are not loaded lazily.
- Containment itself is described in [Nested items](nested-items.md), and the displayed location in
  [Effective location inheritance](effective-location-inheritance.md).
