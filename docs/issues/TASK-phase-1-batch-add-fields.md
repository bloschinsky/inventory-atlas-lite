# Task: Batch Add Fields for Category — Phase 1

## Goal

Add a batch mode for creating multiple custom fields in a category at once.

Instead of adding fields one-by-one through the existing UI, the user should be able to paste a JSON definition containing multiple fields, validate it, review the resulting fields, edit them if necessary, remove unwanted fields, and create all approved fields in one operation.

This task is the foundation for future AI-assisted field generation, schema import/export, and reusable category templates.

---

## Scope

Implement a new **Batch Add Fields** flow in the category field management UI.

The feature should work independently of OpenAI or any AI integration.

---

## UX Flow

### 1. Entry point

Add a button near the existing field creation controls:

**Batch Add Fields**

Clicking it opens a modal or dedicated editor.

---

### 2. JSON editor

The user can paste or edit a JSON definition describing multiple fields.

Recommended initial format:

```json
{
  "version": 1,
  "fields": [
    {
      "name": "Brand",
      "type": "text",
      "required": false
    },
    {
      "name": "Model",
      "type": "text",
      "required": false
    },
    {
      "name": "Release Year",
      "type": "number",
      "required": false
    }
  ]
}
```

The JSON schema must be treated as an application-level import format and must **not** mirror SQLite/database implementation details directly.

---

## Supported field properties

At minimum:

- `name`
- `type`
- `required`

If the application already supports select-type fields, also support:

- `options`

Example:

```json
{
  "name": "Condition",
  "type": "select",
  "required": false,
  "options": [
    "New",
    "Excellent",
    "Good",
    "Fair",
    "Poor"
  ]
}
```

Use only field types that are actually supported by the current application.

Do not invent unsupported database or UI field types just for the batch mode.

---

## 3. Parse and validation step

The JSON must **never immediately modify the database**.

After the user clicks something like:

**Preview**

the application should:

1. Parse the JSON.
2. Validate the document structure.
3. Validate every field.
4. Compare proposed fields against existing category fields.
5. Display a structured preview.

Validation should detect at minimum:

- malformed JSON;
- missing `fields` array;
- missing or empty field name;
- unsupported field type;
- duplicate field names inside the imported JSON;
- fields that already exist in the category;
- reserved/system field names if applicable;
- invalid `options` values;
- invalid values for supported field properties.

Validation errors should be clearly displayed and should not cause partial creation.

---

## 4. Preview / review UI

After successful parsing, show every proposed field as an editable row/card.

Example:

| Field | Type | Required | Status | Actions |
|---|---|---|---|---|
| Brand | Text | No | New | Remove |
| Model | Text | No | New | Remove |
| Release Year | Number | No | New | Remove |
| Purchase Date | Date | No | Already exists | Remove |

Each proposed field must support:

- editing the field name;
- changing the field type using a selector/dropdown;
- changing `required` if the application supports it;
- editing field-specific options where relevant;
- **removing that individual field from the batch before creation**.

The user explicitly needs to be able to review the generated/imported set and remove fields they no longer want.

Removing a field from the preview must only remove it from the current batch draft. It must not affect existing category fields.

---

## 5. Review state

The preview should clearly show the validation state of each field, for example:

- New
- Duplicate in batch
- Already exists
- Invalid type
- Invalid configuration

Invalid rows should be visually distinguishable and the final create action should be disabled while blocking validation errors remain.

If a field is removed from the batch, validation should be recalculated for the remaining fields.

---

## 6. Final confirmation

After review, show a final action such as:

**Create N Fields**

where `N` reflects the current valid fields remaining in the batch.

The user must explicitly confirm creation.

---

## 7. Backend behavior

Creation must be handled as one batch operation.

Preferred behavior:

- atomic transaction;
- either all fields are created successfully or none are created;
- no partially-created batch if an unexpected error occurs.

The backend should also repeat critical validation rather than trusting the frontend.

---

## Suggested limits

Add a reasonable safety limit for the number of fields accepted in a single batch.

Suggested default:

- maximum 50 fields per batch.

The exact limit may be adjusted to match the existing application architecture.

---

## Architecture requirement

The batch JSON format should be implemented as a reusable field-definition DTO/schema.

Do not couple the editor directly to database column definitions.

The same format should be reusable later for:

- AI-generated fields;
- category schema import;
- category schema export;
- reusable category templates.

---

## Error handling

Examples of useful user-facing errors:

- `Invalid JSON`
- `Field name is required`
- `Unsupported field type: xyz`
- `Field "Brand" appears more than once in this batch`
- `Field "Purchase Date" already exists in this category`

Errors should be actionable and associated with the relevant row whenever possible.

---

## Acceptance Criteria

- A **Batch Add Fields** action exists in category field management.
- User can paste JSON containing multiple field definitions.
- JSON is parsed and validated before any database modification.
- User sees a preview of all proposed fields.
- User can edit field names before creation.
- User can change supported field types before creation.
- User can remove any individual proposed field from the batch.
- Validation updates after edits or removals.
- Existing fields and duplicate names are detected.
- Invalid batches cannot be committed.
- Final action clearly shows how many fields will be created.
- Batch creation is atomic.
- The implementation exposes a reusable field-definition format suitable for future AI generation/import/export features.
- No OpenAI dependency is introduced in this phase.

---

## Out of Scope

Do not implement in this phase:

- AI field generation;
- category templates;
- schema export;
- schema import from uploaded files;
- direct automatic database modification from pasted JSON without review.

---

## Dependency

None.

This task should be completed before **Phase 2 — AI Add Fields Batch**.
