# TASK: Hierarchy — Add Location Grouping Layer Before Phase 3

**Status:** Planned
**Priority:** High
**Type:** Feature enhancement / hierarchy architecture
**Blocked by:** Hierarchy Phase 1 and Phase 2 must already be implemented
**Must be completed before:** `TASK-HIERARCHY-PHASE-3-DRAG-DROP.md`

---

## Goal

Upgrade the existing **Hierarchy** feature so the inventory is grouped by effective Location before showing containment branches.

Current hierarchy:

```text
Inventory
├─ Box A
│  └─ Camera
├─ Box B
│  └─ Cables
└─ Uncontained items
   ├─ Book
   └─ Keyboard
```

Target hierarchy:

```text
Inventory
│
├─ Home
│  ├─ Box A
│  │  └─ Camera
│  └─ Uncontained items
│     └─ Keyboard
│
├─ KP Garage
│  ├─ Box B
│  │  └─ Cables
│  └─ Uncontained items
│     └─ Car battery
│
└─ No location
   └─ Uncontained items
      └─ Unknown adapter
```

The new Location level is **virtual UI hierarchy**, not a new database entity.

Do not change `items.parent_item_id` semantics and do not introduce a `locations` table in this task.

---

## Existing architecture to preserve

The current Hierarchy implementation already provides:

- `/hierarchy`;
- Tree view;
- Graph view;
- shared flat `GET /api/items/hierarchy` data;
- shared hierarchy transformation logic in `client/src/hierarchyTree.js`;
- shared expand/collapse state;
- search with ancestor context;
- virtual `Inventory` root;
- virtual `Uncontained items`;
- `effective_location` supplied by the backend;
- `parent_item_id` as the only containment source of truth.

This task must evolve that model instead of replacing it.

Tree and Graph must continue to consume the same normalized hierarchy model.

---

## 1. Location grouping rule

Group **top-level hierarchy branches** by `effective_location`.

Do not group every nested item independently by its own saved `location`.

Example:

```text
Box A
Saved Location: KP Garage
└─ Camera Bag
   Saved Location: Home
   └─ Nikon F80
      Saved Location: Office
```

Existing effective-location rules mean the complete branch is physically represented at:

```text
KP Garage
```

Therefore Hierarchy must render:

```text
Inventory
└─ KP Garage
   └─ Box A
      └─ Camera Bag
         └─ Nikon F80
```

It must NOT render:

```text
KP Garage -> Box A
Home -> Camera Bag
Office -> Nikon F80
```

Containment remains authoritative inside each Location branch.

---

## 2. Location nodes are virtual

Location nodes must exist only in the hierarchy presentation model.

Do not create database rows for named Locations or `No location`.

Do not introduce:

- `locations` table;
- `location_id`;
- `parent_location_id`;
- location foreign keys;
- location CRUD.

The existing text `items.location` field remains unchanged.

Location grouping is derived from the already exposed `effective_location`.

---

## 3. Location normalization

Because Location is currently free text, grouping must normalize equivalent text values.

At minimum:

- trim surrounding whitespace;
- group case-insensitively;
- treat empty / whitespace-only / null as no location.

Examples:

```text
"Garage"
" garage "
"GARAGE"
```

must appear under one Location node.

Use a stable normalized key for grouping, but preserve a human-readable display value.

Do not rewrite item data merely to normalize grouping.

Prefer a deterministic display label from the existing values.

---

## 4. `No location`

All top-level branches whose effective location is empty must be grouped under one virtual node:

```text
No location
```

This node must:

- be virtual;
- appear after named locations;
- support the same expand/collapse behavior;
- work in Tree and Graph;
- participate in search path context.

Do not persist `"No location"` into item records.

---

## 5. Per-location `Uncontained items`

Remove the single global root-level `Uncontained items` group.

Each Location receives its own optional virtual `Uncontained items` group.

Example:

