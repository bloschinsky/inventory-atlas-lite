# TASK: Hierarchy — Phase 3: Location-Aware Drag & Drop Hierarchy Management

**Status:** Planned
**Priority:** Medium
**Type:** Feature / hierarchy editing
**Phase:** 3 of 3
**Blocked by:** None. Phases 1 and 2 and Hierarchy Location Grouping are complete; see
`docs/features/hierarchy.md`.

---

## Goal

Add safe drag & drop hierarchy editing to the existing, Location-grouped Hierarchy feature.

Users should be able to store an item/container inside another item, or place it at the top level of
a Location, without opening the normal Edit Item form.

Structural changes continue to use the existing `parent_item_id` model and the existing server-side
self/cycle protection (`ItemService.assertCanContain`). Location changes continue to use the existing
free-text `items.location` field. No location entity is introduced.

---

## Dependency

Phase 3 depends on the completed Hierarchy Location Grouping task and builds on its canonical
hierarchy:

```text
Inventory
→ Location
→ container / Uncontained
→ nested items
```

It builds on:

- the Phase 1 Tree view and flat `GET /api/items/hierarchy` endpoint;
- the Phase 2 shared Tree/Graph frontend model;
- the Location grouping model in `client/src/hierarchyTree.js`: virtual Location nodes grouped by the
  normalized effective location of each top-level branch, the reserved No location node, one virtual
  `Uncontained items` group per Location, and the stable string keys `inventory`,
  `location:<normalized>`, and `uncontained:<normalized>` (No location uses `location:` and
  `uncontained:`);
- the existing containment rule `ItemService.assertCanContain`, shared by the item form and Bulk Move.

Do not create a second hierarchy mutation system, and do not duplicate the Location grouping rules in
view components.

There is no global `Inventory → Uncontained items` group any more. Every reference to Uncontained
items in this task means the virtual group of one Location.

---

## Two mutation concepts

A drop always means exactly one of two operations. The target type decides which, never a guess based
on a key or an ID.

### Structural reparenting — "Store inside"

Dropping onto a **real item** means:

```text
parent_item_id = targetItem.id
```

This changes containment only. The moved item's saved `location` is not rewritten.

Existing self-parent and cycle protection applies and remains authoritative.

### Placement at a Location — "Move to location"

Dropping onto a **virtual Location node** can never mean `parent_item_id = location`. It means:

```text
parent_item_id = NULL
saved location = target Location
```

This is a placement/location change, not containment.

The saved value is the target Location's displayed name (one of the spellings already stored, see
`docs/features/hierarchy.md`), validated and trimmed by the existing item location rules. If the item
is already a top-level item whose normalized saved location equals the target's normalized location,
nothing is written.

### Per-location `Uncontained items`

Dropping onto a Location's virtual `Uncontained items` group is equivalent to dropping onto that
Location:

```text
parent_item_id = NULL
location = target Location
```

A container dropped there appears as a branch of that Location after the move (it is not a leaf); a
leaf appears inside the group.

### `No location`

Dropping onto the virtual `No location` node, or onto its `Uncontained items` group, means:

```text
parent_item_id = NULL
location = NULL (empty according to the existing validation rules)
```

Never persist the visible label `"No location"`.

### Virtual nodes are never IDs

No virtual node key (`inventory`, `location:*`, `uncontained:*`) may ever be persisted as, or sent
as, `parent_item_id`. The virtual `Inventory` root is not a drop target in Phase 3, because a
top-level placement must always name its Location.

---

## Worked examples

### Move a leaf into another item

```text
Home
├─ Box A
│  └─ Camera
└─ Box B
```

Drag `Camera` onto `Box B`:

```text
Camera.parent_item_id = BoxB.id
```

### Move a subtree between Locations

```text
Home
└─ Box A
   └─ Camera
```

Drag `Box A` onto `KP Garage`. Expected persistence:

- `Box A.parent_item_id = NULL`;
- `Box A.location = "KP Garage"`;
- descendants remain structurally unchanged;
- descendants inherit the new effective Location automatically;
- descendant saved locations are not rewritten.

### Move into a container in another Location

```text
Home
└─ Box A

KP Garage
└─ Box B
```

Drag `Box A` onto `Box B`. Expected persistence:

```text
Box A.parent_item_id = BoxB.id
```

Do not rewrite `Box A.location`. After the move, `Box A` and its descendants appear under `KP Garage`
through the existing effective-location inheritance.

### Take a contained item out to a Location

```text
KP Garage
└─ Box B
   └─ Car battery
```

