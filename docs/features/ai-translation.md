# AI translation

## Summary

Opt-in AI translation of one item text field in the unsaved Add/Edit Item form (Phase 1), on top of a
reusable, provider-neutral translation backend that later item-wide and URL-import flows can call.
Three languages stay independent: the per-browser **interface language**, the per-database
**Preferred Content Language**, and the **source language** of each text (detected automatically
unless the user chooses one). Translation is always review-only: nothing is saved until the user
presses **Save item**.

## User-visible behaviour

- While AI is enabled (`capabilities.ai.enabled`), `ItemDraftFields.vue` shows a compact
  **Translate** icon button (`TranslateFieldButton.vue`, hidden text `Translate <field>`) beside the
  label of **Name**, **Description**, **Condition Notes**, **Location**, **Specific location**,
  **Transferred To**, and every custom field of type `text`. Number, date, yes/no, and color fields,
  the serial number, the price, and the Source URL get none. The template editor never passes
  `translatable`, so its form is unchanged. A button of an empty field is disabled.
- The button opens `TranslateFieldDialog.vue`, a Tabler modal (full screen on phones) with the
  **Original text** (the live form value, read-only), **Source language** (Auto-detect or a listed
  language), **Translate into** (the database's Preferred Content Language, or the interface language
  while none is saved), a note that only this text, the field name, and the category name go to the
  configured provider, the AI status or error, and an editable **Translation**. Nothing is sent until
  **Translate** is pressed; **Translate again** repeats it only on request.
- **Use translation** writes only that field of the form and returns focus to its input. **Cancel**,
  the close button, Escape, or a backdrop click keep the original, and a late response after closing
  is ignored. Other unsaved form values are never touched.
- Stale responses: the dialog remembers the exact text it sent. When the field differs from it (it
  was edited while the request was pending), a conflict alert replaces the offer and **Use
  translation** is disabled until the current text is translated again.
- Per-field warnings (unchanged, untranslatable, withheld proposals) and **Detected language** are
  shown in the dialog in the interface language.
- `LanguageSelect.vue` is the shared language picker: the common languages first, then all others
  sorted by their name in the interface language, with a **Search languages…** box that matches a
  language's name in the interface language, its own name, its English name, or its tag, and selects
  the first match.
- **Settings → Database** adds **Preferred content language** with **Save language**; see
  [Database metadata](database-metadata.md).

## Languages

`shared/languages.js` is the single list of content languages: `COMMON_CONTENT_LANGUAGES` (`en`,
`uk`, `es`, `de`, `pl`, `fr`, `pt-BR`) and about 65 canonical BCP 47 tags in `CONTENT_LANGUAGES`,
including `ja`, `zh`, `zh-Hans`, and `zh-Hant`. `normalizeContentLanguage()` accepts only a tag on the
list (case-insensitive, canonicalized by `Intl.getCanonicalLocales`), so no free-form text reaches a
prompt or the database. `closestContentLanguage()` maps a model's report such as `ja-JP` or `zh-TW` to
the closest listed tag. Names come from `Intl.DisplayNames`. These are content languages, not
interface localizations: the interface stays English and Ukrainian.

## API

`POST /api/ai/translate` (`server/src/routes/aiRoutes.js` → `AiTranslationService.translate()`):

```json
{
  "targetLanguage": "en",
  "sourceLanguage": "auto",
  "categoryId": 3,
  "fields": [{ "key": "name", "text": "ソニー ウォークマン WM-FX195" }, { "key": "field:12", "text": "ベルト交換済み" }]
}
```

- `key` is a core key (`name`, `description`, `condition_notes`, `location`, `location_detail`,
  `transferred_to`; `TRANSLATABLE_CORE_FIELDS`) or `field:<id>` of a custom field. Location,
  Specific location, and Transferred To are marked `explicitOnly`: a future item-wide translation must
  not include them by default.
- Custom fields are resolved from the category's schema on the server: a field of another category or
  one that does not exist is `TRANSLATION_FIELD_NOT_IN_CATEGORY`, a non-text type
  `TRANSLATION_FIELD_NOT_TEXT`; a client-supplied type or label is ignored.
- Bounds: 1–20 fields, unique keys, non-empty text of at most 2,000 characters per field (255 for
  `location_detail` and `transferred_to`), 10,000 in total. Every refusal is a 400 with a stable code,
  checked before the AI state, the provider, or anything else is used.
- Several fields travel in one provider call; the Phase 1 UI sends one.

Response:

```json
{
  "targetLanguage": "en",
  "sourceLanguage": "auto",
  "fields": [{ "key": "name", "source": "…", "translation": "Sony Walkman WM-FX195", "detectedLanguage": "ja", "status": "translated", "warnings": [] }],
  "warnings": []
}
```

`status` is `translated`, `unchanged` (translation is the source), `untranslatable` (only names, codes,
or numbers; translation is `null`), or `invalid` (no proposal; the warning says why).
`detectedLanguage` is the chosen source, or a listed tag the model reported, or `null`.

## Provider request and validation

- It runs through `AiProviderService.generateStructuredData()` with the configured provider and model
  (OpenAI, OpenRouter, Ollama, LM Studio, custom): no second configuration, no image, no tools or
  browsing, and no retry of its own. `assertReady()` reports disabled or unconfigured AI as usual.
- The trusted instructions are separate from the input. The input JSON holds only the two languages
  (tag and English name), the category name, and per field its key, English core label or custom
  field name, and text. The instructions treat every text as untrusted data, never instructions, and
  require identifiers, codes, addresses, prices, dates, numbers, quantities, and units to be copied as
  written.
- The model output must be exactly `{ translations: [...] }` (else `502 AI_INVALID_RESPONSE`). Each
  requested field is judged on its own: missing (`TRANSLATION_WARNING_MISSING`), repeated
  (`…_DUPLICATE`), extra properties or a wrong type or status (`…_MALFORMED`), over the field's limit
  (`…_TOO_LONG`, never truncated), or with an altered protected token (`…_PROTECTED_CHANGED`) yields
  `invalid` with no proposal. Entries for keys that were never requested are discarded and counted
  (`TRANSLATION_WARNING_EXTRA`). Control characters are removed; only Description and Condition
  Notes keep line breaks.
- Protected tokens: web and e-mail addresses and every ASCII token with a digit (`WM-FX195`, serials,
  UUIDs, dates, prices) must appear unchanged in the NFKC-normalized translation; a plain number (or a
  number followed by a short unit, such as `320g`) is compared by its digits, so a decimal separator
  may change but the value may not. Unlike Smart URL import, there is no source-word grounding check,
  because a translation changes vocabulary by design.
- The endpoint is read-only: it writes no item, setting, or metadata, and starts no background work.

## Files

- `shared/languages.js` — content language list, normalization, closest match, names.
- `server/src/services/aiTranslationService.js` — request reading, prompt, schema, and validation.
- `server/src/routes/aiRoutes.js`, `server/src/app.js` — the route and its wiring.
- `client/src/components/TranslateFieldButton.vue`, `TranslateFieldDialog.vue`, `LanguageSelect.vue`,
  `ItemDraftFields.vue`, `client/src/pages/ItemForm.vue`.
- `test/ai-translation.test.js`, `test/e2e/translate-field.spec.js`.

## Out of scope

Whole-item translation, translation inside Smart URL import, bulk translation, multilingual storage,
translation history, automatic translation, and new interface localizations.
