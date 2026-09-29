# TASK: Bulk Move Items to Container

**Status:** Planned
**Priority:** High
**Type:** Feature / hierarchy editing / bulk action
**Blocked by:** None
**Related:** Existing Nested Items / Hierarchy functionality

---

## Goal

Add a bulk hierarchy action to the Items list so the user can select multiple inventory items and move them into the same destination container/item in one operation.

Current workflow requires editing items one by one:

```text
Camera → Edit → Stored inside → Box B4
Lens   → Edit → Stored inside → Box B4
Flash  → Edit → Stored inside → Box B4
...
```

Target workflow:

```text
Items
☑ Camera
☑ Lens
☑ Flash
☑ Light meter

4 items selected

[ Move to… ]

Destination: Box B4

[ Move ]
```

The operation must reuse the existing `items.parent_item_id` hierarchy and existing cycle protection.

Do not create a new container relation or duplicate hierarchy model.

---

## Existing architecture to preserve

Inventory Atlas Lite already uses:

```text
items.parent_item_id
```

with:

- nullable self-reference;
- `ON DELETE RESTRICT`;
- server-side self-parent protection;
- descendant/cycle protection;
- effective Location inheritance;
- Item Details `Stored inside`;
- container `Contents`;
- Hierarchy views.

Bulk Move must be another safe mutation surface over this same model.

Do not implement hierarchy by custom fields, tags, Location text, or a second relation table.

---

## Core UX

Add row/card selection to the Items list.

When one or more items are selected, show a bulk action toolbar.

Example:

```text
5 items selected

[ Move to… ]  [ Clear selection ]
```

The exact layout should follow existing Tabler patterns and remain usable on mobile.

The user selects a destination using a searchable item/container picker.

Example:

```text
Move 5 selected items

Destination
[ Search items…                  ]

Box B4
Garage Shelf Box
Travel Case

[ Cancel ] [ Move ]
```

After confirmation:

```text
5 items moved to Box B4
```

Do not require opening each Edit Item form.

---

## Selection behavior

Support:

- selecting individual rows/items;
- select all currently visible page/result set where practical;
- clear selection;
- preserving selection while choosing a destination.

Selection must be explicit.

Do not silently select hidden items outside the current result scope.

If the Items list is paginated or virtualized, document precisely what `Select all` means.

Prefer:

```text
Select all currently loaded / currently filtered results
```

only when it can be implemented unambiguously.

---

# CRITICAL SEMANTICS: Preserve Hierarchy

When selected items already contain one another, **preserve the existing hierarchy**.

Do NOT flatten all selected records under the new destination.

Example:

```text
Before

Box A
└─ Camera

Box B
```

User selects both:

```text
☑ Box A
☑ Camera
```

and chooses:

```text
Move to Box B
```

Required result:

```text
Box B
└─ Box A
   └─ Camera
```

Persist only:

```text
BoxA.parent_item_id = BoxB.id
```

Do NOT change:

```text
Camera.parent_item_id
```

because Camera is already inside a selected ancestor that is being moved as one subtree.

This behavior is mandatory.

---

## Selection roots

Before applying the move, reduce the selected set to **selection roots**.

Definition:

> A selection root is a selected item that has no selected ancestor.

Example:

```text
A
└─ B
   └─ C
      └─ D
```

Selected:

```text
A
C
D
```

Selection roots:

```text
A
```

Moving selected items to `X` results in:

```text
X
└─ A
   └─ B
      └─ C
         └─ D
```

Only `A.parent_item_id` changes.

Another example:

```text
A
└─ B

C
└─ D
```

Selected:

```text
B
C
D
```

Selection roots:

```text
B
C
```

Moving to `X` produces:

```text
A

X
├─ B
└─ C
   └─ D
```

Only `B` and `C` are reparented.

Do not rewrite descendants of a selected root.

---

## UI summary for preserved subtrees

If the raw selected count differs from the number of hierarchy roots that will actually be reparented, explain the action clearly.

Example:

```text
5 items selected
2 top-level selected groups will be moved.
Nested selected items will stay inside their selected parent containers.
```

A verbose warning modal is not required for every normal move, but the confirmation must not imply that all selected rows will become direct children of the destination.

Suggested confirmation:

```text
Move selected items to "Box B4"?

5 selected items
2 selected subtrees will be moved
Existing nested structure will be preserved.
```

---

## Destination rules

Destination is another real inventory item.

The current model allows any item to act as a parent, so do not introduce a separate `is_container` database concept in this task.

The destination picker should:

- search existing items;
- show enough context to disambiguate names;
- exclude invalid targets where practical;
- still rely on server validation as final authority.

At minimum the destination must not be:

- one of the selection roots;
- any descendant of a selection root;
- an unknown item.

If the destination itself is selected only because it is nested below a selected root, the move is invalid because it would create a cycle.

Reject it server-side.

---

## Moving to the current parent

