# TASK: Hierarchy — Phase 2: Interactive Graph View

**Status:** Planned
**Priority:** Medium
**Type:** Feature / visualization
**Phase:** 2 of 3
**Blocked by:** `TASK-HIERARCHY-PHASE-1-STORAGE-TREE.md`
**Related:** `TASK-HIERARCHY-PHASE-3-DRAG-DROP.md`

---

## Goal

Extend the Phase 1 **Hierarchy** page with an interactive visual graph of the same existing item containment relationships.

Add a view switch:

```text
Tree | Graph
```

Tree remains the practical default.

Graph is an alternative visual navigation mode, not a separate data model.

---

## Dependency

Do not start this phase until Phase 1 is complete.

Phase 2 must reuse:

- the Phase 1 Hierarchy route/page;
- the Phase 1 hierarchy API;
- the same `parent_item_id` relationships;
- the same virtual root/grouping semantics where applicable;
- existing Item Details navigation.

Do not add a second hierarchy backend model solely for Graph view.

---

## Visualization model

Each real item is a graph node.

Each containment relationship is an edge:

```text
Parent -> Child
```

Example:

```text
          Box A
         /     \
 Camera Bag    Cables
    /   \
Nikon   50mm
```

The graph must represent a hierarchy/tree layout rather than a generic force-directed social-network graph.

Prefer deterministic top-down or left-to-right layout.

---

## Library

Evaluate and use a maintained Vue 3-compatible node/edge library such as **Vue Flow**, unless there is a strong documented reason to implement the canvas layer differently.

If adding a dependency:

- pin/lock it through the existing package workflow;
- verify license compatibility;
- document why it was selected;
- keep library-specific code isolated from hierarchy-domain logic.

Do not add 3D/WebGL rendering.

---

## Graph page behavior

Within the existing `/hierarchy` page provide:

```text
Tree | Graph
```

Switching modes should not require navigating to a separate unrelated section.

Graph must support at least:

- pan;
- zoom;
- fit-to-view;
- selectable nodes;
- clicking/opening Item Details;
- readable parent-child edges;
- clear root-to-leaf direction.

A minimap is optional.

---

## Nodes

Use compact custom nodes consistent with Tabler styling.

Each node should show at minimum:

- item name;
- thumbnail or fallback icon;
- child count when relevant.

Optional compact metadata:

- category;
- effective Location.

Do not render large Item Details cards inside the graph.

### Visual distinction

Containers/items with children should be visually distinguishable from leaf items without creating a new persisted "container" type.

Use existing relationship state:

```text
children_count > 0
```

Do not infer container status from category name alone.

---

## Virtual nodes

Phase 1 groups top-level leaf records under virtual `Uncontained items`.

Graph view must avoid producing hundreds of root-level leaf nodes around the canvas.

Reuse the same concept:

```text
Inventory
├─ top-level container branches
└─ Uncontained items
```

`Inventory` and `Uncontained items` remain UI-only virtual nodes.

For very large uncontained sets, Graph may initially show the virtual group collapsed.

---

## Expand/collapse

Graph view should support collapsing branches so large inventories remain readable.

At minimum:

- top-level container branches can be collapsed/expanded;
- `Uncontained items` can be collapsed/expanded;
- collapsed state removes/hides descendants from layout rather than leaving invisible spacing.

Prefer re-layout after branch visibility changes.

---

## Search

Reuse Phase 1 hierarchy search behavior.

When searching in Graph mode:

- highlight matching node(s);
- reveal required ancestor chain;
- expand collapsed ancestors automatically;
- fit/focus the relevant area when practical.

Do not implement an unrelated second search engine.

---

## Layout

Use a hierarchy-appropriate deterministic layout.

Requirements:

- stable enough that nodes do not randomly jump every render;
- parent/child direction is obvious;
- overlapping nodes/labels are avoided;
- layout recomputes after expand/collapse;
- layout works for multiple top-level branches.

If a separate layout helper/library is added, justify it and verify its license.

Do not use a continuously simulated force layout unless there is a strong usability reason.

---

## Shared frontend model

Refactor Phase 1 hierarchy transformation logic if needed so Tree and Graph consume the same normalized hierarchy data.

Prefer a shared module/composable for:

- item-by-id map;
- child relationships;
- roots;
- ancestor lookup;
- search matches;
- virtual node construction;
- visibility/collapse rules.

Do not duplicate hierarchy-building algorithms independently in Tree and Graph components.

---

## Responsive behavior

Graph is primarily desktop/tablet oriented but must fail gracefully on narrow screens.

On phones:

- Graph may still be available with pan/zoom;
- Tree remains the recommended/default view;
- no page-breaking fixed canvas dimensions;
- controls must remain reachable.

Do not remove mobile access to Hierarchy because Graph is difficult on small screens.

---

## Performance

Graph rendering should remain responsive for a realistic personal inventory.

Requirements:

- do not create graph nodes for hidden collapsed descendants;
- do not fetch full item details/photos;
- do not perform network requests per node;
- avoid unnecessary full graph rebuilds for unrelated UI state changes.

If practical, add a warning/guard for extremely large all-expanded graphs rather than freezing the browser.

---

## Read-only phase

Phase 2 remains read-only.

Do not allow dragging nodes to change containment.

Node dragging, if the visualization library provides it by default, must either:

- be disabled; or
- be purely temporary visual positioning and clearly not persisted.

Prefer disabling structural drag behavior until Phase 3.

---

## Tests

Add automated coverage for at least:

1. Graph mode can be selected;
2. same hierarchy data produces correct parent-child edges;
3. top-level container branches are represented;
4. `Uncontained items` virtual group is represented;
5. multi-level relationships render correctly;
6. branch collapse hides descendants;
7. branch expansion restores descendants;
8. search highlights/reveals a nested match;
9. clicking a node opens Item Details;
10. Graph does not mutate `parent_item_id`;
11. switching Tree/Graph keeps the page functional;
12. large/collapsed graph does not render hidden descendants unnecessarily.

Add E2E coverage for switching to Graph, expanding a branch, and opening a nested item.

---

## Documentation

Update:

```text
docs/features/hierarchy.md
```

Add:

```text
docs/changes/<date>-hierarchy-phase-2-graph-view.md
```

Document:

- chosen graph library;
- layout strategy;
- virtual-node behavior;
- Graph limitations;
- Tree remains default;
- Graph is read-only until Phase 3.

---

## Acceptance Criteria

1. Phase 1 is complete first.
2. `/hierarchy` provides `Tree | Graph`.
3. Graph reuses the Phase 1 hierarchy API and domain model.
4. Parent-child relationships are visually clear.
5. Pan, zoom, fit-to-view, node selection/navigation work.
6. Branch collapse/expand works.
7. Search integrates with Graph mode.
8. Virtual root/uncontained grouping prevents root-level clutter.
9. Tree and Graph share normalized hierarchy logic instead of duplicating it.
10. Graph does not persist structural changes.
11. No graph database or 3D stack is introduced.
12. Tests, docs, lint, and E2E pass.

---

## Out of Scope

Do not implement in Phase 2:

- hierarchy drag & drop persistence;
- bulk move;
- free-form graph relations;
- multiple parents;
- graph database;
- 3D visualization;
- manual graph-layout persistence.
