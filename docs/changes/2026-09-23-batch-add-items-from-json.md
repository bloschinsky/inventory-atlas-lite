# Batch Add Items from JSON

- **Completed:** 2026-09-23
- **Version:** 0.29.0

## Summary

Added **Batch Add from JSON** to the Items page. A modal scoped to a selected category generates a
template from the category's current fields, parses a pasted item import document (version 1, at most
100 items), shows one editable card per proposed item with inline validation, lets items be removed,
and creates the remaining items in one request.

The canonical item input rules moved from `server/src/services/itemValidation.js` to
`shared/itemValidation.js`, so the browser preview and the API apply the same functions. Custom field
value validation moved there as `validateFieldValue`; it now also rejects invalid `YYYY-MM-DD` dates
for date fields and names the field in its messages (`Field "Ports" must be a number.`) for every item
create and update. The new `shared/itemImport.js` defines the document format, template, structural
reader, per-draft review, and the mapping to the regular item create body.

`POST /api/items/batch` accepts `{ categoryId, document }`. `ItemService.createBatch` re-reads the
document against the category's current fields and creates every item through the same `insertItem`
path as a single create, inside one SQLite transaction, so any refusal or failure creates no item.
Server-owned values and unknown custom fields are rejected. No photo, image URL, or AI handling was
added.

Added the permanent feature document and its index entry, updated the quick guide, the application UI
and Playwright documents, the roadmap, the agent repository map, and the version history, removed the
completed task file, and advanced the project version from 0.28.0 to 0.29.0.

## Verification

- `npm run lint` passed.
- `npm test` passed: 89 tests passed and 1 platform-dependent test skipped.
- `npm run build` passed.
- `npm run test:e2e` passed with all 75 Chromium tests.
- Service tests cover a multi-item import with base, purchase, serial, and all four custom field
  types, UUID generation, every document and value refusal, the 100-item limit, and rollback when an
  insert fails mid-batch. The API test covers the HTTP contract, refusals that write nothing, invalid
  JSON, and persistence after a restart.
- Playwright covers selecting the category, inserting the template with the category's fields,
  previewing a multi-item document, fixing an inline error, editing a value, removing one item,
  creating the batch, and checking the resulting items.
