# Hierarchy (Location and Category, Tree and Graph)

## Summary

The **Hierarchy** page shows the whole inventory as a read-only hierarchy, either as an expandable
tree or as an interactive graph. Two independent choices control it:

```text
Group by: Location | Category   — what the hierarchy means
View:     Tree | Graph          — how it is drawn
```

All four combinations work. **Location** is the default grouping: the physical/storage hierarchy of
effective locations and the existing **Stored inside** links. It answers where things are, what is
inside a container, where an item sits in the containment chain, which top-level containers each
location has, and which items are not inside anything. **Category** is a classification projection
of the same items: it answers what is owned of each kind, and which same-category items are
structurally nested, such as a PC and its components.

The page adds no location, category-tree, or container entity and no schema change:
`items.parent_item_id` stays the only source of containment, `items.category_id` the only category,
and the text `items.location` the only stored location. Both groupings and both views read the same
data through one client model.

The two hierarchies are:

```text
Location: Inventory → Location → container branches / Uncontained items → nested contents
Category: Inventory → Category → category-root items → same-category nested items
```

## User-visible behaviour

- **Hierarchy** is a top-level navigation entry, after **Items**, at `/hierarchy`. Next to the search
  are two separate switches, **Group by** (**Location | Category**) and **View** (**Tree | Graph**).
  Both choices live in the address — `?group=category` and `?view=graph`, the defaults are left out
  (`/hierarchy?group=category&view=graph` is Category Graph) — so **Back** from an item returns to
  the same grouping and view. Unknown values fall back to Location and Tree.
- The hierarchy is headed by **Inventory**, a virtual root that exists only in the interface.
- The intro text, the search placeholder, and the no-matches text describe the selected grouping.
- Branches start collapsed. Expanding is per node, at any depth; **Expand all** opens every group and
  branch, and **Collapse all** closes them. The opened nodes are shared by the two views of one
  grouping, so switching Tree ↔ Graph keeps them. Each grouping keeps its own opened nodes, so
  Location → Category → Location restores both. They are kept while the page stays open but not
  across a reload.
- The page shows a loading state, an error with **Retry**, an empty-inventory state with **Add item**,
  and the no-matches state.

### Location grouping

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
- **Search hierarchy** matches item names and location names, ignoring case. An item match is shown
  together with its location and its whole container path, which are expanded automatically; matches
  among loose items open their location's group. A matching container keeps its contents available,
  collapsed. A matching location is highlighted and opened one level, with all of its branches
  available. The **No location** label is interface text and is not searched.

### Category grouping

- Every category that has items is one virtual node under **Inventory**, with a tag icon, sorted by
  name. Its identity is the category id (`category:<id>`), never its name, so two categories with the
  same name stay two nodes. Categories without items have no node, just as empty locations have none.
- A category node counts every item assigned to that category, wherever it is stored and whatever
  contains it; virtual nodes are never counted.
- **Same-category containment rule.** An item is shown under its direct parent only when the parent
  belongs to the same category; otherwise it is a root item directly under its own category. The
  rule applies at any depth, so a PC → motherboard → CPU chain of one category stays nested.
- **Cross-category containment is metadata only.** A container of another category is never copied
  into the category: a camera stored in a box of the Containers category is a root of Photography,
  and the box appears only under Containers.
- **Direct parent only.** No relation is inferred by skipping an intermediate parent of another
  category: in Camera [Photography] → Camera Bag [Containers] → Lens [Photography], the camera and the
  lens are both roots of Photography.
- **No duplication.** Every item appears exactly once, under its own category.
- Item rows show the effective location and, when the item has a direct container that is not the
  parent shown, *Stored inside: &lt;container&gt;*. The category name is left out, because the row is
  already under it. The contents count of a row, and the expandable children, are the same-category
  children in this projection, never the physical `children_count`.
- There are no **Uncontained items** groups; items without a valid same-category parent are simply
  listed under their category.
- **Search hierarchy** matches item names and category names. An item match is shown with its
  category and same-category ancestors, which are expanded; cross-category physical parents are never
  inserted into the path. A matching category is highlighted and opened one level. Changing **Group
  by** during a search recomputes the result for the new grouping.
- Category grouping is read-only: nothing can be recategorized or reparented from it.

### Tree

- Location and category rows have a tinted background, their icon (a pin, a crossed-out pin for **No
  location**, or a tag), the name, and the item count badge.
- Every item row shows an expand/collapse button when it has contents in the current grouping, the
  first photo or a container/item icon, the name, the secondary line (category and location in
  Location grouping; location and *Stored inside* in Category grouping), and the number of its
  contents in the current grouping. The name links to the regular item page. There is no expansion
  threshold.
- Toggles are named *Expand/Collapse &lt;name&gt;*; a group's name includes its location, for example
  *Expand Uncontained items — Garage*.
