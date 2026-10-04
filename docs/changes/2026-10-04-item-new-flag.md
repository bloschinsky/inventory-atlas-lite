# Core New boolean field on items

- **Completed:** 2026-10-04
- **Version:** 0.48.0

## Summary

Implemented GitHub issue #1, *TASK: Add Core `New` Boolean Field to Items*. Every item now has a core
boolean **New** attribute, independent from **Condition**, which remains free text describing the
physical state. Nothing is parsed from or written to Condition.

- **Schema version 6:** `items.is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1))` and the
  nullable `item_templates.is_new INTEGER CHECK (is_new IN (0, 1))`. `applySchema()` adds both in place,
  so existing items become `false`, existing templates keep no New default, and Condition values such
  as `New`, `Like new`, or `Used once` stay untouched. Both columns are in `CURRENT_SCHEMA`, so restore
  migrates and validates older backups as before.
- **API and validation:** `is_new` is a JSON boolean in item and template requests and responses.
  `validateIsNew()` and `validateTemplateIsNew()` in `shared/itemValidation.js` accept only `true` or
  `false` (`null`/omitted means `false` for an item and unset for a template) and refuse anything else
  with the new `INVALID_IS_NEW` code. Create, edit, batch create, and the template item draft use them;
  the repositories store `0`/`1`/`NULL` and the services return booleans.
- **Items list:** a new `isNew` boolean core column (hidden by default, sortable, localized Yes/No),
  sorted through the server whitelist with the item id as a stable tie-breaker.
- **Form and details:** a **New** switch in Add/Edit Item, a **Not set / No / Yes** select in the
  template editor, and an always explicit **New** row on Item details. Drafts carry `is_new`, so
  Duplicate, templates, and AI drafts prefill it.
- **Batch Add Items:** an optional boolean `new` per item, included as `false` in the generated
  template and shown as a switch on every preview card. Non-boolean values are refused with the new
  `IMPORT_ITEM_BOOLEAN_EXPECTED` code by the shared reader that both the preview and the API use. The
  document stays version 1 because the property is optional.
- **AI Add Item:** the structured output schema gains a required boolean `is_new`; the instructions set
  it only on explicit evidence (stated by the user, or readable labeling or context) and never from a
  box, clean packaging, a pristine look, or no visible wear. Normalization keeps only an explicit `true`,
  reads a missing or `null` flag as `false`, and rejects other values as `AI_INVALID_RESPONSE`.
- **i18n:** `items.fields.isNew` and the two new error messages in English and Ukrainian; the template
  tri-state reuses `templates.notSet`, `common.no`, and `common.yes`.
- **Documentation:** new `docs/features/item-new-flag.md` and its index entry; updated
  `batch-add-items.md`, `item-templates.md`, `duplicate-item.md`, `ai-add-item.md`,
  `item-list-columns-and-sorting.md`, `database-backup-and-restore.md` (schema version 6),
  `docs/HOW-TO.md`, `AGENTS.md`, and the 0.48.0 release-history entry. The task was tracked as a GitHub
  issue, so there was no `docs/issues/` file to remove.

## Verification

- `npm run lint` — passed.
- `npm test` — 239 tests: 237 passed, 1 skipped (shellcheck is not installed locally), and 1 failure
  unrelated to this change: `staged uploads from an interrupted run are cleared when the server
  starts` received `fetch failed: bad port` because the operating system picked a free port that
  `fetch` refuses; `test/restore.test.js` passed 8/8 when run again. New coverage:
  `test/item-new-flag.test.js` (9 tests: fresh schema, the version 5 → 6 migration with Condition
  untouched and idempotence, restore validation of a version 5 backup, create/edit/default, strict
  refusal of non-booleans, list values and deterministic sorting, the column catalog entry, template
  `NULL`/`false`/`true` defaults and items created from them, and batch `new` in the preview reader
  and the API), a new AI test in `test/ai-providers.test.js`, and HTTP assertions in
  `test/e2e.test.js`. Existing tests were updated for schema version 6 and the new import property.
- `npm run build` — passed.
- `npm run test:e2e` — 120 Chromium tests: 113 passed, and the 7 What's New tests failed only because
  the uncommitted working copy sits on the `v0.47.0` tag, which `vite.config.js` prefers over
  `package.json`. With `APP_VERSION=0.48.0`, the What's New, Version History, and About specs passed
  (21/21). Playwright now covers toggling New on create and edit and reading it on Item details, the
  template default flowing into the item form, Duplicate, the Columns picker with Yes/No cells, and
  the batch preview switch and refusal of a non-boolean `new`.
- Release: the `v0.48.0` Release workflow stopped in `npm run test:e2e` with 119 passed and 1
  failed, so no release was published. The new New-switch step of `test/e2e/items.spec.js` was blocked
  by the expanded folded-hover sidebar on Linux headless Chromium; 0.48.1 fixes the test and publishes
  this feature (see `2026-10-04-item-new-flag-release-test.md`).
