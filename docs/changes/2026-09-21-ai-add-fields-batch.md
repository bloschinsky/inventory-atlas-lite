# AI Add Fields for a category

Completed on 2026-09-21 for version `0.15.0`.

*Categories & Fields* now has an **AI Add Fields** action next to **Batch Add Fields**. It opens the
same modal in an AI mode: the first step is a natural-language description of the category instead of
a pasted document, **Generate Fields** asks OpenAI for a field-definition document, and the answer
lands in the unchanged Phase 1 preview where every proposed field is reviewed, renamed, retyped,
removed, and finally confirmed with **Create N Fields**.

The AI layer only drafts. `POST /api/categories/:id/fields/ai` performs no write at all; the atomic
`POST /api/categories/:id/fields/batch` from Phase 1 stays the single create path and repeats the
full review server-side. A failed generation leaves the category untouched and keeps the description
in the modal for an unchanged retry.

`generateCategoryFields` in `server/src/ai.js` reuses the stored AI settings — the same enable flag,
provider, model, and key as AI Add Item — so no second OpenAI configuration exists. The request is
schema-constrained with a strict `json_schema` built from `shared/fieldDefinitions.js`, so the model
can only propose `version: 1`, `required: false`, and the four supported field types. The prompt
carries the description, the category name, its existing field names, the built-in item attributes,
the supported types, and the 50-field limit; no item data is sent. The answer is still treated as
untrusted and read with the same `readFieldDefinitionDocument` the pasted JSON uses: an empty batch
is `422`, a document that does not match the format is `502`, and the client reads it once more
before rendering the preview.

`requestOpenAiResponse` was extracted as the one place that performs an OpenAI `/responses` call,
applies the timeout, and maps provider failures to status codes; both AI features now use it.
`BatchAddFieldsDialog.vue` gained a `mode` prop, which changes only the first step and the footer
buttons — the preview, review, and create path are the Phase 1 code unchanged.

Documentation: the new [`docs/features/ai-add-fields.md`](../features/ai-add-fields.md) with its
index entry, a cross-reference in [`batch-add-fields.md`](../features/batch-add-fields.md), a
*Let AI suggest the fields for a category* section plus a privacy note and a troubleshooting row in
[`docs/HOW-TO.md`](../HOW-TO.md), and a roadmap update that removes the completed Phase 2 entry. The
Phase 2 task file was deleted.

Verification performed:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
