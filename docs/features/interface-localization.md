# Interface localization: English and Ukrainian

## Summary

The whole browser interface is available in English and Ukrainian. The language is chosen in
**Settings → Interface → Language**, applies immediately without a reload, and is remembered in the
current browser only. English is the default for a browser without a saved choice and the fallback
for any message that has no Ukrainian text. Dates, numbers, prices, and file sizes are displayed in
the conventions of the active language; stored values and the API are unchanged.

## User-visible behaviour

- **Settings** starts with an **Interface** card holding the **Language** selector with the entries
  **English** and **Українська**, each written in its own language.
- Changing the selection re-renders every page, the sidebar, the mobile drawer, and open dialogs at
  once, and sets the `lang` attribute of the document. A reload keeps the choice.
- The preference is stored in `localStorage` under `inventory-atlas.locale`. It is never sent to the
  server or written to SQLite, so every browser and device keeps its own language. A blocked storage
  only loses the persistence; the switch still works for the open page.
- Translated: navigation, page headers, Dashboard, the items list and cards, item details, the item
  form, AI Add Item, categories and fields, Batch Add Fields/AI Add Fields, Batch Add Items, QR code,
  QR scanner, label printing, Settings (AI and Cloud Backup), Data / Backup, the reset dialog, About,
  the update panel with its phases, steps, and hints, Version History, the colour-mode control,
  placeholders, empty states, browser confirmations and prompts, success and error notices generated
  by the interface, and accessible names (`aria-label`, `title`, `alt`).
- Counts use proper plural forms: two in English (`1 item`, `2 items`) and three in Ukrainian
  (`1 предмет`, `3 предмети`, `5 предметів`).
- Weekday names in the cloud backup schedule come from the active locale.

## What is never translated

- User data: item, category, and custom-field names, descriptions, conditions, locations,
  Transferred To, serial numbers, entered field values, and imported JSON are shown exactly as stored.
- Release notes in Version History, which are bundled release data, and fixed technical text such as
  confirmation phrases (`RESTORE`, `RESET INVENTORY`), file names, paths, and environment variables.
- Summary buckets that the Dashboard API names in English (`Other`, `Not specified`) are recognized
  by their keys and translated in the browser; user-entered conditions stay as they are.

## Server messages

API errors, validation refusals from the shared rules, and connection test results arrive as stable
codes with parameters and are translated in the browser; see [`api-error-codes.md`](api-error-codes.md).
User data and diagnostic values inside them are inserted unchanged.

## Locale-aware formatting

All display formatting is centralized in `client/src/i18n/core.js` on top of the built-in `Intl` APIs
and exposed for the active locale by `client/src/i18n/index.js`:

| Value | Formatter | English | Ukrainian |
| --- | --- | --- | --- |
| Purchase date (calendar day, always UTC) | `formatDate` | Nov 18, 2024 | 18 лист. 2024 р. |
| Record and cloud backup timestamps | `formatDateTime` | Nov 18, 2024, 9:05 PM | 18 лист. 2024 р., 21:05 |
| Dashboard numbers | `formatNumber` | 1,234 | 1 234 |
| Purchase price | `formatMoney` | $49.99, UAH 1,500.00 | 49,99 USD, 1 500,00 ₴ (грн in older ICU data) |
| Backup file sizes | `formatFileSize` | 1.5 MB | 1,5 МБ |

`formatMoney` keeps every decimal the stored amount has (12.3456 stays 12.3456) and falls back to
`<number> <code>` for a currency code `Intl` does not know. Cloud backup times keep the server time
zone the schedule is entered in. The exact Ukrainian abbreviations and currency sign depend on the
browser's ICU data.

## Implementation

- `vue-i18n` 11 in Composition API mode (`legacy: false`), installed once in `client/src/main.js`.
  Vite defines its compile-time flags (`__VUE_I18N_FULL_INSTALL__`, `__VUE_I18N_LEGACY_API__`,
  `__INTLIFY_PROD_DEVTOOLS__`). Messages are plain JSON compiled by vue-i18n in the browser; no
  runtime or machine translation is involved.
- `client/src/i18n/core.js` holds everything testable without a browser: `SUPPORTED_LOCALES`,
  `resolveLocale`, the vue-i18n options (`fallbackLocale: 'en'`, the Ukrainian plural rule built on
  `Intl.PluralRules('uk')`), and the formatters. `missingWarn` and `fallbackWarn` are enabled in
  development builds, so a missing key is reported in the console while the English text is shown.
- `client/src/i18n/index.js` creates the instance from the saved preference, exports `setLocale`,
  and wraps the formatters so templates re-render when the language changes.
- `client/src/i18n/locales/en.json` and `uk.json` group messages by feature (`nav`, `common`,
  `dashboard`, `items`, `items.fields`, `itemForm`, `settings`, `cloud`, `backup`, `update`, …).
  Sentences with markup inside use `<i18n-t>` slots, so no message contains HTML.
- Shared state that outlives a component keeps keys rather than text: the update panel stores
  translation keys with their parameters, and the QR scanner reports translation keys for its errors.
  The updater's step identifiers and the field-type values map to `update.steps.<id>` and
  `fieldTypes.<type>`; the AI provider help texts moved from `shared/aiProviders.js` into
  `settings.ai.providers.<id>`, and the unused English labels were removed from
  `shared/fieldDefinitions.js`.

## Verification

- `test/i18n.test.js`: English as default and fallback, identical key sets in both locales, every
  message of both locales compiles and renders without warnings, English fallback for a missing
  Ukrainian key, Ukrainian one/few/many plurals, user data inserted unchanged, and locale-aware date,
  time, number, money, and file-size formatting.
- `test/e2e/i18n.spec.js`: English by default, switching in Settings without a reload, persistence
  across a reload, representative pages rendered in Ukrainian, Ukrainian date and price formatting on
  item details, and an item that is shown and returned by the API unchanged after the switch.
- The existing browser tests run in English; the purchase price expectations follow the locale
  currency format.
