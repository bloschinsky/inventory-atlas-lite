# CODEX TASK — Add Nested Items / Containers

## Goal

Add simple item nesting to **Inventory Atlas Lite**.

An inventory item may be stored inside another inventory item. For example:

```text
Garage (plain-text location)
└── Box A
    ├── Helios 44-2 lens
    └── Olympus Pen F
```

The user must be able to open `Box A` and see the items stored inside it.

Keep this feature intentionally small. Do not introduce a separate warehouse, room, shelf, container, or location-tree subsystem.

---

## Data model

Add a nullable self-referencing column to `items`:

```sql
parent_item_id INTEGER NULL
REFERENCES items(id) ON DELETE RESTRICT
```

Requirements:

- `NULL` means that the item is not stored inside another item.
- Any item may contain other items; do not add a separate container entity or mandatory `is_container` flag.
- An item may have no more than one direct parent.
- Nesting may have multiple levels.
- Keep the existing plain-text `location` field unchanged.
- Existing items must remain valid and receive `parent_item_id = NULL`.
- Add an index on `items.parent_item_id`.
- Apply the change through the project's schema initialization or a small migration mechanism without destroying existing data.

---

## Validation and safety

The API must reject:

- setting an item as its own parent;
- moving an item inside one of its descendants;
- assigning a parent item that does not exist;
- any operation that would create a cycle, including indirect cycles such as `A → B → C → A`.

Cycle validation must be performed on the server. Client-side filtering may improve the UI but must not be the only protection.

When deleting an item that contains other items:

- reject the deletion with HTTP `409 Conflict`;
- return a useful message explaining that the contained items must first be moved or deleted;
- do not automatically delete contained items;
- do not silently move contained items to the root.

Deleting a normal empty item should continue to work as before.

---

## API changes

### Create and update item

Extend the existing item create/update payload with:

```json
{
  "parent_item_id": 12
}
```

The value may be an item ID or `null`.

### Item details

Extend the item detail response with:

- `parent_item_id`;
- basic parent information when present: `id`, `uuid`, and `name`;
- `children`: direct child items stored inside this item.

Child summaries should contain only data needed by the details page, such as:

- `id`;
- `uuid`;
- `name`;
- category name;
- condition;
- thumbnail ID when available.

Do not recursively return the complete descendant tree in every item response.

### Parent candidates

Provide a small endpoint or query suitable for the **Stored inside** selector.

It should:

- search items by name;
- return a limited number of lightweight results;
- exclude the edited item;
- exclude its descendants;
- support clearing the parent relationship.

Keep the API naming consistent with the existing REST API.

---

## UI changes

### Add/Edit Item

Add an optional field:

```text
Stored inside
```

Requirements:

- allow searching and selecting another item;
- allow clearing the selection so the item becomes top-level again;
- do not show the current item or its descendants as valid choices;
- show the selected parent clearly by name;
- changing the parent must not affect category, custom fields, photos, or the plain-text `location` value.

Use existing Bootstrap components and keep the implementation visually simple.

### Item details

When an item has a parent, show:

```text
Stored inside: Box A
```

The parent name must link to the parent item's details page.

When an item contains other items, show a **Contents** section containing its direct children. Each child must link to its details page. Reuse the existing thumbnail and item-summary presentation where practical.

If the item is empty, the Contents section may be hidden or display a short empty state.

### Items list

Do not redesign the main list. Optionally show the direct parent name if it can be added without clutter.

---

## Behaviour

Example workflow:

1. Create an item named `Box A` with `location = Garage`.
2. Create an item named `Helios 44-2`.
3. Set `Stored inside = Box A` for the lens.
4. Open `Box A` and see `Helios 44-2` in its Contents section.
5. Open the lens and follow the `Stored inside: Box A` link.
6. Move the lens to another box or clear its parent.

The existing SQLite backup must continue to include the complete hierarchy automatically.

---

## Tests

Extend the automated tests to cover at least:

1. assigning a valid parent;
2. reading an item's parent information;
3. reading a container's direct children;
4. moving an item to another parent;
5. clearing the parent;
6. rejecting self-parenting;
7. rejecting a direct cycle;
8. rejecting an indirect multi-level cycle;
9. rejecting deletion of a non-empty container;
10. successfully deleting the container after its children are moved or deleted;
11. preserving the hierarchy after an application restart;
12. preserving the hierarchy in a downloaded SQLite backup.

---

## Non-goals

Do not add:

- a separate containers table;
- a separate hierarchical locations system;
- warehouses, rooms, shelves, or bins as special entities;
- drag-and-drop tree management;
- bulk moves;
- automatic deletion of descendants;
- a recursively expanded full inventory tree on the main page;
- new authentication or permission logic.

---

## Acceptance criteria

The feature is complete when:

1. an item can be placed inside another item;
2. nesting works for more than one level;
3. an item page shows its parent and direct contents;
4. the user can move an item or remove it from a container;
5. cycles and self-parenting are impossible through the API;
6. a non-empty container cannot be deleted accidentally;
7. existing inventory data remains intact;
8. restart and backup preserve all parent-child relationships;
9. all existing tests and the new hierarchy tests pass.

## Main priority

Keep this as a focused extension of the existing `items` model. The hierarchy should provide practical box-inside-garage and item-inside-box behaviour without turning Inventory Atlas Lite into the larger Inventory Atlas architecture.
