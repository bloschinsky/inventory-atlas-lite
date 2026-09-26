# Hierarchy (Storage Tree)

## Summary

The **Hierarchy** page shows the whole inventory as an expandable, read-only storage tree built from
the existing **Stored inside** links. It answers what is inside a container, where an item sits in
the containment chain, which top-level containers exist, and which items are not inside anything.
It adds no container entity and no schema change: `items.parent_item_id` stays the only source of
containment.

## User-visible behaviour

- **Hierarchy** is a top-level navigation entry, after **Items**, at `/hierarchy`. The page opens on
  the Tree view.
- The tree is headed by **Inventory**, a virtual root that exists only in the interface.
- **Top-level containers** — items without a container that hold at least one item — are the
  branches directly under **Inventory**, sorted by name.
- **Uncontained items** — top-level items that hold nothing — are gathered in one virtual group at
  the end of the root level, with its item count, so hundreds of loose items never flood the root.
  The group is never stored anywhere.
- Every item row shows an expand/collapse button when it has contents, the first photo or a
  container/item icon, the name, the category, the effective location, and the number of direct
  contents. The name links to the regular item page.
- Branches start collapsed. Expanding is per node, at any depth; **Expand all** opens every branch and
  the group, and **Collapse all** closes them. There is no expansion threshold. The opened branches
  are kept while the page stays open, and are not saved across a reload.
- **Search hierarchy** matches item names, ignoring case. Each match is shown together with its whole
  container path, which is expanded automatically, and matches among uncontained items open the
  group. A matching container keeps its contents available, collapsed. **Expand all** and
  **Collapse all** then act on the search result only. Clearing the search returns to the branches
  that were open before it. A search without matches shows *No matching items*.
- The location is the effective location sent by the server — the outermost container's location, the
  same value as on **Items** and the item page. The browser never derives it.
- The page shows a loading state, an error with **Retry**, an empty-inventory state with **Add item**,
  and the no-matches state. On a phone the rows are indented by a smaller step that stops growing
  after six levels, so deep chains never need sideways scrolling.
- The tree is read-only: it never moves items or writes `parent_item_id`, and a tree interaction sends
  no request other than the initial read.

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
- `client/src/hierarchyTree.js` holds the pure tree rules: `buildTree()` (containers, the uncontained
  group, the child lists), `searchTree()` (matches, their ancestors and descendants, and the path to
  expand), `expandableKeys()`, and `visibleRows()`, which walks only expanded branches so collapsed
  descendants are never rendered. A damaged cyclic chain cannot loop the ancestor walk.
- `client/src/pages/Hierarchy.vue` loads the nodes and owns the search, so a second view of the same
  nodes can sit next to the tree later. `client/src/components/HierarchyTree.vue` renders the rows as
  one flat list indented by depth and keeps separate browsing and search expansion sets.
- The toggles are buttons named *Expand/Collapse &lt;name&gt;* with `aria-expanded`.

## Verification

- `test/hierarchy.test.js` covers the endpoint shape, the first photo, child counts, the effective
  location matching the items list, a single statement over 30 nesting levels with nothing written,
  and the client rules: the empty tree, one and several uncontained items in one group, containers as
  root branches, multi-level and 200-level nesting, collapsed branches, and search with ancestor paths
  and no matches.
- `test/e2e.test.js` reads the endpoint over HTTP in the nesting acceptance test.
- `test/e2e/hierarchy.spec.js` covers the navigation entry, expanding a container and opening a nested
  item, the uncontained group, **Expand all**/**Collapse all**, that no write request is sent, search
  revealing the path with the inherited location, the no-matches state, clearing a search, and a
  ten-level chain on a phone without sideways scrolling.

## Notes and limitations

- Only item names are searched; the broader **Items** search is not used.
- Items are not moved, reordered, or edited from the tree; use **Stored inside** in the item form.
- Rows that belong to a damaged cycle, which the API cannot create, are not shown because no top-level
  item leads to them. Nothing is repaired automatically.
- All nodes are loaded in one request; branches are not loaded lazily.
- Containment itself is described in [Nested items](nested-items.md), and the displayed location in
  [Effective location inheritance](effective-location-inheritance.md).