```text
Inventory
├─ Home
│  ├─ Box A
│  └─ Uncontained items
│     ├─ Keyboard
│     └─ Book
│
└─ Garage
   ├─ Tool Box
   └─ Uncontained items
      └─ Car battery
```

Rules inside each Location:

### Top-level item with children

Render directly as a branch under the Location.

### Top-level leaf item

Render inside that Location's virtual:

```text
Uncontained items
```

Do not create one global uncontained group after this task.

---

## 6. Stable virtual keys

Update the shared hierarchy model so virtual nodes cannot collide.

Existing item IDs are numeric; virtual node keys should remain strings.

Suggested conceptual keys:

```text
inventory
location:<normalized-key>
uncontained:<normalized-location-key>
```

For the empty location group use stable reserved keys such as:

```text
location:none
uncontained:none
```

The exact format may differ, but it must be deterministic and safe for:

- expansion state;
- search;
- Tree;
- Graph;
- future Phase 3 drag/drop work.

---

## 7. Shared hierarchy model

Update the common hierarchy builder rather than implementing separate Tree and Graph grouping.

Expected responsibility of the shared model:

```text
flat API items
    ↓
top-level roots
    ↓
group roots by effective_location
    ↓
Location virtual nodes
    ↓
top-level container branches
    +
per-location Uncontained virtual groups
```

Refactor `client/src/hierarchyTree.js` or the current equivalent as needed.

Both Tree and Graph must derive from the same result.

Do not duplicate Location grouping rules in view components.

---

## 8. Tree View

Tree must render:

```text
Inventory
  Location
    container branch
    Uncontained items
```

Location nodes must support:

- expand;
- collapse;
- child/item count;
- search context.

Use an appropriate Tabler location/pin icon or equivalent visual treatment.

Location nodes must be visually distinguishable from real inventory items.

They are not clickable Item Details records.

---

## 9. Location counts

Show the total number of real inventory items represented by each Location.

Example:

```text
Home          187
KP Garage     142
Storage        91
No location    16
```

The count must include descendants, not only direct children.

Do not count virtual nodes themselves.

---

## 10. Graph View

Graph must adopt the same hierarchy:

```text
Inventory
    ↓
Location
    ↓
container / Uncontained
    ↓
items
```

Location nodes should have a visually distinct virtual-node style.

Requirements:

- deterministic layout still works;
- Location nodes participate in edges;
- collapse/expand works;
- hidden branches remain excluded from graph rendering;
- the existing graph visible-node safety limit remains functional;
- no graph database or new layout persistence.

---

## 11. Search

Extend search so hierarchy context includes Location nodes.

Searching for an item must reveal its Location ancestor.

Example:

```text
KP Garage
└─ Box A
   └─ Camera Bag
      └─ Nikon F80
```

Also allow matching Location names.

Searching:

```text
garage
```

should reveal the matching Location branch.

Do not replace existing item-name search behavior.

---

## 12. Expand / Collapse behavior

Existing controls must continue working:

```text
Expand all
Collapse all
```

They must now include:

- Location nodes;
- per-location Uncontained nodes;
- real container nodes.

Search-specific expansion behavior must remain consistent.

Switching between Tree and Graph must preserve compatible expansion state as it does today.

---

## 13. Backend

Prefer keeping the current lightweight:

```text
GET /api/items/hierarchy
```

if it already returns all data needed, especially:

```text
effective_location
```

Do not move presentation grouping to SQL unless there is a clear technical benefit.

The backend remains responsible for calculating `effective_location`.

The client remains responsible for building virtual Location nodes.

Avoid:

- N+1 requests;
- separate API request per Location;
- separate API request per container.

No schema migration is expected.

---

## 14. Read-only Location grouping in this task

This task must NOT introduce drag/drop behavior for Location nodes.

Location nodes are grouping/navigation nodes only.

Do not implement:

```text
drop item onto Location
```

in this task.