Drag `Car battery` onto `Home` (or onto `Home`'s Uncontained items):

```text
Car battery.parent_item_id = NULL
Car battery.location = "Home"
```

It appears in `Home`'s Uncontained items group.

---

## Tree vs Graph editing

### Tree

Tree view is the primary drag & drop editing surface. Implement both mutation concepts here first and
make them robust.

### Graph

Graph may support structural drag/drop only if the behavior is unambiguous and Vue Flow supports it
cleanly. If Graph node dragging would be confused with canvas positioning, do not overload the same
gesture with hierarchy mutation.

Acceptable Phase 3 result:

- Tree supports drag/drop to real items, Locations, and per-location Uncontained groups;
- Graph remains navigation/read-only for structure, and regroups after a move made elsewhere.

Document the decision. Do not compromise Tree UX just to force identical interaction into Graph.

---

## Drop targets

Valid targets, each with its own meaning and visual treatment:

| Target | Meaning | Action label |
| --- | --- | --- |
| Real item/container | `parent_item_id = target.id` | Store inside |
| Location node | `parent_item_id = NULL`, `location = target` | Move to location |
| Location's Uncontained items | same as its Location | Move to location |
| No location / its Uncontained items | `parent_item_id = NULL`, `location = NULL` | Move to location |
| Invalid target | nothing | not allowed |

Invalid targets include the dragged item itself, any of its descendants, the virtual `Inventory` root,
and a real item that is already the dragged item's direct container (a no-op).

---

## Validation

The client may prevent obviously invalid drops for UX, but the server remains authoritative and
validates against the current database state.

Reject at minimum:

- dropping an item onto itself;
- dropping a parent into one of its descendants;
- unknown source item;
- unknown target item;
- a request that is neither an explicit container nor an explicit location placement;
- a virtual node key or any non-integer sent as a database ID;
- an invalid location value according to the existing item validation.

Existing cycle protection (`assertCanContain`) must remain the final authority.

Example that must fail:

```text
Box A
└─ Box B
```

Dragging `Box A` into `Box B` must be rejected.

---

## Backend mutation API

A parent-only endpoint is insufficient, because a Location drop changes both `parent_item_id` and
`location`. Use one unified, explicit placement endpoint:

```text
PATCH /api/items/:id/placement
```

Store inside a real item:

```json
{ "kind": "container", "parent_item_id": 42 }
```

Place at a Location (top level):

```json
{ "kind": "location", "location": "KP Garage" }
```

Place under No location:

```json
{ "kind": "location", "location": null }
```

Rules:

1. `kind` is required and decides the operation; the server never infers it from the value.
2. `kind: "container"` requires a positive integer `parent_item_id`, validates it with
   `assertCanContain`, and changes only `parent_item_id`.
3. `kind: "location"` sets `parent_item_id = NULL` and the validated `location`; an empty or blank
   string is stored as `NULL`. It never accepts `parent_item_id`.
4. The endpoint loads the item, validates, and writes in one transaction over the current database
   state, touching only `parent_item_id`, `location`, and `updated_at`. No descendant row is written.
5. It returns the updated hierarchy-relevant item summary (`id`, `parent_id`, saved `location`, and
   `effective_location`).
6. Errors use the existing `{ error: { code, params } }` contract, reusing the current containment codes
   and adding new codes (in English and Ukrainian) only for the new request shape.

Reuse existing service and repository logic (`assertCanContain`, `setParent`, the location validation
of `shared/itemValidation.js`). Do not duplicate cycle algorithms across endpoints. The existing
`PUT /api/items/:id` and `PATCH /api/items/bulk-parent` stay unchanged.

---

## Optimistic vs confirmed UI

Prefer safe confirmed behavior over fragile optimism.

Recommended flow:

1. user drops a node;
2. UI shows a pending state on the moved node and the target;
3. API confirms the placement;
4. the page re-fetches the lightweight hierarchy endpoint (or updates the normalized model) and the
   shared model regroups;
5. on failure, the original position remains and an error is shown.

Never leave Tree/Graph visually showing a move that the server rejected.

---

## Drag UX

Provide clear, visibly different states:

- draggable item;
- active real-item target, labelled **Store inside**;
- active Location target, labelled **Move to location**;
- active per-location Uncontained target, labelled **Move to location** with its Location name;
- invalid target;
- saving/pending state.

The UI must make it obvious before the drop whether the action means **Store inside** or
**Move to location**, and which Location or item is the target.

Avoid requiring pixel-perfect placement. A node with children remains draggable as one subtree.
Location nodes and Uncontained groups are targets only; they are never draggable.

Touch behavior should be considered for tablets/phones. If reliable touch drag/drop is not feasible,
the fallback below is required.

---

## Mobile / keyboard fallback

Do not make drag & drop the only possible interaction. Provide one explicit placement dialog opened
from an item row, for example **Move to…**, that offers both concepts:

```text
Move to container…
Move to location…
```

The dialog must:

- let the user choose a real container (searchable, excluding the item and its descendants, as the
  existing Bulk Move destination picker does) — **Store inside**;
- let the user choose an existing Location or **No location**, or type a new location text —
  **Move to location**;
- state which of the two operations will happen before confirming;
- use the same `PATCH /api/items/:id/placement` endpoint.

Reuse the Bulk Move destination search where practical instead of building a second picker.

---

## Confirmation

Normal valid moves do not need an extra confirmation modal for every drag. Optional confirmation is
acceptable for moving a very large subtree, but do not overcomplicate the common case.

---

## Effective Location

Do not manually rewrite descendant locations. Saved descendant `location` values remain untouched in
every operation.

- Store inside: the moved subtree's effective Location becomes that of the target's outermost
  container.
- Move to location: the moved item's saved location changes, and its descendants inherit it as their
  effective Location.

Add regression coverage for both.

---

## Refresh / consistency

After a successful move, without a full browser reload:

- Tree and Graph immediately regroup under the new Location;
- Location item counts update;
- search results and ancestor paths, including the Location ancestor, update;
- child counts update;
- per-location `Uncontained items` membership updates;
- Item Details `Stored inside`, `Location`, and `Contents` stay consistent;
- the Items list shows the new Stored inside and effective location on its next load.

Prefer re-fetching the lightweight hierarchy endpoint, so all grouping stays in the shared model.

---

## Concurrency / stale state

The server must validate against the current database state at the moment of the move. Do not rely
solely on the client's previously loaded hierarchy. If the target or item changed or disappeared, fail
clearly and refresh/reconcile the hierarchy.

---

## Tests

Add automated coverage for at least:

1. moving a leaf between Location groups;
2. moving a top-level container/subtree to another Location;
3. descendant effective Location changing without rewriting descendant saved Locations;
4. moving a branch into a real container in another Location;
5. moving an item to a per-location Uncontained group;
6. moving an item to `No location` (saved location becomes `NULL`, never the label);
7. virtual Location/Uncontained/Inventory keys never being persisted as `parent_item_id`, and a
   placement request without an explicit `kind` being rejected;
8. cycle protection still applying to real-item drops (self and descendant targets);
9. Tree and Graph regrouping immediately after the move;
10. Location counts updating after moves;
11. search ancestor paths updating after Location changes;
12. mobile/keyboard fallback supporting both **Move to container…** and **Move to location…**;
13. unknown source or target item rejection;
14. a failed move keeping the original UI structure;
15. Item Details reflecting the new `Stored inside` and `Location`;
16. existing Edit Item parent and location editing, and Bulk Move, still working.

Add E2E drag/drop coverage for at least one valid **Store inside**, one valid **Move to location**, and
one rejected cycle attempt.

---

## Documentation

Update:

```text
docs/features/hierarchy.md
docs/features/nested-items.md
docs/features/effective-location-inheritance.md
docs/HOW-TO.md
```

Add:

```text
docs/changes/<date>-hierarchy-phase-3-drag-drop.md
```

Document:

- the two mutation concepts and their drop targets;
- per-location Uncontained and No location semantics;
- subtree moves and cycle protection;
- the placement endpoint;
- the Graph editing decision;
- the mobile/keyboard fallback;
- effective Location consequences.

---

## Acceptance Criteria

1. Hierarchy Location Grouping is complete first (done).
2. Tree supports moving items by drag & drop onto real items, Locations, and per-location
   Uncontained groups.
3. Dropping onto a real item changes only `parent_item_id`.
4. Dropping onto a Location, its Uncontained group, or No location sets `parent_item_id = NULL` and
   the saved location (or `NULL`), and never persists a virtual key or label.
5. Moving a container moves its subtree without rewriting descendants.
6. Existing server-side self/cycle protection remains authoritative.
7. One explicit placement endpoint (`PATCH /api/items/:id/placement`) is used by drag & drop and the
   fallback.
8. The UI distinguishes **Store inside**, **Move to location**, and invalid targets before the drop.
9. Failed moves never leave incorrect visual hierarchy.
10. Location grouping, counts, per-location Uncontained groups, child counts, search paths, Item
    Details, and Graph remain consistent after a move.
11. Effective Location updates through existing inheritance only.
12. A non-drag placement fallback supporting both concepts exists for accessibility/mobile use.
13. Tests, docs, lint, and E2E pass.

---

## Out of Scope

Do not add in Phase 3:

- a `locations` table, location IDs, or location CRUD;
- nested Locations;
- renaming or merging Locations from the Hierarchy page;
- multi-select drag & drop (Bulk Move on **Items** already covers several items);
- multiple parents per item;
- arbitrary graph relationships;
- manual graph edge creation;
- saved free-form graph coordinates;
- new container database entity;
- undo/redo history.