If all selection roots already have the chosen destination as their direct parent, the operation may return a no-op result.

Do not treat this as a destructive error.

Example response may report:

```text
moved: 0
unchanged: 3
```

If some roots already have that parent and others do not, move only those that need changing while keeping the whole operation transactionally valid.

---

## Backend API

Add a focused bulk hierarchy mutation endpoint.

Suggested route:

```text
PATCH /api/items/bulk-parent
```

Suggested body:

```json
{
  "item_ids": [12, 18, 44, 51],
  "parent_item_id": 7
}
```

The client may send the original selected IDs.

The server must independently:

1. validate and de-duplicate `item_ids`;
2. load current hierarchy state;
3. calculate selection roots;
4. validate the destination against every selection root;
5. reject self/cycle/descendant moves;
6. perform all required parent updates in one transaction;
7. preserve all descendants;
8. return a concise result.

Do not trust the client to calculate selection roots correctly.

---

## Suggested response

Exact response may follow project conventions.

It should provide enough information for the UI to refresh/reconcile safely.

Example:

```json
{
  "selected_count": 5,
  "root_count": 2,
  "moved_count": 2,
  "unchanged_count": 0,
  "parent": {
    "id": 7,
    "uuid": "...",
    "name": "Box B4"
  },
  "moved_root_ids": [12, 44]
}
```

Do not return an unnecessarily large full hierarchy if existing lightweight refresh endpoints can be reused.

---

## Atomic transaction

The bulk move must be atomic.

Example:

```text
10 selected roots
9 valid
1 invalid cycle
```

Required result:

```text
0 moved
request rejected
original hierarchy unchanged
```

Do not partially move the first nine.

Use one SQLite transaction for validation-sensitive mutation.

Validation must use current server/database state, not only the hierarchy snapshot previously loaded by the browser.

---

## Cycle protection

Reuse/refactor the existing hierarchy validation logic.

Do not implement a separate weaker cycle algorithm only for bulk actions.

Required rejected example:

```text
Box A
└─ Box B
   └─ Camera
```

Select:

```text
Box A
Camera
```

Destination:

```text
Box B
```

Selection root is `Box A`.

`Box B` is a descendant of `Box A`.

The whole request must fail.

---

## Relationship to existing single-item move logic

Inventory Atlas may have or gain a focused single-item endpoint such as:

```text
PATCH /api/items/:id/parent
```

from Hierarchy Phase 3.

Bulk Move must share domain/service validation with that implementation where available.

Recommended shape:

```text
HierarchyService / ItemService
    resolve/validate parent
    detect descendants/cycles
    compute selection roots
    perform single/bulk reparent
```

Do not duplicate recursive CTE/cycle logic across:

- Edit Item;
- drag/drop hierarchy;
- bulk move;
- any future move UI.

This task does **not** need to wait for Hierarchy Phase 3 if the shared validation can be extracted cleanly now.

---

## Effective Location

Do not rewrite saved `location` values.

Example:

```text
Garage
└─ Box A
   └─ Camera
```

Bulk move `Box A` to:

```text
Home
└─ Box B
```

Result:

```text
Home
└─ Box B
   └─ Box A
      └─ Camera
```

The effective displayed Location should change naturally through the existing inheritance system.

Persisted `location` fields on Box A, Camera, and descendants remain untouched.

Add regression coverage.

---

## Item data that must NOT change

Bulk Move changes hierarchy only.

Do not modify:

```text
name
category_id
description
condition
location
purchase_date
purchase_price
serial_number
transferred_to
custom field values
photos
created_at
```

Update hierarchy-relevant `updated_at` only according to existing project conventions.

Descendant item records should not be rewritten merely because an ancestor moved.

---

## Items list integration

Bulk selection must coexist with:

- search;
- filters;
- sorting;
- column chooser;
- responsive cards/table;
- Stored inside column;
- effective Location display.

After a successful move:

- selected items/subtrees show the new effective container relationship;
- relevant `Stored inside` values refresh;
- effective Location refreshes;
- selection clears unless there is a strong UX reason to preserve it;
- no full browser reload is required.

Prefer re-fetching affected list/hierarchy data or updating the shared normalized model safely.

---

## Hierarchy integration

After Bulk Move:

- Tree view must reflect the new location when opened/refreshed;
- Graph view must reflect the new relation;
- Item Details must show the new `Stored inside`;
- source containers' Contents must no longer list moved roots;
- destination Contents must list moved roots;
- descendants remain below the same moved roots;
- hierarchy search/ancestor paths must remain correct.

Do not write separate cleanup code for every view if a normal data refresh provides consistent state.

---

## Destination picker

Reuse the existing parent-candidate search/model where possible.

However, bulk validation differs because there are multiple selected roots.

The picker may either:

1. call a dedicated bulk parent-candidates endpoint; or
2. show general candidates and rely on server validation, while disabling obviously invalid targets client-side.