Do not overload a virtual Location with `parent_item_id` semantics.

Hierarchy Phase 3 will define mutation behavior explicitly after this architecture is in place.

---

## 15. Mandatory update of the future Phase 3 task

This is a required deliverable of this task.

After implementing and verifying Location grouping, update:

```text
docs/issues/TASK-HIERARCHY-PHASE-3-DRAG-DROP.md
```

so the future drag/drop task is fully consistent with the new hierarchy.

Do not leave the existing Phase 3 task unchanged.

The updated Phase 3 task must explicitly incorporate all requirements below.

### A. Dependency

Phase 3 must explicitly depend on completion of this Location-grouping task.

It must state that Phase 3 builds on:

```text
Inventory
→ Location
→ container / Uncontained
→ nested items
```

### B. Remove outdated global-Uncontained assumptions

Replace any wording that assumes one global:

```text
Inventory
└─ Uncontained items
```

with Location-scoped behavior.

### C. Distinguish two mutation concepts

#### Structural reparenting

Dropping onto a **real item** means:

```text
parent_item_id = targetItem.id
```

This changes containment.

Existing self-parent and cycle protection applies.

#### Moving to a Location

Dropping onto a **virtual Location node** cannot mean `parent_item_id = location`.

If Phase 3 supports Location drop targets, define the semantic operation as:

```text
parent_item_id = NULL
saved location = target Location
```

This is a placement/location change, not containment.

### D. Per-location `Uncontained items` drop semantics

If Phase 3 uses a Location's virtual `Uncontained items` as a drop target, its meaning must be equivalent to:

```text
parent_item_id = NULL
location = target Location
```

No virtual node ID may ever be persisted as `parent_item_id`.

### E. `No location` semantics

If Phase 3 supports dropping onto `No location`, define it as:

```text
parent_item_id = NULL
location = empty/null according to existing validation rules
```

Do not persist the visible label `"No location"`.

### F. Moving a subtree between Locations

Example:

```text
Home
└─ Box A
   └─ Camera
```

Move `Box A` to:

```text
KP Garage
```

Expected persistence:

- `Box A.parent_item_id = NULL`;
- `Box A.location = "KP Garage"`;
- descendants remain structurally unchanged;
- descendants inherit the new effective Location automatically;
- descendant saved locations are not rewritten.

### G. Moving into a container in another Location

Example:

```text
Home
└─ Box A

KP Garage
└─ Box B
```

Move `Box A` into `Box B`.

Expected persistence:

```text
Box A.parent_item_id = BoxB.id
```

Do not rewrite `Box A.location`.

After the move, effective Location changes through existing inheritance.

### H. Focused mutation API

Review the current Phase 3 proposal for:

```text
PATCH /api/items/:id/parent
```

because a parent-only endpoint is insufficient for Location-node drops.

The updated task must choose a consistent API design.

Acceptable options:

```text
PATCH /api/items/:id/parent
PATCH /api/items/:id/location
```

or a unified explicit placement endpoint such as:

```text
PATCH /api/items/:id/placement
```

capable of representing either reparenting or top-level Location movement.

Never infer virtual Location IDs as real item IDs.

### I. Drag target UX

The updated Phase 3 task must define visibly different target types:

- real item/container;
- Location;
- per-location Uncontained group;
- invalid target.

The UI must communicate whether the action means:

```text
Store inside
```

or:

```text
Move to location
```

### J. Mobile / keyboard fallback

Update the existing `Move to…` fallback requirement so it can represent both concepts:

```text
Move to container…
Move to location…
```

or one explicit placement dialog.

### K. Phase 3 tests

The updated future task must add tests for:

1. moving a leaf between Location groups;
2. moving a top-level container/subtree to another Location;
3. descendant effective Location changing without rewriting descendant saved Locations;
4. moving a branch into a real container in another Location;
5. moving an item to per-location Uncontained;
6. moving an item to `No location`;
7. virtual Location IDs never being persisted as `parent_item_id`;
8. cycle protection still applying to real-item drops;
9. Tree and Graph regrouping immediately after the move;
10. Location counts updating after moves;
11. search ancestor paths updating after Location changes;
12. mobile/keyboard fallback supporting location-aware moves.

### Phase 3 task update acceptance

This Location-grouping task is NOT complete until:

```text
docs/issues/TASK-HIERARCHY-PHASE-3-DRAG-DROP.md
```

has been reviewed and edited to remove obsolete assumptions and include the Location-aware behavior above.

The agent must update the actual task file, not merely mention the changes in a change note.

---

## 16. Tests for this task

Add/update automated coverage for at least:

1. named Locations become virtual nodes;
2. top-level containers are grouped under their effective Location;
3. top-level leaves use per-location `Uncontained items`;
4. there is no global Uncontained group;
5. null/empty locations appear under `No location`;
6. `"Garage"`, `" garage "`, and `"GARAGE"` group together;
7. Location grouping does not rewrite saved item data;
8. nested items stay with the effective Location of their top-level containment branch;
9. nested saved locations do not split one branch across Location nodes;
10. Location total item counts are correct;
11. Tree renders Location nodes correctly;
12. Graph renders Location nodes and edges correctly;
13. search for nested item shows Location ancestor;
14. search by Location name works;
15. Expand all / Collapse all includes Location nodes;
16. Tree/Graph view switching keeps compatible expansion state;
17. existing graph visible-node limit still works;
18. `/api/items/hierarchy` remains lightweight and does not introduce N+1 reads;
19. existing effective-location inheritance tests continue to pass;
20. existing nested-items behavior remains unchanged.

Update E2E coverage for both Tree and Graph.

---

## 17. Documentation

Update:

```text
docs/features/hierarchy.md
```

Document the new canonical hierarchy:

```text
Inventory
→ Location
→ container branches / Uncontained items
→ nested contents
```

Also document:

- Location nodes are virtual;
- grouping uses effective Location;
- Location text remains stored on items;
- No location behavior;
- Location normalization;
- per-location Uncontained grouping;
- Tree and Graph behavior;
- Location nodes are read-only grouping nodes until Phase 3.

Add a completed change note:

```text
docs/changes/<date>-hierarchy-location-grouping.md
```

Update any existing Hierarchy documentation that still describes the old global root layout.

---

## 18. Acceptance Criteria

The task is complete only when all of the following are true:

1. Hierarchy is structured as `Inventory → Location → hierarchy`.
2. Location nodes are virtual and require no schema change.
3. Grouping uses backend-provided `effective_location`.
4. Nested branches are not split by descendant saved Location values.
5. Named Location values are normalized for grouping.
6. Empty Location values appear under virtual `No location`.
7. Every Location has its own optional `Uncontained items` group.
8. The previous global Uncontained group is removed.
9. Tree supports the new Location layer.
10. Graph supports the same Location layer from the shared model.
11. Location nodes show real-item counts.
12. Search includes Location context and can match Location names.
13. Expand/collapse behavior remains consistent.
14. Existing containment and effective-location semantics remain unchanged.
15. No new Location entity/table is introduced.
16. No drag/drop behavior is added by this task.
17. Tests, E2E, docs, and lint pass.
18. `TASK-HIERARCHY-PHASE-3-DRAG-DROP.md` is actually updated as a required deliverable and is fully consistent with the new Location-aware hierarchy.

---

## Out of Scope

Do not add in this task:

- Location CRUD;
- `locations` table;
- nested Locations;
- addresses or maps;
- Location photos/descriptions;
- drag & drop;
- item movement APIs;
- bulk move;
- recursive Location writes;
- graph database;
- 3D visualization.

The only exception is the required **specification update** to the future Phase 3 drag/drop task; Phase 3 functionality itself must not be implemented here.
