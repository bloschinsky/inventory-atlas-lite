# Batch Add Fields for a category

Completed on 2026-09-21 for version `0.14.0`.

*Categories & Fields* now has a **Batch Add Fields** action next to the single-field form. It opens a
modal where a field-definition document is pasted, validated with **Preview**, reviewed as editable
rows, and finally committed with **Create N Fields**. Pasted JSON never reaches the database before
that explicit confirmation, and the whole batch is inserted in one transaction.

`shared/fieldDefinitions.js` is the new application-level field-definition format, imported by both
the client and the server so validation exists once. It describes fields in product terms (`name`,
`type`, `required`, a `version`, and a 50-field limit) rather than mirroring the SQLite columns, and
is the format Phase 2 AI generation, schema import, schema export, and category templates will reuse.
Structural problems are reported as a single document error; everything a user can fix — an empty
name, an unsupported type, a reserved name, a duplicate inside the batch, a name that already exists
in the category, `"required": true` — becomes a per-row status that is recalculated after each edit
or removal, so the confirmation stays disabled while a blocking row remains.

`POST /api/categories/:id/fields/batch` repeats the full review against the category's current
fields instead of trusting the client, returns the first blocking message as `400`, and inserts the
accepted fields inside one `db.transaction`. The server's field-type list now comes from the shared
module as well. No OpenAI dependency was introduced.

Documentation: the new [`docs/features/batch-add-fields.md`](../features/batch-add-fields.md) with
its index entry, a *Add several fields at once* section and an updated limitation in
[`docs/HOW-TO.md`](../HOW-TO.md), and a roadmap update that removes the completed Phase 1 entry and
marks Phase 2 unblocked. The Phase 1 task file was deleted.

Verification performed:

- `npm run lint`
- `npm test` — 28 passed and 1 environment-dependent check skipped, including the new batch
  validation and atomicity test
- `npm run build`
- `npm run test:e2e` — 29 Playwright scenarios passed in Chromium, including the new batch review
  workflow
