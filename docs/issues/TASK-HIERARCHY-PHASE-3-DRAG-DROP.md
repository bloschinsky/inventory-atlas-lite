# TASK: Hierarchy — Phase 3: Drag & Drop Hierarchy Management

**Status:** Planned
**Priority:** Medium
**Type:** Feature / hierarchy editing
**Phase:** 3 of 3
**Blocked by:** None (Phases 1 and 2 are complete; see `docs/features/hierarchy.md`)

---

## Goal

Add safe drag & drop hierarchy editing to the existing Hierarchy feature.

Users should be able to move an item/container into another item or back to the top level without opening the normal Edit Item form.

All structural changes must continue to use the existing `parent_item_id` model and existing server-side cycle protection.

---

## Dependency

Do not start this phase until both previous phases are complete.

Phase 3 must build on:

- Phase 1 Tree view;
- Phase 1 hierarchy API/domain model;
- Phase 2 shared Tree/Graph hierarchy frontend model;
- existing `ItemService.resolveParentId` validation or its refactored equivalent.

Do not create a second hierarchy mutation system.

---

## Core behavior

Support these operations:

### Move into another item

Example:

```text
Before

Box A
└─ Camera

Box B
```

Drag `Camera` onto `Box B`:

```text
After

Box A

Box B
└─ Camera
```

Persist:

```text
Camera.parent_item_id = BoxB.id
```

### Move to top level

Allow an item to be removed from its parent.

Persist:

```text
parent_item_id = NULL
```

After the move:

- if the item has children, it appears as a top-level branch;
- if it is a leaf, it appears under virtual `Uncontained items`.

### Move a whole subtree

Moving an item that contains other items moves the subtree by changing only the moved item's direct `parent_item_id`.

Do not rewrite every descendant.

Existing effective Location inheritance should update naturally from the new root/container chain.

---

## Tree vs Graph editing

### Tree

Tree view is the primary drag & drop editing surface.

Implement structural drag/drop here first and make it robust.

### Graph

Graph may support structural drag/drop only if the behavior is unambiguous and the chosen graph library supports it cleanly.

If Graph node dragging is primarily used for canvas positioning, do not overload the same gesture with hierarchy mutation.

Acceptable Phase 3 result:

- Tree supports structural drag/drop;
- Graph remains navigation/read-only for structure.

Document the decision.

Do not compromise Tree UX just to force identical interaction into Graph.

---

## Drop targets

Valid targets:

- another real item;
- top-level/root drop zone.

Virtual `Inventory` may act as the top-level drop zone.

`Uncontained items` may also act as a convenience target meaning:

```text
parent_item_id = NULL
```

Do not persist either virtual node ID.

---

## Validation

The client may prevent obviously invalid drops for UX, but the server remains authoritative.

Reject at minimum:

- dropping an item onto itself;
- dropping a parent into one of its descendants;
- unknown source item;
- unknown target parent;
- invalid/non-item virtual target sent as a database ID.

Existing cycle protection must remain the final authority.

Example that must fail:

```text
Box A
└─ Box B
```

Dragging `Box A` into `Box B` must be rejected.

---

## Backend mutation API

Do not require the client to submit the entire item form merely to change hierarchy.

Add a focused move/reparent operation.

Suggested route:

```text
PATCH /api/items/:id/parent
```

Suggested body:

```json
{
  "parent_item_id": 42
}
```

or:

```json
{
  "parent_item_id": null
}
```

The endpoint must:

1. load/validate the item;
2. resolve/validate new parent;
3. enforce self/cycle protection;
4. update only hierarchy-related state;
5. return the updated hierarchy-relevant item summary.

Reuse existing service/repository logic where possible.

Do not duplicate cycle algorithms across endpoints.

---

## Optimistic vs confirmed UI

Prefer safe confirmed behavior over fragile optimism.

Recommended flow:

1. user drops node;
2. UI shows pending state;
3. API confirms move;
4. local hierarchy model updates;
5. on failure, original position remains/restores and an error is shown.

If optimistic movement is implemented, rollback must be deterministic.

Never leave Tree/Graph visually showing a move that the server rejected.

---

