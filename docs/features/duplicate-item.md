# Duplicate item

A one-time copy of an existing item into the regular Add Item form, for cataloging several similar
physical items without creating a template. Nothing is created until the form is saved.

## Behavior

- The item page offers **Duplicate** next to **Edit**. It links to `/items/new?duplicate=<id>`.
- The Add Item form loads the source item and prefills it through the shared item draft
  (`draftFromItem()` in `client/src/itemDraft.js`), the same mechanism used for editing, AI drafts,
  and templates: category, name, description, condition, location, purchase date, purchase price,
  serial number, Transferred To, and the custom field values of the item's category.
- A notice names the source item and states that the new item is saved separately, without its
  photos or container. Every value can be changed or cleared before saving; the name is copied as is
  and never incremented automatically.
- While the copied serial number is not empty, a non-blocking hint under **Serial Number** says that
  serial numbers are often unique. The value is never cleared automatically.
- **Stored inside** starts empty, so the new item is top-level unless a container is chosen in the
  form. The photo selection starts empty; the source item's photos stay with it.
- **Save item** sends the same `POST /api/items` request as a blank Add Item form, followed by the
  usual photo upload when photos were chosen. The new item gets its own ID, UUID (and therefore QR
  code), and timestamps, and has no contents.
- A source item that cannot be loaded, for example because it was deleted, shows the error and
  leaves a blank form.

## Independence

There is no stored link between the source and the copy. The source item is not modified by the
duplication, and editing or deleting either item never affects the other. There is no server-side
change: the feature is entirely a new draft source in `ItemForm.vue`.

## Verification

`test/e2e/duplicate-item.spec.js` opens **Duplicate** from an item that has a container, a photo,
base values, and custom values; checks the prefilled form, the serial hint, the empty container and
photos, and that nothing is created before saving; edits values and saves; and then checks through
the API that the copy has a new UUID, no container, photos, or contents, and that the source item is
unchanged and survives the deletion of the copy. The existing Add Item, AI, and template specs cover
the other draft sources.

## Out of scope

Bulk duplication, automatic name or serial number generation, photo copying, cloning of contained
items, and persistent source/copy relationships are not implemented.
