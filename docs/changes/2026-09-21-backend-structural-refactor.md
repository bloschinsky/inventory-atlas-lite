# Backend structural refactor

- **Completed:** 2026-09-21
- **Version:** 0.18.0

## Summary

The backend was reorganized into the controller → service → repository flow required by the backend
architecture rules in `AGENTS.md`. This is a structural change only: no route, payload, status code,
schema, configuration name, or user-visible behavior was changed.

`server/src/index.js` was a single 559-line module that held the Express app, every route, request
validation, business rules, all SQL, the OpenAI calls, and process startup. It is now the process
entry point alone. The modules that grew out of it:

- `server/src/app.js` — the composition root. Every repository, service, upload, and route table is
  created here and receives its dependencies explicitly; nothing below it reaches for a singleton.
- `server/src/routes/` — `aiRoutes`, `imageRoutes`, `categoryRoutes`, `dashboardRoutes`,
  `fieldRoutes`, `itemRoutes`, `photoRoutes`, `systemRoutes`, and `backupRoutes`. Each one parses the
  request, calls a service, and shapes the response. They are registered in the previous order, so
  `/api/items/parent-candidates` still resolves before `/api/items/:id`.
- `server/src/services/` — `CategoryService`, `CustomFieldService`, `ItemService`, `PhotoService`,
  `DashboardService`, `BackupService`, `RestoreService`, `ImageService`, `AiSettingsService`,
  `AiItemAnalysisService`, and `AiFieldService`, plus the pure input rules in `itemValidation.js`.
  Services refuse work by throwing an error that carries its HTTP status, which the central error
  handler maps exactly as before.
- `server/src/repositories/` — `CategoryRepository`, `CustomFieldRepository`, `ItemRepository`,
  `ItemPhotoRepository`, and `DashboardRepository`. All SQL, the LIKE escaping, the sort-column map,
  the dashboard scope clause, and the write transactions now live here. Statements are still
  prepared when they are used, because a restore replaces the connection behind the `db` proxy.
- `server/src/integrations/` — `openAiClient.js` (the only place that talks to OpenAI) and
  `backgroundRemoval.js`, moved unchanged apart from its model path.
- `server/src/restore/` — `restoreConfig.js`, `stagingStore.js` (staged uploads and their single-use
  tokens), and `databaseFile.js` (SQLite header, schema, integrity, and summary checks).
  `RestoreService` keeps the maintenance state and the swap sequence; the former module-level
  mutable state of `server/src/restore.js` is now instance state created in the composition root.
- `server/src/http/` — the multer configurations, the maintenance guard, and the error handler.

`server/src/ai.js` and `server/src/restore.js` were removed once their content moved.

## Resulting boundaries

- Routes contain no SQL, no filesystem persistence, and no business rules.
- Services hold the use-case logic and are free of Express request and response objects, except
  where the transport genuinely owns the result (`res.download` for a backup, the photo byte
  response, and the multer error mapping of the restore upload).
- Repositories are the only place that knows the storage shape.
- External dependencies — OpenAI and the local segmentation model — are reached through adapters.

## Verification

- `npm run lint` — clean.
- `npm test` — 46 passed, 1 skipped (shellcheck, unavailable here). This includes the existing API,
  dashboard, restore, background-removal, docs, release, and script suites, which are the
  characterization net for the refactor and were not modified apart from two import paths for the
  moved background-removal adapter.
- `test/services.test.js` — new service-level regression tests that exercise the item rules,
  containment rules, list search and pagination, category and field deletion guards, batch field
  creation, and the dashboard against a temporary SQLite database without any HTTP server.
- `npm run build` — client compiles.
- `npm run test:e2e` — 36 Playwright tests passed in Chromium.
