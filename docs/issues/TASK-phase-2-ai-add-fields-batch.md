# Task: AI Add Fields Batch — Phase 2

## Goal

Add AI-assisted generation of category fields using the existing OpenAI integration.

The user should describe in natural language what kind of category or fields they need. The application sends that description to OpenAI, receives a structured field-definition JSON document, and opens the result inside the existing **Batch Add Fields** editor from Phase 1.

AI must never create category fields directly.

The user must always review, edit, remove, and explicitly approve the proposed fields before they are saved.

---

## Dependency

**Blocked by: Phase 1 — Batch Add Fields for Category**

This feature must reuse the batch editor, validation, preview, edit, remove, and atomic-create pipeline implemented in Phase 1.

Do not create a separate AI-specific field creation flow.

---

## UX Flow

Add a new action near the existing field-management controls:

**AI Add Fields**

or:

**AI Add Fields Batch**

Clicking it opens a simple prompt modal/editor.

Example user input:

> Suggest useful fields for a category containing vintage computer expansion cards such as graphics cards, sound cards, network cards and controllers.

Another example:

> Create fields for a Literature category containing books, magazines, catalogs and photo albums.

---

## AI request

Send the user's description through the existing OpenAI integration.

The model should be instructed to return only structured data matching the same reusable field-definition schema introduced in Phase 1.

Expected format:

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

If supported by the application:

```json
{
  "name": "Type",
  "type": "select",
  "required": false,
  "options": [
    "Graphics Card",
    "Sound Card",
    "Network Card",
    "Controller"
  ]
}
```

---

## Structured output requirement

Prefer structured output / schema-constrained generation if supported by the current OpenAI implementation.

The model must only be allowed to propose field types supported by Inventory Atlas Lite.

The OpenAI response must be treated as untrusted input and passed through the same validation used for manually pasted JSON.

Never assume the AI response is valid just because it came from a structured prompt.

---

## Result handling

After receiving the AI response:

1. Parse the returned field-definition JSON.
2. Run the Phase 1 validation pipeline.
3. Open the existing Batch Add Fields preview/editor.
4. Populate it with the AI-generated fields.
5. Allow the user to review and modify the result.

The user must be able to:

- rename any field;
- change field type;
- edit field-specific settings/options;
- **remove any individual proposed field**;
- fix validation issues;
- cancel the entire operation.

Only after explicit approval should the user be able to click:

**Create N Fields**

---

## Important safety / architecture rule

The AI layer must never directly modify category schema or database state.

Required architecture:

```text
User Prompt
    ↓
OpenAI API
    ↓
Field Definition JSON
    ↓
Existing Batch Validation
    ↓
Existing Batch Editor / Preview
    ↓
User Edit / Remove / Approve
    ↓
Existing Atomic Batch Create
```

OpenAI is only a generator of draft field definitions.

The Phase 1 batch mechanism remains the single source of truth for validation and persistence.

---

## Prompt construction

The request sent to OpenAI should include:

- user's natural-language description;
- list of supported field types;
- concise explanation of the expected schema;
- instruction to avoid unsupported field types;
- instruction to avoid obvious duplicates;
- instruction to create practical inventory fields rather than overly specific or redundant fields.

If available, also include relevant category context such as:

- category name;
- existing custom fields;
- existing global/base fields.

This helps the model avoid proposing fields that already exist.

However, the backend validation must still detect duplicates.

---

## Existing field awareness

Before calling the model, provide the names of fields already available to the category when practical.

Example context:

```text
Existing fields:
- Name
- Condition
- Description
- Location
- Purchase Date
- Purchase Price
- Serial Number
```

The model should be instructed not to suggest these again unless there is a strong reason.

The normal Phase 1 validation remains responsible for enforcing this.

---

## Loading and errors

The UI should provide clear states for:

- generating;
- malformed AI response;
- OpenAI API failure;
- timeout/network failure;
- no useful fields returned;
- validation errors in generated fields.

A failed AI call must not change category data.

The user should be able to retry without losing their original prompt.

---

## Settings / model usage

Reuse the application's existing OpenAI configuration and model-selection mechanism.

Do not hardcode a second independent OpenAI API configuration specifically for this feature.

If the project already allows selecting an OpenAI model in Settings, this feature should use that configured model unless there is a strong architectural reason not to.

---

## Acceptance Criteria

- An **AI Add Fields** action exists in category field management.
- User can describe desired fields in natural language.
- Request uses the existing OpenAI integration.
- AI returns data matching the Phase 1 field-definition format.
- AI response is validated as untrusted input.
- Generated fields open in the existing Batch Add Fields editor.
- User can edit names and types before saving.
- User can remove any individual AI-generated field before saving.
- Existing field collisions are detected.
- Unsupported field types cannot be created.
- AI never writes directly to the database.
- User must explicitly approve the final batch.
- Final persistence uses the atomic batch-create mechanism from Phase 1.
- API/network/validation failures leave category data unchanged.
- The implementation reuses Phase 1 rather than duplicating batch field logic.

---

## Out of Scope

Do not implement in this phase:

- automatic field creation without user review;
- fully autonomous category design;
- background schema modification;
- reusable category-template marketplace;
- automatic migration of existing category data;
- AI-generated item values.

---

## Future Extensions

This architecture should make the following future features straightforward:

- Export Category Schema to JSON
- Import Category Schema from JSON
- Built-in Category Templates
- AI-generated category templates
- Sharing field schemas between Inventory Atlas Lite installations
