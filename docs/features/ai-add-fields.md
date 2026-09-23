# AI Add Fields

## Summary

A category's custom fields can be drafted from a natural-language description instead of being
written by hand. **AI Add Fields** asks the configured AI provider for a field-definition document, then opens that
document in the same reviewed batch editor as
[Batch Add Fields](batch-add-fields.md): the user edits, removes, and explicitly confirms the
proposed fields before anything is created.

The AI layer is a draft generator only. It never touches the category schema or the database:
generation and persistence are separate requests, and persistence is the Phase 1 atomic batch
create.

## Flow

```text
Description → POST /api/categories/:id/fields/ai → field-definition document
            → shared validation → batch editor → user edit/remove/approve
            → POST /api/categories/:id/fields/batch (one transaction)
```

## User-visible behaviour

- **AI Add Fields** sits next to **Batch Add Fields** under the field form in *Categories & Fields*
  and opens the same modal in its AI mode, for the selected category.
- The first step is a **Field description** text area, for example
  `Suggest useful fields for a category containing vintage computer expansion cards such as graphics
  cards, sound cards, network cards and controllers.` **Generate Fields** sends it; while the request
  runs the button reads *Generating…*, the text area is disabled, and *Generating fields…* is shown.
- A successful answer is shown as the ordinary editable preview: one row per proposed field with its
  name input, type selector, recalculated status, and **Remove**. Everything Phase 1 supports —
  renaming, retyping, removing single rows, the per-row statuses, the disabled **Create N Fields**
  button while a row is blocking — works exactly the same on generated rows.
- **Edit Description** returns to the prompt with its text intact, so a draft can be regenerated.
- Failures are shown in the modal and leave the prompt in place for an unchanged retry: AI disabled
  or unconfigured, a rejected key, a rate limit, an unavailable provider, a timeout, a malformed
  answer, and an answer with no fields each have their own message.
- Nothing is created until **Create N Fields** is pressed. **Cancel**, the close button, `Escape`,
  and a click on the backdrop discard the whole draft.

## Implementation overview

- `AiFieldService` in `server/src/services/aiFieldService.js`
  reuses the stored AI settings — the same enable flag, provider, model, and API key as
  [AI Add Item](ai-add-item.md) — through `AiProviderService`. There is no second AI configuration,
  and it works with every [AI provider](ai-providers.md) and any text model.
- The request is schema-constrained: its strict `json_schema` allows only
  `version: 1`, `required: false`, and the field types the application actually supports
  (`text`, `number`, `date`, `boolean`), all derived from `shared/fieldDefinitions.js`.
- The prompt carries the description, the category name, its existing custom field names, the
  built-in item attributes, the supported types, and the 50-field limit, so the model can avoid
  proposing fields that already exist. Item data is never sent.
- The answer is treated as untrusted anyway. It is read with the same
  `readFieldDefinitionDocument` used for pasted JSON: an empty batch is `422`, anything that does
  not match the format is `502` with the underlying reason, and the client reads the response a
  second time before showing it.
- `POST /api/categories/:id/fields/ai` in `server/src/routes/fieldRoutes.js` calls that service,
  which validates the description
  (required, at most 2,000 characters), returns `404` for an unknown category, and answers with the
  draft document. It performs no write of any kind.
- `client/src/components/BatchAddFieldsDialog.vue` gained a `mode` prop (`json` or `ai`). Only the
  first step and the footer buttons differ; the preview, the review, and the create request are the
  Phase 1 code path unchanged.
- `AiProviderService.generateStructuredData()` is the one call both AI features make. The provider
  adapters under `server/src/integrations/` perform the HTTP request, apply the timeout, and map
  provider failures to status codes; see [AI providers](ai-providers.md).

## Boundaries

- No autonomous field creation, category design, schema migration, or AI-generated item values.
- The AI path cannot create anything the batch editor cannot: unsupported types, required fields,
  reserved names, duplicates, and existing names stay blocked by the shared review.
- Generation needs AI enabled with a valid key in Settings; the JSON batch editor still needs none.
- Category templates, schema export, and schema import remain future work.

## Verification

- `test/e2e.test.js` — `AI field generation returns a reviewable draft and never writes to the
  category`: the `409` guards, the `404` and description validation before any provider call, the
  prompt contents, the strict schema's type list, the unchanged field list after generation, a
  malformed answer (`502`), an empty answer (`422`), and creation only through the batch endpoint.
- `test/e2e/categories.spec.js` — `AI add fields reviews the generated draft in the batch editor
  before creating the fields`: a failed generation with a preserved prompt, retry, the per-row
  statuses of generated fields, removing and renaming rows, the unchanged category before
  confirmation, and the resulting fields and counter.
