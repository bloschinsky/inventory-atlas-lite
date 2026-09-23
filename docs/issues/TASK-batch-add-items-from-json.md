# TASK — Batch Add Items from JSON

## Status

Planned.

## Goal

Add a category-scoped **Batch Add Items from JSON** workflow that lets a user paste or generate a JSON document, preview and edit multiple item drafts, validate them, and create the entire batch atomically.

Reuse the interaction pattern and validation approach already established by **Batch Add Fields** where practical.

## Scope

Implement the complete user-facing flow:

1. Open Batch Add Items for a selected category.
2. Insert a category-aware JSON template.
3. Paste/edit JSON.
4. Parse and validate it.
5. Show an editable preview of all proposed items.
6. Allow individual draft items to be removed.
7. Create all remaining valid items in one atomic database transaction.

This task is for structured item data only. **Do not add photo import, remote image download, base64 image data, or AI processing.**

## UI

Add a **Batch Add from JSON** action alongside the existing item creation actions.

The workflow must be scoped to a selected category. The selected category is authoritative.

The dialog must contain:

- selected category name;
- JSON editor;
- **Insert Template**;
- **Preview**;
- preview/edit state;
- **Create N Items**;
- **Cancel**.

### Insert Template

`Insert Template` must generate JSON dynamically from the selected category.

The template must include:

- all currently supported common/base item attributes;
- purchase date;
- purchase price amount and currency;
- serial number;
- every custom field defined for the selected category;
- enough structure to demonstrate adding multiple items.

Example shape:

```json
{
  "version": 1,
  "category": "Computer Equipment",
  "items": [
    {
      "name": "",
      "condition": "",
      "location": "",
      "description": "",
      "purchaseDate": null,
      "purchasePrice": {
        "amount": null,
        "currency": "UAH"
      },
      "serialNumber": "",
      "customFields": {
        "Brand": "",
        "Model": "",
        "Type": ""
      }
    }
  ]
}
```

The exact generated custom-field keys must come from the currently selected category.

Do not hard-code example category fields into application logic.

## JSON contract

Support document version `1`.

Required top-level properties:

- `version`
- `category`
- `items`

Rules:

- `version` must equal `1`;
- `category` must match the selected category;
- `items` must be a non-empty array;
- reject unsupported top-level properties rather than silently ignoring malformed input;
- impose a reasonable hard batch limit of **100 items** per import;
- item UUIDs, IDs, timestamps, and other server-owned values must never be accepted from JSON.

Each item may contain only currently supported editable item attributes.

Custom field values must be matched against the selected category's current custom field definitions.

Supported custom-field types remain:

- `text`
- `number`
- `date`
- `boolean`

Unknown custom fields must be reported as validation errors instead of being silently created.

## Preview

Parsing JSON must not create or modify database records.

After successful document parsing, show one editable draft per item.

The preview must allow the user to:

- edit common/base fields;
- edit purchase date;
- edit purchase price amount and currency;
- edit serial number;
- edit category custom-field values using controls appropriate to their types;
- remove an individual item from the batch draft.

Display validation problems inline for the affected item/field.

The create action must remain disabled while any remaining draft is invalid.

If all drafts are removed, creation must be disabled.

## Validation

Use the same canonical validation rules used by normal item creation wherever possible. Do not implement a second inconsistent validation system.

At minimum validate:

- required item name rules;
- field lengths;
- supported condition/location values where applicable;
- date values;
- numeric values;
- boolean values;
- purchase amount;
- ISO currency code;
- serial number;
- category/custom-field existence;
- custom-field types.

Normalize input through the same server/service layer used by regular item creation.

Do not rely on client-side validation alone.

## Server/API

Add a dedicated batch-create operation rather than issuing N independent item-create requests from the browser.

Recommended shape:

`POST /api/items/batch`

Request:

```json
{
  "categoryId": 123,
  "items": [
    {}
  ]
}
```

The final API contract may follow existing project conventions, but it must satisfy the behavior below.

The server must:

1. resolve and validate the category;
2. validate every proposed item;
3. validate every custom-field value;
4. start one SQLite transaction;
5. create all items and their custom-field values;
6. commit only if the entire batch succeeds;
7. roll back the complete batch on any error.

No partial imports.

Generate item UUIDs on the server using the existing item creation rules.

Reuse existing repositories/services instead of duplicating SQL where practical.

## Error handling

Provide actionable errors for at least:

- invalid JSON;
- unsupported JSON version;
- missing/empty `items`;
- too many items;
- category mismatch;
- unknown property;
- unknown custom field;
- invalid custom-field value;
- invalid purchase value/currency;
- server-side batch failure.

A failed import must leave the database unchanged.

## Tests

Add automated coverage for:

### Service/API

- valid multi-item import;
- base fields;
- purchase fields;
- serial number;
- all four custom-field types;
- UUID generation;
- category mismatch;
- unknown field;
- malformed values;
- maximum batch limit;
- transaction rollback when one item fails;
- persistence after restart.

### Playwright

Cover the primary user flow:

1. select/open a category;
2. open Batch Add from JSON;
3. insert template;
4. verify category-specific fields appear;
5. modify JSON to contain multiple items;
6. preview;
7. edit a value;
8. remove one proposed item;
9. create the batch;
10. verify the resulting items appear correctly.

## Documentation

When implemented:

- document the feature under `docs/features/`;
- add it to `docs/features/README.md`;
- update `docs/HOW-TO.md`;
- update `docs/ROADMAP.md`;
- add the required `docs/changes/YYYY-MM-DD-*.md` record;
- follow the task-file lifecycle in `AGENTS.md`.

## Acceptance criteria

- A user can batch-create items from pasted JSON.
- `Insert Template` reflects the selected category's current fields.
- Preview is editable before anything is written.
- Individual proposed items can be removed.
- Existing item validation rules are reused.
- Unknown custom fields are rejected.
- Server-owned IDs/UUIDs cannot be supplied by the import.
- The entire batch is committed atomically.
- A failure creates zero items.
- No photo/import-from-URL behavior is introduced.
- Automated API/service and Playwright coverage passes.
