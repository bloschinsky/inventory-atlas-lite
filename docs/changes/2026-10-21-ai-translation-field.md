# AI translation — Phase 1: translation core, language preferences, and Translate Field

- **Date:** 2026-10-21
- **Version:** 0.68.0
- **Task:** GitHub issue #49

## Summary

- `shared/languages.js`: the content languages, independent of the interface locales — a common set
  (`en`, `uk`, `es`, `de`, `pl`, `fr`, `pt-BR`) and a bounded list of canonical BCP 47 tags (including
  `ja`, `zh`, `zh-Hans`, `zh-Hant`), normalization, closest match for a model's report, and
  `Intl.DisplayNames` names.
- Schema version 13 adds the nullable `database_metadata.content_language`, the per-database
  **Preferred Content Language**. `PUT /api/database/metadata/content-language` sets or clears it;
  `GET /api/database/metadata` returns it. It travels with backups and is restored with them.
- `server/src/services/aiTranslationService.js` and `POST /api/ai/translate`: a reusable, read-only
  translation of item text fields through `AiProviderService.generateStructuredData()`. Requests are
  bounded and allowlisted (core keys plus the category's text custom fields, resolved on the server),
  several fields travel in one provider call, trusted instructions stay apart from the texts, and each
  field's answer is validated: missing, duplicate, malformed, too long, or protected-token-altering
  proposals are withheld with a warning, and extra keys are discarded and counted.
- Item form: a **Translate** icon action beside Name, Description, Condition Notes, Location,
  Specific location, Transferred To, and custom text fields while AI is enabled
  (`TranslateFieldButton.vue` in `ItemDraftFields.vue`; the template editor has none), and
  `TranslateFieldDialog.vue` with the original text, Auto-detect or a chosen source, a searchable
  target (`LanguageSelect.vue`) defaulting to the Preferred Content Language or the interface language,
  the privacy note, an editable preview, **Use translation** that changes only the form, and a
  stale-response conflict.
- Settings → Database: **Preferred content language** with **Save language**; while unset, the
  interface language is only preselected and nothing is written.
- EN/UK messages for the UI, the new error codes, and the translation warnings.
- Documentation: `docs/features/ai-translation.md` (new), `docs/features/database-metadata.md`, the
  feature index, `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (*Translate a field with AI*, *Name the
  database*, limitations), `AGENTS.md` repository structure, and the 0.68.0 release-history entry.
- Tests asserting the current schema version now expect 13; `test/errors.test.js` lists `NFKC` as a
  non-code literal.

## Verification

- `npm run lint` and `npm run build` — passed.
- `npm test` — 418 passed, 2 failed: the two guide tests in `test/landing.test.js` that also fail on a
  clean `master` on Windows. `test/ai-translation.test.js` — 14 passed.
- `APP_VERSION=0.68.0 npm run test:e2e` — 284 passed, 1 failed: `condition-grading.spec.js` › *the info button beside
  Condition opens the grading help…*, whose click was intercepted by the hover-expanded sidebar; the
  spec passed 9 of 9 with `--repeat-each=3`. `test/e2e/translate-field.spec.js` — 6
  passed.
- The item form, the dialog on desktop and phone, and Settings → Database were checked on screenshots
  taken from the Playwright run.