- On a phone the rows are indented by a smaller step that stops growing after six levels, so deep
  chains never need sideways scrolling, and the switches wrap under the search.

### Graph

- A left-to-right tree diagram: **Inventory** is on the left, then the location or category column,
  then each nesting level of the grouping. A parent sits midway along its children. Arrows run from
  the root to each group node, and from a group or item to each child shown under it; in Category
  grouping an item arrow exists only for a direct same-category parent.
- Nodes are compact Tabler cards of a fixed size. Location nodes have an azure border and pin icon,
  category nodes a purple border and tag icon, each with the name and the total item count. Item
  nodes show the first photo or an icon, the name (truncated, with the full name as a tooltip), the
  number of contents in the grouping, and the same secondary line as the tree. Items with contents
  have a coloured left edge and a box icon; leaves a plain border and an item icon. **Inventory** and
  **Uncontained items** have dashed borders.
- Each node with visible contents has a **+**/**−** button named *Expand/Collapse &lt;name&gt;*.
  Collapsing removes the descendants from the graph and the layout closes the gap. The toggled node
  stays in place, unless the contents it opened would fall outside the pane, which is then fitted
  to them.
- Drag the background to pan, scroll or pinch to zoom (10%–200%); buttons zoom in, zoom out, and
  **Fit to view**. The graph fits itself when it opens, after **Expand all**/**Collapse all**, and
  when the search changes; a search fits its matches and their paths and never zooms in past 100%.
- Clicking a node selects it (outlined); clicking an item name, or double-clicking an item node, opens
  the item page. Double-clicking a location, category, or group opens nothing. Matches of the search
  are highlighted in yellow.
- The pane is a region named *Storage graph* in Location grouping and *Category graph* in Category
  grouping. Its height follows the window (`clamp(22rem, 65vh, 44rem)`) and the page never scrolls
  sideways; on a phone the graph fits smaller and stays pannable, and the controls stay above it.
- More than 500 visible nodes show a warning asking to collapse branches, search, or use the Tree,
  instead of drawing the graph and freezing the browser. Group nodes count toward it.
- The graph is read-only: nodes cannot be dragged, connected, or deleted, and nothing is written.

## Implementation overview

- `GET /api/items/hierarchy` answers `{ items: [...] }`, one flat node per item with `id`, `uuid`,
  `name`, `parent_id`, `category_id`, `category_name`, `thumbnail_id` (the [cover photo](item-photo-order.md) or `null`),
  `effective_location`, and `children_count` (direct physical contents). Nodes are never nested in
  the response, so any projection derives its own structure from `parent_id`. The route is
  registered before `/api/items/:id`. Neither grouping needs more: the direct container's name is read
  from the same response, so the endpoint is unchanged and there is no request per category or item.
- `ItemRepository.listHierarchy()` reads every node in one statement. It reuses `ROOTS_CTE` for the
  root that provides the effective location, a grouped join for the child count, and the shared
  indexed cover-photo lookup, so there is no query per item or per location and no photo data is read.
  `ItemService.hierarchy()` maps the root location with the same rule as the items list.
- `client/src/hierarchyTree.js` holds the pure hierarchy rules. Both projections are built by one
  internal `project()` that keeps a `parent_id` link only when the projection's rule allows it, groups
  every remaining root item, and returns the same normalized tree: `mode`, `byId`, the projection's
  `children` and `parentOf`, `groups` (each with its `type`, `key`, `name`, root `branches`, root
  `leaves` and `leavesKey` for Uncontained items, and total `itemCount`), and `groupOf` for every item
  reachable from a root.
  - `buildLocationTree()` keeps every link and groups the roots by
    `normalizeLocation(effective_location)` (trimmed and lower-cased; empty means no location), with
    leaf roots gathered in the location's Uncontained items. It names each location by its most used
    spelling, sorts named locations by name, and puts No location last.
  - `buildCategoryTree()` keeps a link only when the parent has the same `category_id`, groups the
    roots by `category_id`, and sorts the categories by name, then id. Its groups have no
    Uncontained items.
  - Virtual keys are strings and item keys are numbers, so they never collide: `inventory` (`ROOT`),
    `location:<normalized>` (`locationKey()`), `uncontained:<normalized>` (`uncontainedKey()`), and
    `category:<id>` (`categoryKey()`). A named location's normalized text is never empty, so
    `location:` and `uncontained:` are the reserved keys of No location.
  - `searchTree()`, `expandableKeys()`, and `visibleRows()` work on either tree without knowing its
    grouping. Search returns the matches (item ids and group keys), the visible items, and the path to
    expand, following the projection's `parentOf`. `visibleRows()` walks only expanded nodes, so
    collapsed descendants are never rendered, and gives each row its `type` (`location`, `category`,
    `uncontained`, or `item`), group, depth, parent row key, and visible `childCount`; item rows also
    carry `contentCount` (children in the projection) and `storedIn` (the direct physical container
    when it is not the parent row). `rowName()` and `itemMeta()` give both views the same accessible
    names and secondary lines. A damaged cyclic chain cannot loop the ancestor walk.
