# TASK: Hierarchy — Phase 1: Storage Tree

**Status:** Planned
**Priority:** High
**Type:** Feature / navigation
**Phase:** 1 of 3
**Blocked by:** None
**Related:** `TASK-HIERARCHY-PHASE-2-GRAPH-VIEW.md`, `TASK-HIERARCHY-PHASE-3-DRAG-DROP.md`

---

## Goal

Add a new **Hierarchy** section that visualizes the existing `parent_item_id` relationships as a practical expandable storage tree.

This phase is read-only.

It must make it easy to answer:

- what is inside a container;
- where an item sits in the containment hierarchy;
- what top-level containers exist;
- which items are currently not stored inside anything.

Do not change the existing nesting model or create a separate container entity.

---

## Existing model to reuse

The application already has:

```text
items.parent_item_id
```

with:

- one direct parent maximum per item;
- unlimited nesting depth;
- server-side self-parent/cycle protection;
- `Stored inside`;
- child lists;
- effective Location inheritance.

Phase 1 must reuse this source of truth.

No database schema change is expected.

---

## Navigation

Add a top-level application page:

```text
Hierarchy
```

Suggested route:

```text
/hierarchy
```

Use existing Tabler navigation/layout conventions.

The page should default to **Tree** view.

Design the page so Phase 2 can later add a second view selector:

```text
Tree | Graph
```

Do not implement Graph in Phase 1.

---

## Tree model

Represent the inventory as a forest under one virtual UI root.

Example:

```text
Inventory
├─ Box A
│  ├─ Camera Bag
│  │  ├─ Nikon F80
│  │  └─ Nikon 50mm
│  └─ VHS tapes
│
├─ Box B
│  └─ ThinkPad T460s
│
└─ Uncontained items
   ├─ Keyboard
   ├─ Book
   └─ Coffee mug
```

### Virtual root

`Inventory` is a UI concept only.

Do not create it as an item/database record.

### Top-level containers

A top-level item with one or more children must appear directly under `Inventory`.

Example:

```text
Box A
Box B
Shelf Unit
Camera Case
```

### Uncontained items

Top-level leaf items (`parent_item_id IS NULL` and no children) must be grouped under one virtual node:

```text
Uncontained items
```

This prevents hundreds of unrelated leaf records from flooding the root level.

`Uncontained items` must not exist in the database.

Show its item count.

---

## Hierarchy API

Do not build the hierarchy from the existing paginated Items endpoint.

Add a dedicated lightweight hierarchy read endpoint.

Suggested route:

```text
GET /api/items/hierarchy
```

Return only data required by hierarchy views.

Suggested flat response:

```json
{
  "items": [
    {
      "id": 10,
      "uuid": "...",
      "name": "Box A",
      "parent_id": null,
      "category_name": "Containers",
      "thumbnail_id": 44,
      "effective_location": "KP Garage",
      "children_count": 2
    }
  ]
}
```

A flat response is preferred because both Tree and future Graph view can derive their own structure from the same payload.

Do not recursively duplicate full nested objects in the API response.

### Required data

Include enough information for Tree/Graph nodes without additional request-per-node behavior:

- `id`
- `uuid`
- `name`
- `parent_id`
- category summary/name
- thumbnail reference/ID when available
- effective Location
- direct child count

Optionally include descendant count if it can be calculated efficiently and is useful in the UI.

Avoid N+1 queries.

---

## Tree UI

Each real item node should show at minimum:

- expand/collapse control when it has children;
- thumbnail or category/item icon fallback;
- item name;
- child count when useful.

Optional secondary information:

- category;
- effective Location.

Clicking the item name/node must open the existing Item Details page.

### Expand/collapse

Support arbitrary existing nesting depth.

The UI must not assume a fixed maximum depth.

Provide convenient controls:

```text
Expand all
Collapse all
```

If expanding the entire tree becomes impractical with larger inventories, the implementation may limit automatic "Expand all" behavior and document the threshold.

---

## Search

Add hierarchy search.

Searching for an item must:

1. find matching item nodes;
2. keep/show the ancestor path required to understand context;
3. automatically expand matching paths.

Example search result:

```text
Box A
└─ Camera Bag
   └─ Nikon F80
```

Do not show `Nikon F80` without its hierarchy context when the parent chain is available.

Search should match at least item name.

Reusing broader existing text search is optional, but do not make Phase 1 dependent on it.

---

## State and UX

Prefer keeping expanded/collapsed state while the user stays on the page.

Optional local persistence across reload is acceptable but not required for Phase 1.

Provide proper states for:

- loading;
- empty inventory;
- no search matches;
- API error.

The page must remain usable on narrow/mobile screens.

Avoid a layout that requires a huge fixed-width canvas.

---

## Performance

The inventory is currently a personal/self-hosted SQLite dataset.

For Phase 1, loading all lightweight hierarchy records in one request is acceptable.

Implementation must still:

- avoid loading full item details/photos;
- avoid N+1 queries;
- avoid rendering hidden descendants unnecessarily where practical.

Do not implement lazy server-side branch loading unless measurements show it is needed.

Keep the API shape compatible with a later lazy-loading strategy if practical.

---

## Safety / consistency

The tree is a visualization of existing parent relationships only.

Do not:

- write `parent_item_id`;
- silently repair hierarchy data;
- create virtual nodes in SQLite;
- duplicate Location inheritance logic on the client.

Use server-provided `effective_location`.

Existing cycle protection and item editing behavior remain unchanged.

---

## Tests

Add automated coverage for at least:

1. empty hierarchy;
2. one top-level leaf goes under `Uncontained items`;
3. multiple top-level leaves share one virtual `Uncontained items` node;
4. top-level item with children appears directly under Inventory;
5. multi-level nesting;
6. arbitrary/deep nesting works;
7. item links open Item Details;
8. search reveals the full ancestor path;
9. effective Location comes from existing inheritance behavior;
10. hierarchy endpoint avoids N+1 behavior;
11. no writes occur from Tree interactions;
12. mobile/narrow layout remains usable.

Add E2E coverage for expanding a container and navigating to a nested item.

---

## Documentation

Add/update:

```text
docs/features/hierarchy.md
docs/changes/<date>-hierarchy-phase-1-storage-tree.md
```

Document:

- virtual Inventory root;
- virtual `Uncontained items`;
- top-level container rule;
- search behavior;
- read-only limitation;
- relationship to existing Nested Items feature.

---

## Acceptance Criteria

1. New `Hierarchy` page exists.
2. Phase 1 provides a read-only Tree view.
3. Existing `parent_item_id` is the only containment source of truth.
4. Top-level items with children are direct root branches.
5. Top-level leaf items are grouped under virtual `Uncontained items`.
6. Virtual nodes are never persisted.
7. Unlimited existing nesting depth is represented correctly.
8. Search reveals matching items with ancestor context.
9. Nodes link to existing Item Details.
10. Dedicated lightweight API avoids paginated Items endpoint and N+1 requests.
11. No schema migration is required unless implementation discovers a documented blocker.
12. Tests, docs, lint, and E2E pass.

---

## Out of Scope

Do not implement in Phase 1:

- graph/canvas visualization;
- drag & drop;
- moving items;
- bulk moving;
- editing hierarchy inline;
- new container entity;
- graph database;
- 3D rendering.
