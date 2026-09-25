# Frontend localization: English and Ukrainian

- **Completed:** 2026-09-25
- **Version:** 0.33.0

## Summary

- Added `vue-i18n` 11 (Composition API) with English and Ukrainian locales in
  `client/src/i18n/locales/`, grouped by feature. English is the default and the fallback; development
  builds warn about missing keys.
- New `client/src/i18n/core.js` (supported locales, vue-i18n options, Ukrainian one/few/many plural
  rule, `Intl` formatters for dates, timestamps, numbers, money, and file sizes) and
  `client/src/i18n/index.js` (the instance, `setLocale`, and formatters bound to the active locale).
- **Settings** gained an **Interface** card with a **Language** selector (English / Українська). The
  switch applies immediately, sets `<html lang>`, and is stored in `localStorage` under
  `inventory-atlas.locale`; nothing is stored on the server or in SQLite.
- Every component and page now takes its visible text, placeholders, accessible names,
  confirmations, prompts, and interface-generated notices from translation keys, with vue-i18n
  pluralization for counts. User data and server messages are shown unchanged.
- Item details show purchase dates, prices, and record timestamps in the active locale; the Dashboard,
  cloud backup times and weekdays, backup file sizes, and Version History dates follow it as well.
  Dashboard summary buckets (`Other`, `Not specified`) are translated by key.
- The update panel and the QR scanner keep translation keys in their state; the English AI provider
  help texts moved from `shared/aiProviders.js` into the locales, and the unused English field-type and
  status labels were removed from `shared/fieldDefinitions.js`.
- `AGENTS.md` now requires localized UI text with both `en` and `uk` values for all new frontend work.
- Documentation: new `docs/features/interface-localization.md`, the feature index,
  `docs/features/application-ui.md`, `docs/HOW-TO.md`, `docs/ROADMAP.md`, the backend error
  localization task dependency, and the release history. The completed task file was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 128 passed, 1 skipped (shellcheck is not installed locally), including the new
  `test/i18n.test.js` (default and fallback locale, key parity, compilation of every message,
  Ukrainian plurals, unchanged user data, date/number/money/file-size formatting).
- `npm run build` — passed. The main bundle grows from 421 kB to 540 kB (178 kB gzip) because
  vue-i18n compiles the JSON messages in the browser, so Vite now prints its 500 kB chunk-size notice.
- `npm run test:e2e` — 85 passed, including the new `test/e2e/i18n.spec.js`; the purchase price
  expectations in `items.spec.js` and `batch-items.spec.js` now use the locale currency format, and the
  field type checks in `categories.spec.js` ignore case.
- The Ukrainian interface was inspected in Chromium at 1440 and 390 px wide on Dashboard, Items, the
  item form, Categories, Data / Backup, and Settings, without horizontal overflow.
