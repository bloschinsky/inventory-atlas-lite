# Backend error localization through stable error codes

- **Completed:** 2026-09-25
- **Version:** 0.34.0

## Summary

- The API no longer sends English error text. Every error is answered with its unchanged HTTP status
  and `{ "error": { "code": "...", "params": { ... } } }`; the browser translates the code in the
  active language. No compatibility `message` field was kept: every application error was migrated.
- New `shared/appError.js` (`AppError`, `errorBody`). `server/src/httpError.js` now takes
  `httpError(status, code, params)`, and the shared validators (`itemValidation`, `itemImport`,
  `fieldDefinitions`, `aiProviders`, `itemQr`) throw `AppError`, so the batch previews show the same
  refusals as the API. About 220 codes cover items, nesting, categories, custom fields, batch items
  and fields, photos, images and background removal, labels and QR, the dashboard, AI settings and
  providers, backup, restore, reset, cloud backup, and updates.
- Dynamic values are parameters (`count`, `max`, `field`, `provider`, `status`, …); a batch item
  refusal nests its reason as `BATCH_ITEM_INVALID { index, reason }`. Provider wording is never
  passed on; AI and cloud failures map to application codes with the provider name and HTTP status.
- `server/src/http/errorHandler.js` maps SQLite unique violations, multer limits, and body-parser
  failures to documented codes, and every unexpected error to `500 UNEXPECTED_ERROR` without its
  message or stack (previously the raw message of an unexpected error reached the browser).
- Cloud storage adapters keep their internal failure class in `reason` instead of `code`. Cloud
  backup history, cleanup results, and the last OAuth failure are stored as `{ code, params }`;
  older plain-text entries are still displayed. The AI and cloud connection tests return a translated
  `notice` instead of a `message`.
- Client: `api.js` throws `ApiError` with a translated message, `code`, `params`, and `status`;
  `translateMessage` in `client/src/i18n/core.js` handles nested reasons, pluralization by
  `params.count`, and an `errors.UNKNOWN` fallback. English and Ukrainian texts for every code live
  under `errors` and `notices` in the locale files.
- Documentation: new `docs/features/api-error-codes.md`, updates to `AGENTS.md`, the feature index,
  `interface-localization.md`, `cloud-backup.md`, `in-app-qr-scanner.md`,
  `purchase-and-serial-fields.md`, `transferred-to-field.md`, `docs/HOW-TO.md`, `docs/ROADMAP.md`, and
  the release history. The completed task file was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 136 passed, 1 skipped (shellcheck is not installed locally), including the new
  `test/errors.test.js` and the API, service, restore, reset, cloud backup, AI provider, update, QR,
  and background-removal tests rewritten to assert codes, parameters, and statuses.
- `npm run build` — passed.
- `npm run test:e2e` — 86 passed, including the new Ukrainian server-error scenario in
  `test/e2e/i18n.spec.js`; mocked error responses in four specs now use the structured body.
