# Translate imported values with AI in Smart URL import

- **Completed:** 2026-10-22
- **Version:** 0.70.0
- **Issue:** #51 (AI Translation, Phase 3)

## Summary

- The Smart URL import review (`client/src/components/UrlImportDialog.vue`) has a new opt-in
  **Translate imported values with AI** card, shown when AI is enabled. It reuses
  `POST /api/ai/translate`, `LanguageSelect.vue`, the Preferred Content Language, and the selection
  bounds and identifier rule of Translate Item with AI. `identifierLike()` is now exported from
  `client/src/itemTranslation.js` for that purpose. The import pipeline, the AI enhancement and its
  grounding, and the server don't change.
- **Candidates.** These are the values the rows propose now: the page value, or the chosen and maybe
  edited AI suggestion. They cover Name, Description, and the text custom fields of the category
  chosen now. Source URL, prices, evidence, unmatched details, and other variants are never offered.
  The source is Auto-detect or chosen. The target defaults to the Preferred Content Language and can
  be any listed language.
- **Request and review.** One click sends one request. Each translation appears under its original
  with the original's provenance, an **AI translation** badge, an editable text, and its own **Use
  translation** checkbox. Row checkboxes never change, so filled fields stay unchecked. Withheld,
  unchanged, and untranslatable results keep the original.
- **Invalidation.** A new reading, a variant, a category, or an AI answer discards every translation,
  and late answers are ignored. A proposal edited after the request makes its translation unusable
  instead of overwriting the edit. A failure keeps every choice.
- **AI off.** Without AI, one line explains how to turn translation on.
- New EN/UK messages are under `urlImport.translate`. The user guide (EN/UK), `docs/features/smart-url-import.md`,
  `docs/features/ai-translation.md`, the feature index, and `AGENTS.md` are updated.

## Verification

- `npm run lint`: passed.
- `npm test`: 422 passed, 1 failed. The failure is *the guide renders Markdown safely and sends
  repository links to GitHub* in `test/landing.test.js`, a known Windows-only failure that also
  occurs on a clean `master`. The new service test covers import-shaped requests: identifiers kept,
  extra keys discarded, and the Source URL, price, and non-text keys refused before sending.
- `npm run build`: passed.
- `test/e2e/url-import-translation.spec.js` (5 tests) and `test/e2e/url-import.spec.js`: passed.
- `APP_VERSION=0.70.0 npm run test:e2e`: 296 passed.
