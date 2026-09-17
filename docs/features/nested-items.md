# Nested items

## Summary

An item can be stored inside another item, so a box, case, or drawer that is itself an inventory
record can hold other records. The hierarchy answers "what is in this box?" without adding a
separate container, room, or shelf entity.

## User-visible behaviour

- **Add/Edit item** has an optional **Stored inside** field. It searches existing items by name and
  shows the selected parent as a badge that can be cleared, which returns the item to the top level.
- The selector never offers the edited item itself or anything already stored inside it.
- **Item details** shows `Stored inside` with a link to the parent, and a **Contents** section
  listing the direct children with their thumbnails and links.
- Nesting has no depth limit, and an item has at most one direct parent.
- The plain-text `Location` field is independent of nesting: `Location` describes where the physical
  object is, `Stored inside` describes which other record holds it.
- An item that still contains other items cannot be deleted; its contents must be moved or deleted
  first.
- Changing the parent never affects the category, custom field values, or photos.

## Implementation overview

- `items.parent_item_id` is a nullable self-reference with `ON DELETE RESTRICT`, indexed by
  `idx_items_parent`. Databases created before the feature receive the column through an in-place
  `ALTER TABLE` in `server/src/db.js`, so existing data stays valid with `parent_item_id = NULL`.
- `POST /api/items` and `PUT /api/items/:id` accept `parent_item_id` (an item ID or `null`).
  `resolveParentId` in `server/src/index.js` rejects an unknown parent, self-parenting, and any move
  into a descendant; descendants are collected with a recursive CTE, so indirect cycles such as
  `A → B → C → A` are refused with HTTP `400`.
- `GET /api/items/:id` returns `parent_item_id`, a `parent` summary (`id`, `uuid`, `name`), and
  `children` summaries (`id`, `uuid`, `name`, category name, condition, thumbnail ID). The full
  descendant tree is never expanded in a response.
- `GET /api/items/parent-candidates?search=&excludeId=` returns at most 20 lightweight candidates
  with the excluded item and its descendants filtered out.
- `DELETE /api/items/:id` answers HTTP `409` while the item has children. Contained items are never
  deleted automatically and never silently moved to the root.
- UI: `client/src/pages/ItemForm.vue` (selector) and `client/src/pages/ItemDetails.vue` (parent link
  and Contents section). The items list is unchanged.

## Verification

- `test/e2e.test.js` covers assigning, reading, moving, and clearing a parent, the self-parenting and
  direct/indirect cycle rejections, the `409` on a non-empty container, deletion after the contents
  are moved, and hierarchy survival across a restart and in a downloaded backup.
- `test/e2e/nesting.spec.js` covers the browser workflow: place an item inside another, follow the
  parent link, and see it under **Contents**.

## Notes and limitations

- Cycle protection is enforced on the server; the client filtering is only a convenience.
- There is no drag-and-drop tree, no bulk move, and no recursively expanded tree on the items list.
- The SQLite backup contains the hierarchy automatically because it is a plain column on `items`.