Preferred UX avoids presenting known-invalid destinations.

Do not fetch the entire heavy item dataset just to populate the modal if the existing lightweight search endpoint can be extended.

---

## Error handling

Show useful errors for:

- no items selected;
- unknown selected item;
- unknown destination;
- destination is a selected root;
- destination lies inside a selected subtree;
- stale/deleted item;
- transaction failure.

Do not expose raw SQL or stack traces.

If the move fails, keep the original hierarchy and selection so the user can choose another target.

---

## Mobile behavior

Bulk Move must remain usable in the responsive card view.

Provide visible per-item selection controls.

The bulk toolbar may be sticky at the bottom/top on narrow screens if that follows existing UI conventions.

Destination search and confirmation must fit phone width.

Do not make bulk move desktop-only.

---

## Accessibility

Requirements:

- selection controls have labels;
- keyboard users can select items;
- bulk toolbar actions are keyboard accessible;
- destination picker can be operated without a mouse;
- preserved-hierarchy behavior is communicated as text, not only visually;
- focus returns to a sensible place after modal close.

---

## Localization

All new UI text must go through the existing i18n system.

Examples:

```text
items selected
Move to…
Move selected items
Destination
Existing nested structure will be preserved
selected subtrees
Move
Clear selection
```

Add keys to every locale present at implementation time and keep translation completeness checks passing.

User item/container names remain unchanged.

---

## Tests

Add automated coverage for at least:

1. bulk move multiple unrelated leaf items to one destination;
2. bulk move multiple unrelated containers to one destination;
3. selected parent + selected child preserves hierarchy;
4. selected parent + selected grandchild preserves hierarchy;
5. multiple selected subtrees calculate correct selection roots;
6. only selection roots receive new `parent_item_id`;
7. descendants retain original direct parents;
8. destination equal to a selected root is rejected;
9. destination inside any selected root subtree is rejected;
10. unknown selected item rejects whole request;
11. unknown destination rejects whole request;
12. duplicate item IDs are de-duplicated safely;
13. mixed valid/invalid selection causes zero partial moves;
14. operation is atomic;
15. roots already under destination are handled as no-op/unchanged;
16. effective Location changes through inheritance only;
17. saved descendant Location values remain unchanged;
18. custom fields/photos/other item data remain unchanged;
19. Items list refreshes `Stored inside`;
20. Item Details and container Contents reflect the move;
21. Hierarchy tree/graph reflect the move after refresh;
22. mobile card selection works;
23. existing single-item Stored inside editing still works;
24. existing cycle-protection tests still pass.

Mandatory preserve-hierarchy E2E scenario:

```text
Box A
└─ Camera

Box B
```

Steps:

```text
select Box A
select Camera
Move to Box B
```

Assert final structure:

```text
Box B
└─ Box A
   └─ Camera
```

Assert:

```text
BoxA.parent_item_id = BoxB.id
Camera.parent_item_id = BoxA.id
```

Also add one E2E rejected-cycle scenario proving no partial move occurs.

---

## Documentation

Update:

```text
docs/features/nested-items.md
docs/features/hierarchy.md
docs/HOW-TO.md
docs/features/README.md
docs/ROADMAP.md
```

Add:

```text
docs/changes/<date>-bulk-move-items-to-container.md
```

Document:

- Items list multi-select;
- Move to workflow;
- atomic behavior;
- cycle protection;
- preserve-hierarchy semantics;
- selection-root definition;
- effective Location consequences.

Where existing docs currently state that bulk move is unavailable, remove/update that limitation after implementation.

---

## Acceptance Criteria

1. Users can select multiple items from the Items list.
2. A bulk toolbar exposes `Move to…`.
3. User can search/select one destination item/container.
4. Bulk Move uses the existing `parent_item_id` hierarchy.
5. The server independently calculates selection roots.
6. **Selecting a parent and its descendants preserves their existing internal hierarchy.**
7. **Only selected roots are reparented; selected descendants remain under their selected ancestor.**
8. Destination inside any selected subtree is rejected.
9. Existing self/cycle protection remains authoritative.
10. The move is atomic: any invalid root causes zero partial updates.
11. Saved Location and other non-hierarchy item data are not rewritten.
12. Effective Location updates naturally through existing inheritance.
13. Items, Item Details, Contents, Tree, and Graph remain consistent after refresh.
14. The workflow works on desktop and mobile.
15. All new UI uses current i18n.
16. Existing single-item hierarchy editing remains functional.
17. Lint, tests, build, and E2E pass.

---

## Out of Scope

Do not add in this task:

- flattening selected hierarchy;
- multiple parents per item;
- drag-select/lasso UI;
- AI-selected destination;
- AI sorting;
- automatic destination suggestions;
- new container database entity;
- arbitrary graph relationships;
- bulk category changes;
- bulk custom-field editing;
- bulk delete;
- undo/redo history;
- QR scanning;
- automatic physical verification.
