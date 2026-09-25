# API error codes and localized server messages

## Summary

The backend never sends human-readable error text. Every refusal and failure is answered with its
HTTP status and a body of the form

```json
{ "error": { "code": "ITEM_HAS_CHILDREN", "params": { "count": 4 } } }
```

The code is a stable identifier; `params` carries the dynamic values the message needs. The browser
translates the code in the active interface language (English or Ukrainian), including plural forms,
so the server stays locale-agnostic and knows nothing about the chosen language. HTTP status codes are
the same as before the migration.

## User-visible behaviour

- Every error the application reports — validation, not found, conflicts, restore and reset,
  cloud backup, AI providers, updates — appears in the language chosen under **Settings → Interface**.
- Counts are pluralized per language: `This item contains 1 item` / `4 items`, and
  `1 предмет` / `3 предмети` / `5 предметів`.
- Values that are user data (field and category names) or diagnostic context (a provider name, an
  HTTP status, a model ID, a JSON parser detail) are inserted unchanged.
- Successful connection tests of AI providers and cloud storage return a notice
  `{ "notice": { "code", "params" } }`, translated the same way under `notices.<code>`.
- An unknown code shows `Something went wrong (<CODE>)` in the active language instead of an empty
  message; a response without an error body shows `Request failed (HTTP <status>)`.

## Contract

| Situation | Status | Code |
| --- | --- | --- |
| Application or domain rule | its own status (400, 404, 409, 422, 502, 503, 504, …) | the specific code, such as `ITEM_NOT_FOUND`, `CATEGORY_IN_USE`, `INVALID_PURCHASE_PRICE_AMOUNT` |
| Unique name conflict from SQLite | 409 | `DUPLICATE_NAME` |
| Upload limit or bad multipart request | 400 | `UPLOAD_FILE_TOO_LARGE`, `UPLOAD_TOO_MANY_FILES`, `UPLOAD_UNEXPECTED_FILE`, `UPLOAD_FAILED` |
| Unparsable or oversized JSON body | 400 / 413 | `INVALID_JSON_BODY`, `REQUEST_TOO_LARGE` |
| Writes during a restore or reset | 503 | `DATABASE_MAINTENANCE` |
| Anything unexpected | 500 | `UNEXPECTED_ERROR` |

- Unexpected failures never expose their message, stack, file paths, or SQLite text; those stay in
  the server log. A foreign error that only carries a status is not trusted with its message either.
- A nested reason travels as a parameter that is itself `{ code, params }`. A refused item in a
  batch import answers `BATCH_ITEM_INVALID` with `{ index, reason }`, and an AI field document the
  shared reader rejects answers `AI_INVALID_FIELDS` with `{ reason }`.
- Provider responses are never passed through. AI and cloud storage failures are mapped to
  application codes such as `AI_PROVIDER_RATE_LIMITED` or `CLOUD_QUOTA` with the provider name and,
  where useful, the HTTP status; the provider's own wording is logged on the server.
- Cloud backup history, the retention cleanup result, and the last OAuth callback failure are stored
  as `{ code, params }` too. Entries written by older versions as plain text are still shown as they are.

## Implementation

- `shared/appError.js` defines `AppError(code, params, status)` and `errorBody(error)`. The shared
  validators (`itemValidation.js`, `itemImport.js`, `fieldDefinitions.js`, `aiProviders.js`,
  `itemQr.js`) throw it, so the batch previews in the browser show exactly the refusal the API sends.
  Field reviews carry `error: { code, params }` instead of a message, and item draft reviews return
  one `{ code, params }` per invalid property.
- `server/src/httpError.js` exposes `httpError(status, code, params)`. Services, repositories-facing
  helpers, routes, and integrations throw it; adapters keep their internal classification in a
  separate `reason` property (for example `unauthorized`, which triggers one token refresh).
- `server/src/http/errorHandler.js` maps any error to `{ status, body }` in `errorResponse` and is the
  only place that writes an error response.
- `client/src/api.js` throws `ApiError` with the translated message plus `code`, `params`, and
  `status`. `client/src/i18n/core.js` `translateMessage` resolves `errors.<code>` or `notices.<code>`,
  translates nested reasons, applies the plural form from `params.count`, and falls back to
  `errors.UNKNOWN`; `client/src/i18n/index.js` exposes it as `translateError` and `translateNotice`.
- The messages live under `errors` and `notices` in `client/src/i18n/locales/en.json` and `uk.json`.

## Verification

- `test/errors.test.js`: every code found in `server/src` and `shared` has an English and a Ukrainian
  message; application errors keep status, code, and parameters; SQLite, upload, and body-parser
  errors get their documented codes; unexpected failures return `UNEXPECTED_ERROR` without message,
  path, or stack; English and Ukrainian translation, pluralization, nested reasons, the batch preview,
  and the unknown-code and legacy-text fallbacks.
- The API, service, restore, reset, cloud backup, AI provider, update, and QR tests assert codes,
  parameters, and unchanged HTTP statuses instead of English text.
- `test/e2e/i18n.spec.js` checks that the API answers a structured `ITEM_HAS_CHILDREN` and that the
  interface shows it pluralized in Ukrainian and a `404` in English.
