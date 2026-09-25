# User-defined item templates

- **Completed:** 2026-09-25
- **Version:** 0.37.0

## Summary

- New `item_templates` and `item_template_field_values` tables (schema version 2), created by the
  usual additive `applySchema()` path for existing databases and older backups. A template stores a
  name, a nullable category (`ON DELETE SET NULL`), a default item name, and the item base fields;
  its custom field values keep no foreign key to `custom_fields`, so values of deleted fields are
  ignored and reported instead of lost silently.
- `ItemTemplateRepository`, `ItemTemplateService`, and `routes/itemTemplateRoutes.js` add
  `GET/POST /api/item-templates`, `GET/PUT/DELETE /api/item-templates/:id`, and
  `GET /api/item-templates/:id/item-draft`, which returns the item draft or
  `409 TEMPLATE_CATEGORY_MISSING`. New error codes: `TEMPLATE_NOT_FOUND`, `TEMPLATE_NAME_REQUIRED`,
  and `TEMPLATE_CATEGORY_MISSING`.
- `shared/itemValidation.js` gained `readItemDetails()` and `readFieldValues()`; the item service and
  the template service both use them, so templates and items share one set of rules and codes.
- The client prefill was unified in `client/src/itemDraft.js` (`useItemDraftForm`, `draftFromItem`,
  `draftFromTemplate`) and `components/ItemDraftFields.vue`, which the item form and the new
  template editor share. `ItemForm.vue` now resolves one draft from the edited item, a pending AI
  draft, or `?template=`.
- New **Templates** page and navigation entry with search, **Use**, **Edit**, and **Delete**; a
  template editor that also starts from an item through **Save as template**; an **Add item** split
  button on **Items** with **Blank item**, **From template…** (a template picker dialog), and
  **AI Add Item**.
- Templates are counted in the restore validation summary and the reset impact list, and the backup
  and Danger Zone texts mention them. English and Ukrainian strings were added for every new text.
- Documentation: new `docs/features/item-templates.md`; updates to `docs/HOW-TO.md`,
  `docs/features/README.md`, `database-backup-and-restore.md`, `inventory-database-reset.md`,
  `ai-feature-visibility.md`, `docs/ROADMAP.md` (Duplicate existing item is now unblocked),
  `AGENTS.md`, and the release history. The completed task file was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 146 tests: 145 passed, 1 skipped (shellcheck is not installed locally), including the
  new service tests for template management, validation, item drafts, item independence, deleted
  fields, and deleted categories; the new HTTP test in `test/e2e.test.js`; and the extended restore
  and reset tests with template counts, restore, and the schema version 2 migration.
- `npm run build` — passed.
- `npm run test:e2e` — 93 passed, including the new `test/e2e/templates.spec.js` (create, edit, use,
  and delete a template; the Add item menu and template picker; Save as template; the blank form; a
  template whose category was deleted) and the updated navigation and reset specs.
