# AI translation — Phase 2: Translate Item with AI

- **Date:** 2026-10-21
- **Version:** 0.69.0
- **Task:** GitHub issue #50

## Summary

- **Translate with AI** on Item Details (a link to `/items/:id/edit?translate=item`) and in the header
  of the Add/Edit Item form, shown only while AI is enabled, so never in the public demo or the
  template editor. Opening the dialog sends nothing.
- `client/src/components/TranslateItemDialog.vue`: a two-step Tabler modal (full screen below `md`).
  Select: Auto-detect or a chosen source, a target defaulting to the Preferred Content Language (else
  the interface language), and one checkbox row per non-empty text field of the live, unsaved form,
  with Select all / Select none. Review: Current beside an editable translation per field, the
  detected language, its warnings, and an Apply checkbox. Apply emits only the approved texts by key.
- `client/src/itemTranslation.js`: the candidates and their default selection (Name, Description,
  Condition Notes, and custom text fields on; Location, Specific location, Transferred To, identifier-
  like custom fields, and values that look like codes off; over-long texts not selectable), the
  request-bound check, and `applyTranslations()` used by `ItemForm.vue`.
- One `POST /api/ai/translate` carries all chosen fields. Over 20 fields or 10,000 characters, the
  dialog asks the user to clear fields instead of splitting the request. `unchanged` rows start
  unticked; `untranslatable` and `invalid` rows show their reason and offer nothing to apply.
- Conflicts: a row whose form value changed after it was sent, or a custom field row after a category
  change, cannot be applied until **Preview again**. Late responses after Change selection, a newer
  preview, or closing are ignored.
- `shared/translationFields.js` now holds `TRANSLATABLE_CORE_FIELDS` and `TRANSLATION_LIMITS`, which
  the server enforces and the client checks against. No server behavior changed.
- `loadContentLanguage()` in `client/src/activeDatabase.js` is shared by both translation dialogs.
- EN/UK messages, `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (*Translate an item with AI*, limitations,
  Preferred content language), `docs/features/ai-translation.md`, the feature index, `AGENTS.md`, and
  the 0.69.0 release-history entry.

## Verification

- `npm run lint` and `npm run build`: passed.
- `npm test`: 422 passed, 0 failed, 1 skipped. `test/ai-translation.test.js` has 16 tests, including
  the whole-item candidates, one provider call for the chosen fields only, exact custom field ids,
  mixed-language detection, selective apply, and the request limits.
- `APP_VERSION=0.69.0 npm run test:e2e`: 291 passed. After a final fix in the dialog (the category
  for the conflict check is now captured when the request is sent), `test/e2e/translate-item.spec.js`
  was run again: 6 passed.
- The dialog was checked on desktop and phone screenshots taken during the Playwright run.
