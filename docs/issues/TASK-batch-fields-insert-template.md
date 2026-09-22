# Task: Add `Insert Template` to Batch Add Fields

## Goal

Make the existing JSON example in **Batch Add Fields** directly usable instead of showing it only as a textarea placeholder.

Add an **Insert Template** action that puts the valid example JSON into the editor so the user can edit it immediately.

## Current behavior

`BatchAddFieldsDialog.vue` already builds a valid example using the shared field-definition helpers and uses it as the textarea placeholder.

Reuse that existing generated example.

Do not introduce a second hardcoded JSON template.

## Requirements

### 1. Add `Insert Template`

In **Batch Add Fields** JSON mode, add a small secondary action near the JSON editor:

**Insert Template**

On click:

- set the JSON editor value to the existing generated example;
- focus the editor;
- allow immediate editing;
- keep the existing Preview flow unchanged.

### 2. Do not silently destroy user input

If the editor is empty, insert immediately.

If the editor already contains non-empty user content that differs from the template:

- ask for confirmation before replacing it;
- cancel must leave the current JSON untouched.

A simple existing-project-style confirmation is sufficient.

### 3. JSON mode only

Show the action only in normal **Batch Add Fields** JSON mode.

Do not show it in **AI Add Fields** mode because AI mode uses a natural-language description instead of the JSON editor.

### 4. Keep one template source

Continue generating the template through the existing shared field-definition helpers, e.g. the current `fieldDefinitionDocument(...)` flow.

The inserted content and placeholder/example must never drift into two independently maintained formats.

### 5. No clipboard dependency

Do not require `navigator.clipboard` for the primary workflow.

Inventory Atlas Lite may run over plain HTTP on a local LAN, so the feature should work without secure-context clipboard permissions.

A separate **Copy** button is not required for this task.

## Tests

Add/update tests covering at least:

1. JSON mode shows **Insert Template**.
2. AI mode does not show **Insert Template**.
3. Clicking it with an empty editor inserts valid JSON.
4. Inserted JSON passes the existing Preview parser.
5. Existing user JSON is not replaced without confirmation.
6. Canceling replacement preserves the current JSON.
7. Confirming replacement inserts the current canonical example.
8. Existing Batch Add Fields preview/review/create flow remains unchanged.

## Documentation

Update the Batch Add Fields feature documentation / HOW-TO where appropriate.

Follow `AGENTS.md` documentation conventions.

## Out of scope

- changing the field-definition schema;
- adding schema import/export;
- category templates;
- clipboard-only workflows;
- backend changes.
