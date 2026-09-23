# TASK — Add `Transferred To` Common Item Field

## Status

Planned.

## Goal

Add a new common/base item field named **Transferred To** for tracking where an item went when it was loaned, gifted, sold, or otherwise transferred to another person or destination.

The field must be available for every item, optional by default, editable, clearable, searchable, and visible as a badge when populated.

## Data model

Add a nullable text column to `items`:

```text
transferred_to TEXT NULL
```

Requirements:

- existing databases must migrate safely;
- existing items must receive `NULL`;
- clearing the field must persist `NULL`, not an empty string;
- the field must not affect or overwrite `location`;
- no implicit status/state changes must occur when the field is changed.

`Transferred To` is informational only.

## Semantics

Examples:

```text
Transferred To: Vasyl
Transferred To: Father
Transferred To: Sold via OLX
Transferred To: Workshop
```

An empty value means no transfer information is currently recorded.

Do not create a separate transfer-history subsystem in this task.
Do not introduce loan/sale/gift enums or workflow states.

## Item form

Add **Transferred To** to the common/base item fields.

The control must:

- accept free text;
- allow the value to be cleared;
- use the same validation/normalization conventions as other common text fields;
- preserve the value during normal item editing.

Place it in a sensible common-details section near location/condition or other lifecycle-related item metadata.

## Autocomplete

Add autocomplete using previously saved non-empty `Transferred To` values.

Behavior:

- suggest distinct previously used values;
- exclude empty/null values;
- do not force selection from existing values;
- allow arbitrary new text;
- avoid duplicate suggestions caused only by casing/whitespace where practical.

Reuse the project's existing autocomplete patterns/components where possible.

## Badge

When `Transferred To` is populated, show a visible badge in item presentation.

Recommended text:

```text
Transferred to: Vasyl
```

Requirements:

- show it on the item details view;
- show it in item cards/list rows where the current layout can accommodate it without clutter;
- hide the badge completely when the field is empty;
- use existing Tabler badge styling;
- do not use warning/error styling by default.

The badge is informational, not an alert.

## API and services

Update all relevant item create/read/update flows.

The field must be included consistently in:

- item creation;
- item retrieval;
- item editing;
- item listing where full item data is returned;
- backup/restore through the SQLite database;
- migrations;
- search/filter infrastructure where common text fields are indexed/searched.

Reuse existing item repositories/services and validation logic.
Do not implement field-specific SQL in the client.

## Search

Include `Transferred To` in the normal item text search so users can find, for example, all items transferred to the same person.

Example:

```text
Search: Vasyl
```

must match an item whose `transferred_to` is `Vasyl`.

Do not add a dedicated filter in this task unless the existing filter architecture makes this trivial.

## Batch / AI compatibility

Any existing generic item serializers, schemas, AI draft mapping, or batch-item infrastructure that operates over common/base fields must be updated so the new field is not silently dropped.

Do not force AI features to populate the field.
If AI output omits it, store `NULL`.

## Validation

Apply the same practical maximum text length and normalization rules used by comparable common text fields.

At minimum:

- trim surrounding whitespace;
- convert empty/whitespace-only input to `NULL`;
- reject values above the configured/common text length limit.

## Tests

Add automated coverage for:

### Service/API

- create item with `Transferred To`;
- create item without it;
- update from null to value;
- update from value to another value;
- clear value back to null;
- migration from a legacy database;
- persistence after restart;
- search by transferred-to value;
- backup/restore preserves the field.

### Playwright

Cover:

1. create or edit an item;
2. set `Transferred To`;
3. save;
4. verify the badge appears;
5. verify autocomplete suggests the saved value on another item;
6. clear the field;
7. save;
8. verify the badge disappears.

## Documentation

When implemented:

- document the field in the relevant feature documentation;
- update `docs/HOW-TO.md`;
- update `docs/features/README.md` where appropriate;
- update `docs/ROADMAP.md`;
- add the required `docs/changes/YYYY-MM-DD-*.md` record;
- follow the task-file lifecycle in `AGENTS.md`.

## Acceptance criteria

- Every item supports an optional `Transferred To` common field.
- Existing databases migrate without data loss.
- The field can be entered, edited, and cleared.
- Empty values persist as `NULL`.
- Previously used values appear as autocomplete suggestions.
- Populated values produce a visible `Transferred to: ...` badge.
- Empty values produce no badge.
- `location` is never automatically modified.
- Normal item search can find items by `Transferred To`.
- Backup/restore preserves the value.
- Automated API/service and Playwright coverage passes.
