# Smart URL import, Phase 2: optional AI enrichment

- Completed: 2026-10-10
- Version: 0.65.0
- Task: GitHub issue #34 (builds on #33, Phase 1)

## Summary

The Smart URL import review can now ask the configured AI provider to map the extracted product facts
to existing fields. It is strictly opt-in and Phase 1 stays fully usable without AI; see the
*AI enhancement* section of `docs/features/smart-url-import.md`.

- **Server:** `POST /api/items/import-url/:token/ai` (`routes/urlImportRoutes.js`,
  `services/urlImportAiService.js`). The preview session now keeps the extracted `product`,
  `provenance`, and `price` beside the image candidates (`UrlImportService.facts()`), so the
  enhancement reads only facts the server extracted itself. The provider gets trusted instructions
  apart from one JSON message with the allowed categories and fields (without serial, purchase,
  price, location, and condition fields) and the page facts bounded to 12,000 characters; larger
  category lists require choosing a category first (`URL_IMPORT_AI_CHOOSE_CATEGORY`). It goes through
  `AiProviderService.generateStructuredData()`, so provider choice, model discovery, timeouts, and
  errors are shared with the other AI features.
- **Validation:** the answer's shape is strict (`AI_INVALID_RESPONSE`); every suggestion must use an
  allowed field, a known confidence, an evidence quote found in the page facts, and a value of the
  field type (numbers must appear in their evidence, text may only use page words, colors via the
  shared AI color reading, then `validateFieldValue()`). Failing suggestions are dropped and counted
  (`URL_IMPORT_AI_WARNING_DROPPED`), contradictory ones dropped as a conflict
  (`URL_IMPORT_AI_WARNING_CONFLICT`). The AI may only point at one of the page's own prices; no
  amount, currency, serial number, condition, location, or purchase value can come out.
  `categorySchema()`, `aiColorValue()`, and `cleanString()` are now exported from
  `aiItemAnalysisService.js` and reused instead of duplicated.
- **Client:** `UrlImportDialog.vue` shows an **Enhance with AI** card only while AI is enabled,
  explaining what is shared. Suggestions join the same Current → Found rows with an **AI suggestion**
  badge, confidence, and evidence; page values stay chosen unless the user picks or edits the AI value,
  low-confidence rows start unchecked, earlier choices survive **Ask AI again**, and **Discard AI
  suggestions** removes them. A new item without a category takes the AI's category; the AI offer
  price only preselects and badges a price, while **Use page price as Purchase Price** stays a
  separate, unchecked opt-in. Errors keep the page review usable.
- **Copy and docs:** `urlImport.ai.*`, `urlImport.sources.ai`, and the new error and warning codes in
  English and Ukrainian; `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (new step and limitation), the
  feature document and its index entry, `AGENTS.md`, and the 0.65.0 release-history entry.

## Verification

- `npm run lint` — passed.
- `npm test` — 383 tests: 380 passed, 2 failed, 1 skipped. The two failures are the known guide tests in
  `test/landing.test.js` that fail the same way on a clean checkout on this Windows machine. The new
  `test/url-import-ai.test.js` (8 tests) and `test/url-import.test.js` passed.
- `npm run build` — passed.
- `APP_VERSION=0.65.0 npm run test:e2e` — 247 of 247 passed, including three new AI tests in
  `test/e2e/url-import.spec.js`.