- `client/src/useHierarchyExpansion.js` keeps one browsing expansion set per grouping and one search
  set, and exposes the visible rows with toggle, expand-all, and collapse-all actions.
  `client/src/pages/Hierarchy.vue` loads the nodes once and owns the two address-backed switches, the
  projection, the search, and the expansion, and passes the same rows to either view.
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
- Neither view component implements a grouping rule; they render the normalized rows and receive only
  the grouping name for the graph region's label.

## Verification

- `test/hierarchy.test.js` covers the endpoint shape, the first photo, child counts, the effective
  location matching the items list, a single statement over 30 nesting levels with nothing written
  and the grouping built from that one response, and real endpoint data grouped by the top-level
  location with spaced legacy text and saved nested locations left untouched. The Location rules
  cover the empty tree; named locations as virtual root-level nodes with per-location groups, reserved
  keys, and no global group; normalization, the deterministic display name, blank and null locations
  under No location, and unmodified items; branches kept whole under the top-level location with
  descendant counts and 200-level nesting; row names; search with the location and ancestor path; and
  search by location name. The Category rules cover one id-keyed node per category with its count,
  same-name categories, direct same-category nesting at several depths, cross-category parents
  becoming roots and never entering another category, no nesting across an intermediate
  cross-category parent, every item exactly once, projection child counts versus the physical
  `children_count`, location and *Stored inside* metadata, item and category search with
  same-category paths, the same query in both groupings, real endpoint data with nothing written, and
  separate per-grouping expansion with a search recomputed on switching. The graph layout covers
  location nodes under the root, edges matching `parent_id` at every level, category-projection edges
  and deterministic layout, collapse and expansion with a deterministic re-layout, no overlapping
  nodes, a search revealing a nested match or a location and the fitted viewport, and the node limit
  for a large location and a large category.
- `test/e2e.test.js` reads the endpoint over HTTP in the nesting acceptance test.
- `test/e2e/hierarchy.spec.js` covers the Location tree (navigation, a location row with its count,
  two spellings in one location, no global group, expanding a location and opening a nested item, the
  location's own Uncontained items group, **Expand all**/**Collapse all**, no write requests, search
  with the location path, search by location name, No location, no matches, clearing a search, a
  ten-level chain on a phone), the Location graph (the root and location nodes with their count,
  collapse and expansion, expansion kept when switching to the Tree, search highlighting, the zoom and
  fit controls, opening an item and returning with **Back**, double-clicks, a phone without sideways
  scrolling), and the Category grouping: switching to Category Tree, a category row counting only its
  items, expanding the category and a same-category nested item, *Stored inside* metadata for a
  cross-category container, the container shown only under its own category, opening an item and
  returning to the grouping with **Back**, Category Graph with its count, an item search in the graph
  without the cross-category container, switching back to Location with the physical path intact, no
  write requests, and the fallback of unknown address values. `test/e2e/bulk-move.spec.js` reads a
  moved subtree under its new location.

## Notes and limitations

- Both groupings are read-only. Location nodes cannot be renamed, merged, or dropped onto; to move
  something to another location, change its **Location** (or its outermost container's) in the item
  form. Category nodes cannot be renamed or dropped onto; change an item's category in the item form.
  Drag & drop is specified for Phase 3 and belongs to the Location grouping only; Category grouping
  stays read-only.
- Locations are flat free text: there are no nested locations, addresses, or location records.
- Category grouping shows only direct same-category containment. It has no secondary storage links,
  relation types (*part of*, *installed in*), tags, or multiple categories per item.
- Only item names and location or category names are searched; the broader **Items** search is not
  used.
- Items are not moved, reordered, or edited from either view; use **Stored inside** in the item form,
  or **Move to…** on the **Items** list for several items at once (see
  [Nested items](nested-items.md#bulk-move)). Both views read the result on their next load, and a
  bulk move keeps selected subtrees intact, so descendants stay below the same moved roots, follow the
  location of their new outermost container, and search paths follow the new containers.
- Graph node positions are computed, never saved, and there is no minimap.
- The graph draws at most 500 visible nodes at once; wide or fully expanded inventories are better
  read in the Tree, which has no limit.
- Rows that belong to a damaged cycle, which the API cannot create, are not shown and are not matched
  by a search, because no root item leads to them. Nothing is repaired automatically.
- All nodes are loaded in one request; branches are not loaded lazily.
- Containment itself is described in [Nested items](nested-items.md), and the displayed location in
  [Effective location inheritance](effective-location-inheritance.md).
