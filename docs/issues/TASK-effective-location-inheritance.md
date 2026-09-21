# Task: Inherit Displayed Location from Parent Container

## Goal

When an item is stored inside another item, display its effective location based on the parent container instead of the item's own saved `location`.

Do not overwrite or modify the item's saved `location`.

## Requirements

### Data behavior

Keep existing fields unchanged:

- `items.location` = item's own saved location
- `items.parent_item_id` = item that contains this item

Add derived/effective location logic.

Rules:

1. If an item has no parent:
   - `effective_location = item.location`

2. If an item has a parent:
   - `effective_location = parent's effective_location`

3. Resolve recursively through all parent levels.

Example:

```text
Camera
location = "Garage"
stored inside -> Camera Bag

Camera Bag
location = "Office"
stored inside -> Box

Box
location = "Home"

Displayed location:
Camera = Home
Camera Bag = Home
Box = Home
```

The original values must remain unchanged in the database.

## Backend

Implement effective location resolution on the backend.

Prefer SQLite recursive query / CTE or equivalent efficient server-side logic.

Avoid N+1 queries when returning item lists.

Expose effective location in relevant API responses, for example:

```json
{
  "location": "Garage",
  "effective_location": "Home"
}
```

Optionally expose the source item that provides the effective location:

```json
{
  "effective_location_source": {
    "id": 123,
    "name": "Box"
  }
}
```

Do not add a database column for `effective_location`.

Do not persist calculated values.

Existing cycle protection for nested items must remain intact.

## Frontend

Use `effective_location` for display wherever item location is shown to the user.

At minimum update:

- Item details view
- Items table/list
- Mobile item cards

The edit form must continue to load and edit the item's own saved `location`.

When an item has a parent, add a small helper message near the Location / Stored Inside fields explaining that the displayed location is inherited from the container.

Example:

```text
Displayed location is inherited from the parent container.
```

Do not disable or clear the Location input.

## Important Behavior

If an item is removed from its parent container:

- its previously saved own `location` must become visible again automatically
- no data migration or restoration must be required

If a parent container moves to another location:

- all nested descendants must immediately display the new effective location
- child records must not be updated individually

If a parent chain has no non-empty location:

- `effective_location` should resolve to empty/null
- UI should display the existing empty-state value (`—` or equivalent)

## Dashboard

Do not change current dashboard placement semantics in this task.

Existing metrics such as:

- inside container
- direct location
- unplaced

must keep their current meaning unless implementation requires a minimal compatibility adjustment.

## Tests

Add/update automated tests for:

- top-level item uses its own location
- child item inherits parent's location
- deeply nested item inherits top-most effective location
- child's own location remains unchanged
- removing parent restores child's own displayed location
- moving parent changes descendant displayed location
- parent chain with no location returns empty effective location
- item list API returns effective location without N+1 behavior
- existing cycle-prevention behavior still works

## Acceptance Criteria

- Saved `location` values are never overwritten by inheritance logic.
- Nested items display the effective location of their container hierarchy.
- Multi-level nesting works.
- Item details and item list/card views use effective location.
- Editing still uses the item's own location.
- Removing an item from a container restores its own saved location automatically.
- No database schema change is introduced for calculated location.
- Existing storage hierarchy behavior and cycle protection remain functional.
- Lint and tests pass.
