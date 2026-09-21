# Batch Add Fields

## Summary

A category's custom fields can be created in one reviewed batch instead of one at a time. The user
pastes a field-definition document, presses **Preview**, edits or removes the proposed fields, and
then commits them with a single atomic request. Pasted JSON never reaches the database before that
explicit confirmation.

The document format is an application-level field-definition schema, not a copy of the SQLite
columns. It is the shared format for later AI generation, schema import, schema export, and
category templates.

## Field-definition format

```json
{
  "version": 1,
  "fields": [
    { "name": "Brand", "type": "text", "required": false },
    { "name": "Release Year", "type": "number", "required": false }
  ]
}
```

- `version` is optional and must be `1` when present.
- `fields` is required, must contain at least one entry, and accepts at most 50 entries.
- A field accepts `name`, `type`, and `required` only. Any other property, for example `options`, is
  rejected with the supported property list.
- `type` is one of the types the application actually supports: `text`, `number`, `date`, `boolean`.
- `required` is accepted for format compatibility but must be `false` or omitted: the application
  has no required custom fields yet, so `true` is reported as an invalid configuration instead of
  being silently ignored.

## User-visible behaviour

- **Batch Add Fields** sits under the single-field form in *Categories & Fields* and opens a modal
  for the selected category.
- **Preview** parses and validates the document. Document-level problems (invalid JSON, a missing
  `fields` array, an unsupported version or property, an empty batch, more than 50 fields) are shown
  as one actionable message and no preview is produced.
- A parsed document is shown as one editable row per proposed field: the name is a text input, the
  type is a selector, and **Remove** drops that row from the batch draft only. Existing category
  fields are never touched by a removal.
- Every row carries a status recalculated after each edit or removal: *New*, *Already exists*,
  *Duplicate in batch*, *Invalid type*, or *Invalid configuration*. Blocking rows are highlighted
  and carry the reason, for example `Field "Brand" already exists in this category.`
- Names are compared case-insensitively and trimmed, matching the category's unique field names. A
  name that collides with a built-in item attribute (`Name`, `Description`, `Category`, `Condition`,
  `Location`, `Purchase Date`, `Purchase Price`, `Serial Number`, `Photos`) is rejected.
- **Edit JSON** returns to the editor with the pasted text intact.
- The confirmation button reads **Create N Fields**, where `N` counts the rows that are currently
  valid and new. It stays disabled while any blocking row remains or nothing is left to create.
- After a successful create, the modal closes and the field list and category counters reload.
- `Escape`, **Cancel**, the close button, and a click on the backdrop discard the whole draft.

## Implementation overview

- `shared/fieldDefinitions.js` holds the format and is imported by both the server and the client,
  so one definition drives validation on both sides:
  - `readFieldDefinitionDocument(document)` checks document shape and JSON types and returns plain
    drafts; `parseFieldDefinitionDocument(text)` adds `JSON.parse` for the editor.
  - `reviewFieldDefinitions(drafts, existingFieldNames)` returns a per-row `status` and `message`,
    so the preview can flag rows and recalculate after every edit.
  - `creatableFields`, `blockingRows`, `fieldDefinitionDocument`, `FIELD_TYPES`, `STATUS_LABELS`,
    and `MAX_BATCH_FIELDS` are the shared helpers used by the UI and the API.
  - Structural errors are thrown at parse time; everything a user can fix in the preview is a row
    status instead, so an imperfect document stays editable.
- `POST /api/categories/:id/fields/batch` in `server/src/index.js` accepts the same document,
  returns `404` for an unknown category, and re-runs the full review against the category's current
  fields rather than trusting the client. The first blocking row's message is returned as `400`.
  Accepted batches are inserted inside one `db.transaction`, so a category either gains all the
  fields or none of them; the `UNIQUE(category_id, name)` constraint is the last line of defence.
- `client/src/components/BatchAddFieldsDialog.vue` is the editor and preview. The drafts are plain
  reactive objects and the review is a computed value, which is what keeps the statuses and the
  **Create N Fields** count correct after each edit or removal. It uses the same Vue-driven
  Bootstrap modal markup as the About dialog, without Bootstrap JavaScript.
- `client/src/pages/Categories.vue` owns the button and reloads its fields and category counters
  through the existing `select`/`load` pair once the dialog reports a successful create.
- The Docker image copies `shared/` into both stages: the build stage needs it for `vite build`,
  and the runtime stage needs it because `server/src/index.js` imports it at startup.

## Boundaries

- Phase 1 has no AI dependency: no OpenAI call is made and no key is needed.
- Category templates, schema export, and import from an uploaded file are not part of this feature.
- Existing fields cannot be renamed or retyped from the batch editor; it only creates new fields.

## Verification

- `test/e2e.test.js` — `batch field creation validates the whole document and commits it
  atomically`: a successful batch, every blocking rule, the 50-field limit, the unchanged field
  count after each rejection, and `404` for an unknown category.
- `test/e2e/categories.spec.js` — `batch add fields reviews a pasted document before creating the
  fields`: paste, preview, per-row statuses, the disabled confirmation, removing an existing-name
  row, correcting an unsupported type, and the resulting fields and category counter.