## Drag UX

Provide clear visual states:

- draggable item;
- active drop target;
- invalid drop target;
- root/top-level drop zone;
- saving/pending state.

Avoid requiring pixel-perfect placement.

A node with children remains draggable as one subtree.

Touch behavior should be considered for tablets/phones.

If reliable touch drag/drop is not feasible with the chosen implementation, provide a fallback action such as:

```text
Move to…
```

using the same parent selector and mutation endpoint.

Do not make hierarchy editing desktop-only without a fallback.

---

## Confirmation

Normal valid moves do not need an extra confirmation modal for every drag.

However, the UI should make the target obvious before drop.

Optional confirmation is acceptable for moving a very large subtree, but do not overcomplicate the common case.

---

## Effective Location

Do not manually rewrite descendant locations.

Example:

```text
KP Garage
└─ Box A
   └─ Camera
```

Move `Box A` under a container whose root Location is `Home`.

After the move, `Box A` descendants should display the new inherited effective Location through the existing inheritance system.

Saved `location` values remain untouched.

Add regression coverage for this behavior.

---

## Refresh / consistency

After a successful move:

- Tree must immediately reflect the new parent;
- search/ancestor paths must remain correct;
- child counts must update;
- `Uncontained items` membership must update;
- Graph must show the new relation when opened/refreshed;
- Item Details `Stored inside` and `Contents` must remain consistent.

Prefer updating the normalized hierarchy model or re-fetching the lightweight hierarchy endpoint.

Do not require a full browser reload.

---

## Concurrency / stale state

The server must validate against current database state at the moment of the move.

Do not rely solely on the client's previously loaded hierarchy.

If the target/item changed or disappeared, fail clearly and refresh/reconcile the hierarchy.

---

## Accessibility

Do not make drag & drop the only possible interaction.

Provide a keyboard/mobile-accessible fallback such as:

```text
Move to…
```

This action should:

- open a parent selector;
- allow Top level;
- exclude invalid descendants;
- use the same mutation endpoint.

---

## Tests

Add automated coverage for at least:

1. move leaf item from one parent to another;
2. move top-level leaf into a container;
3. move contained item to top level;
4. top-level leaf moves into `Uncontained items` grouping after parent clear;
5. move container with descendants by changing only its direct parent;
6. self-drop rejection;
7. descendant-cycle rejection;
8. unknown parent rejection;
9. failed move restores/keeps original UI structure;
10. child counts update;
11. search ancestor path updates;
12. Item Details reflects new `Stored inside`;
13. effective Location changes through inheritance without rewriting saved descendant locations;
14. Tree and Graph read the same updated structure;
15. keyboard/mobile `Move to…` fallback works;
16. existing Edit Item parent selection still works.

Add E2E drag/drop coverage for at least one valid move and one rejected cycle attempt.

---

## Documentation

Update:

```text
docs/features/hierarchy.md
docs/features/nested-items.md
```

Add:

```text
docs/changes/<date>-hierarchy-phase-3-drag-drop.md
```

Document:

- drag/drop semantics;
- top-level behavior;
- subtree moves;
- cycle protection;
- Graph editing decision;
- mobile/keyboard fallback;
- effective Location consequences.

---

## Acceptance Criteria

1. Phase 1 and Phase 2 are complete first.
2. Tree supports moving items by drag & drop.
3. User can move an item into another item.
4. User can move an item back to top level.
5. Moving a container moves its subtree without rewriting descendants.
6. Existing server-side self/cycle protection remains authoritative.
7. A focused hierarchy mutation endpoint is used.
8. Failed moves never leave incorrect visual hierarchy.
9. `Uncontained items`, child counts, search paths, Item Details, and Graph remain consistent after a move.
10. Effective Location updates through existing inheritance logic only.
11. A non-drag `Move to…` fallback exists for accessibility/mobile use.
12. Tests, docs, lint, and E2E pass.

---

## Out of Scope

Do not add in Phase 3:

- multi-select bulk move;
- multiple parents per item;
- arbitrary graph relationships;
- manual graph edge creation;
- saved free-form graph coordinates;
- new container database entity;
- undo/redo history.
