# AGENTS.md

## Project overview

Inventory Atlas Lite is a small self-hosted application for tracking personal physical items. Users can create categories and custom fields, add items and photos, search and filter records, and download a backup of the entire SQLite database.

This is an MVP without authentication, intended for use on a trusted local network or through VPN/Tailscale. During development, prioritize the fastest simple implementation that fully solves the current need and remains easy to understand. Follow KISS, DRY, and YAGNI: do not add abstractions, dependencies, configuration, or features for hypothetical future use.

## Language

- Use English throughout the project.
- Write all documentation, code comments, commit messages, identifiers, user-facing copy, test descriptions, and configuration notes in English.
  The only exception is the Ukrainian interface translation in `client/src/i18n/locales/uk.json`.
- When editing existing text, keep terminology consistent with the surrounding English content.

## Stack and architecture

- Node.js 20.19+ with a single root npm project using ES modules.
- Client: Vue 3 Composition API (`<script setup>`), Vue Router, Vite, and the Tabler design system
  (`@tabler/core`, which already contains Bootstrap 5) with `@tabler/icons-vue`. Bootstrap must never
  be installed or imported a second time.
- Server: Express 5 and `multer`; the REST API is available under `/api`.
- Data: a single SQLite database accessed through `better-sqlite3`. It stores both records and the original photo bytes.
- In development, Vite runs on `:5173` and proxies `/api` to Express on `PORT` (default `3000`).
- In production, Express serves the built client from `dist/` and listens on `PORT` (default `3000`).

The data flow is intentionally simple: a Vue page calls the helper in `client/src/api.js`, the Express backend validates the request, applies the logic it needs, reads or writes SQLite, and then returns JSON. Organize server code according to the backend rules below, and do not introduce additional layers without a concrete need.

## Backend architecture and code organization

These rules are mandatory for all backend work. They describe how server code must be organized;
they do not require rewriting existing code outside the scope of the task at hand.

### Principles

- Apply SOLID principles pragmatically, as guidance for responsibility boundaries, not as a checklist.
- Use OOP where it measurably improves separation of responsibilities, maintainability, testability,
  extensibility, or dependency management. Do not use it for simple pure functions or trivial
  utilities, where a plain function or module is clearer.
- Prefer composition over inheritance. Deep inheritance hierarchies are not acceptable.
- Keep every class or module focused on a single clear responsibility.
- Prefer explicit dependencies passed in over hidden global state and implicit singletons.
- Keep HTTP/API handling, business logic, persistence, and external integrations separated.

### Responsibility flow

Prefer this flow where it applies:

```text
Controller / Route
    ↓
Service
    ↓
Repository
    ↓
Database / External dependency
```

- **Controllers/routes** stay thin: parse and validate the request, call one service, shape the
  response. They must not contain persistence code or substantial business logic.
- **Services** contain application and business logic and orchestrate the work of repositories and
  integrations.
- **Repositories** encapsulate database access and persistence details, including SQL and row
  mapping. Nothing above them should depend on the shape of the storage.
- **External integrations** are isolated behind dedicated services or adapters where practical, so
  the rest of the backend depends on the project's own interface rather than on a third-party client.
- Dependencies point inward, toward application abstractions, rather than forcing business logic to
  depend directly on infrastructure details.
- Design important business logic so it can be tested without the HTTP layer or a real database where
  practical.

### Anti-overengineering constraints

The project stays small and readable. Do not add:

- abstractions without a concrete current need;
- deep inheritance hierarchies;
- one interface per class by default;
- `Interface -> Implementation` duplication where only one implementation exists and no substitution,
  testing, or isolation benefit is gained;
- unnecessary factories, builders, managers, or providers;
- trivial logic split across an excessive number of classes and files;
- enterprise-style architecture that adds complexity without improving this project.

### Decision rule

> Use OOP and SOLID pragmatically. Introduce an abstraction only when it provides a clear benefit for
> responsibility separation, substitution, testing, reuse, or dependency isolation. Prefer the
> simplest structure that preserves clean boundaries.

## Repository structure

- `index.html` — page shell; its inline script applies the stored or system color mode before paint.
- `client/src/main.js` — starts Vue, imports Tabler's stylesheet, configures the router, and lists
  application routes.
- `client/src/App.vue` — Tabler page shell that composes the sidebar, the mobile navigation, and the
  page content area.
- `client/src/components/AppSidebar.vue` — desktop folded-hover sidebar.
- `client/src/components/AppMobileNav.vue` — mobile header and offcanvas navigation drawer.
- `client/src/components/AppNavigation.vue` — navigation list shared by both of them.
- `client/src/components/AppBrand.vue` — product mark and name.
- `client/src/components/ThemeToggle.vue` — light/dark control; `client/src/theme.js` holds the state.
- `client/src/api.js` — shared `fetch` wrapper and helper for JSON requests.
- `client/src/i18n/index.js` — the `vue-i18n` instance, the browser-local language preference, and display formatting in the active locale.
- `client/src/i18n/core.js` — supported locales, vue-i18n options (English default and fallback, Ukrainian plural rule), and the `Intl` date, number, money, and file-size formatters.
- `client/src/i18n/locales/` — `en.json` and `uk.json`, the interface messages grouped by feature.
- `client/src/update.js` — shared state and polling of the update panel in the About dialog.
- `client/src/capabilities.js` — shared visibility state of optional features, loaded once from `/api/capabilities`.
- `client/src/pages/ItemsList.vue` — item list, search, filtering, column choice, sorting, and pagination.
- `client/src/components/ItemResults.vue` — the item table and phone cards, rendered from the visible column list.
- `client/src/itemColumns.js` — Items view column labels, cell text formatting, and its preference storage key.
- `client/src/useTablePreferences.js` — reusable browser-local table view state: visible columns, sort, reset, and reconciliation with the current columns.
- `client/src/components/TableColumnPicker.vue` and `SortableHeader.vue` — reusable Columns menu and sortable table header cell.
- `client/src/pages/ItemDetails.vue` — item details, photos, and deletion.
- `client/src/pages/ItemForm.vue` — item creation/editing, custom field values, and photo uploads.
- `client/src/pages/PrintLabels.vue` — `/labels/print`: A4 QR label sheets for the selected items, their layout presets, and print styles.
- `client/src/labelSelection.js` — item selection for label printing, shared by the Items list, the QR modal, and the print view.
- `client/src/pages/ScanQr.vue` — `/scan`: live camera and image QR scanning that opens the matching item.
- `client/src/qrScan.js` — local QR decoding with the bundled `jsqr` and classification of the scanned text.
- `client/src/pages/Categories.vue` — category and custom field management.
- `client/src/pages/DataBackup.vue` — SQLite backup download, restore, and the Danger Zone.
- `client/src/components/ResetDatabaseDialog.vue` — impact review and confirmation of the inventory reset.
- `client/src/components/CloudBackupSettings.vue` — the Settings card for Dropbox/Google Drive connections, Backup now, the schedule, retention, and status.
- `client/src/components/CloudAppCredentials.vue` — the masked app key/client ID and secret form of one cloud storage provider.
- `client/src/style.css` — small set of application styles layered on Tabler, built only from
  Tabler custom properties so both color modes stay correct.
- `shared/fieldDefinitions.js` — application-level custom field-definition format and validation, imported by both the client and the server.
- `shared/itemValidation.js` — canonical item input rules, applied by the server and reused by the batch item preview.
- `shared/itemImport.js` — category-scoped item import document format, template, structural reading, and per-draft review.
- `shared/aiProviders.js` — AI provider presets (default base URLs, key requirements) and base-URL validation, shared by Settings and the server.
- `shared/itemColumns.js` — Items view core columns, default sort, and the stable custom column key, shared by the client and the server.
- `shared/itemQr.js` — canonical `ial:item:v1:<uuid>` QR payload with its encoder and strict decoder.
- `shared/appError.js` — `AppError` (stable code, parameters, HTTP status) thrown by the shared rules and the server, and its `{ code, params }` body.
- `server/src/index.js` — process entry point: port and production flag, the HTTP listener, and shutdown.
- `server/src/app.js` — composition root: builds every repository, service, upload, and route table and assembles the Express app, including production static serving.
- `server/src/routes/` — thin Express route tables; they parse the request, call one service, and shape the response.
- `server/src/services/` — application and business logic, independent of Express request and response objects. `itemColumns.js` builds the Items column catalog and merges same-name, same-type custom fields.
- `server/src/repositories/` — all SQL and row mapping for the inventory tables.
- `server/src/integrations/` — adapters for external or heavy dependencies: the AI providers (`openAiProvider.js`, `openAiCompatibleProvider.js`, and their shared `aiProviderHttp.js` transport), the GitHub release API, the local background-removal model, and the cloud storage providers (`dropboxStorageProvider.js`, `googleDriveStorageProvider.js`, and their shared `cloudStorageHttp.js` transport). AI features call `services/aiProviderService.js`, never an adapter directly; cloud backup reaches the storage adapters only through `services/cloudConnectionService.js`, and their OAuth app credentials come from `services/cloudAppSettingsService.js`.
- `server/src/restore/` — restore and reset configuration, staged-upload sessions, the SQLite file checks, and `databaseMaintenance.js`: the shared maintenance lock, safety backup, atomic swap, and rollback used by the restore and reset services.
- `server/src/cloudBackup/` — cloud backup configuration, the owner-only JSON file store for its credentials and state, schedule rules, and the in-process scheduler timer.
- `server/src/update/` — deployment capability, version comparison, the updater's status file, and the privileged update trigger.
- `server/src/http/` — transport middleware: uploads, the maintenance guard, and the central error handler that answers `{ error: { code, params } }`.
- `server/src/db.js` — database path, SQLite connection, PRAGMAs, current table/index schema, and the fresh-database initializer used by the reset.
- `test/e2e.test.js` — end-to-end acceptance test for the API, persistence, photos, and backups.
- `test/services.test.js` — service-level regression tests that run without HTTP against a temporary database.
- `test/background-removal.test.js` — local cutout tests: stubbed model output for the composition
  rules, plus one full run of the real model over the regression photo when it is installed.
- `test/i18n.test.js` — locale parity, message compilation, fallback, Ukrainian plurals, and locale-aware formatting.
- `test/errors.test.js` — error code coverage in both locales, the error response mapping, and error translation.
- `test/cloud-backup.test.js` — cloud backup services, adapters, scheduler, and API against the local Dropbox/Google Drive stub in `test/e2e/cloudProviderStub.js`.
- `test/fixtures/` — real source photos used as regression input by the Node.js tests.
- `test/e2e/` — Playwright browser tests, their fixtures, shared helpers, and the run launcher.
- `playwright.config.js` — Playwright projects, isolated test ports, and the cloud provider stub, API, and Vite processes started for the suite.
- `docs/README.md` — documentation layout and conventions.
- `docs/HOW-TO.md` — quick user guide for the current application.
- `docs/issues/` — active tasks, feature specifications, and future work.
- `docs/features/` — permanent documents for implemented features, with `README.md` as their index.
- `docs/changes/` — dated records of completed repository changes.
- `data/` — local runtime data; SQLite files and backups are ignored by Git.
- `dist/` — output from `npm run build`; generated automatically and ignored by Git.
- `.npmrc` — project npm settings that must travel with the release archive and the build context.
- `eslint.config.js` — recommended ESLint rules for JavaScript and Vue files, plus browser and Node.js globals.
- `vite.config.js` — Vue plugin and development proxy configuration.
- `README.md` — setup, production, and backup instructions.

## Frontend localization

The interface is localized with `vue-i18n` (Composition API) in English and Ukrainian. These rules
are mandatory for all frontend work:

- Never hardcode user-facing text in Vue templates or client JavaScript: labels, headings, buttons,
  placeholders, `title`/`aria-label`/`alt` text, empty states, confirmations, prompts, and notices all
  come from translation keys (`const { t } = useI18n()` in scripts, `$t()` in templates, and
  `<i18n-t>` when markup such as `<code>` or a link sits inside a sentence).
- Every new key gets both an `en` and a `uk` value in the same change. Group keys by feature
  (`items.fields.purchasePrice`, `cloud.backupNow`) and reuse `common.*` for generic actions such as
  `common.save`, `common.cancel`, `common.delete`, `common.edit`, and `common.close`.
- Use vue-i18n pluralization for counts (`t('items.count', n)`): English messages have two forms,
  Ukrainian messages three (`one | few | many`). Never build plurals with English-only ternaries.
- Show dates, numbers, money, and file sizes through the formatters in `client/src/i18n/index.js`;
  never change stored values or API formats for display.
- Never translate user data: item, category, and field names, descriptions, locations, entered
  values, serial numbers, and imported data are shown exactly as stored.
- Server errors arrive as `{ code, params }` and are shown through `translateError` (and success
  notices through `translateNotice`) from `client/src/i18n/index.js`; `api()` already throws an
  `ApiError` whose message is translated. Dynamic values travel as parameters, a count as
  `params.count` for pluralization, and a nested reason as a `{ code, params }` parameter.
- `test/i18n.test.js` fails when the two locales do not define the same keys or a message does not
  compile, and `test/errors.test.js` fails when a code used in `server/src` or `shared` has no message;
  keep both passing.

## Data model and important constraints

- `categories` group items; a category used by any item cannot be deleted.
- `custom_fields` belong to a category and have the type `text`, `number`, `date`, or `boolean`.
- `items` have a UUID, category, basic text attributes, and timestamps.
- `item_field_values` store custom field values as text; booleans are normalized to `"1"` or `"0"`.
- `item_photos` stores metadata and BLOB data in the same database. The API accepts up to 10 JPEG/PNG/WebP/GIF files of 15 MB each.
- Foreign keys are enabled. Related fields, values, and photos are deleted according to their `ON DELETE` rules; do not bypass those rules with manual operations.
- `DATA_DIR` changes the persistent data directory. Tests must use a temporary directory instead of the working database in `data/`.

## Working on changes

- Before editing, read the related Vue components, API routes, schema, and tests so the end-to-end contract remains intact.
- Preserve the existing compact style and use installed dependencies. Add a dependency only when it clearly simplifies the implementation needed now.
- Validate data on the server. Return API errors as `{ "error": { "code": "...", "params": {} } }` by throwing
  `httpError(status, code, params)` or the shared `AppError`; never send human-readable text from the server.
  Add every new code under `errors` (or `notices` for success messages) in both `en.json` and `uk.json`.
- Schema changes must be safe for existing `data/inventory.sqlite` databases; do not rely only on creating a fresh database.
- Keep the application suitable for self-hosted use without external runtime services.
- Do not manually edit `dist/`, `node_modules/`, or SQLite files.
- Do not expand task scope with unrelated refactors. If repeated code is already obstructing the requested change, extract only the smallest useful shared part.

## Task documentation

- After completing any task that changes repository files, create a Markdown record in `docs/changes/` describing what was implemented and when.
- Name records `YYYY-MM-DD-short-description.md` and write them in English.
- Include the completion date, resulting project version, a concise summary of the implementation, and the verification performed, including the Playwright result.
- Keep planned work and future specifications in `docs/issues/`; keep completed implementation records in `docs/changes/`.

## Roadmap overview maintenance

`docs/ROADMAP.md` is the concise overview of active planned features. Keep it synchronized with the task files currently in `docs/issues/`.

- When adding, removing, completing, reprioritizing, or materially changing an active task file, update the corresponding roadmap entry in the same change.
- Keep each entry limited to its feature, status, dependencies, and a link to the authoritative task file. Detailed requirements and acceptance criteria remain in the task file.
- Do not list completed features as planned work; their current behavior belongs in `docs/features/`.

## User guide maintenance

`docs/HOW-TO.md` is the canonical quick user guide for the current application. Keep it true.

- Every new user-facing feature must update the guide before the task is considered complete.
- Any change to navigation, labels, workflows, validation, limits, backup behavior, security assumptions, or visible limitations must update the affected section in the same change. Removed or renamed features must be removed or renamed there too.
- Verify every instruction against actual working behavior. Never document planned functionality as implemented.
- This is an additional step, not a replacement for the permanent feature document in `docs/features/`.
- Pure internal refactoring with no observable behavior change needs no guide edit. A task whose user-facing documentation is knowingly stale is not complete.

## Task file lifecycle

Files in `docs/issues/` (`TASK-*.md`, `CODEX-TASK-*.md`) are temporary working specifications, not completion records. Keep a task file while any of its requirements is unimplemented, unverified, blocked, or uncertain.

Before treating a feature task as finished:

1. implement the requested behavior;
2. run the relevant tests and verification;
3. create or update its permanent feature document in `docs/features/`, describing the resulting implementation rather than the plan;
4. add or update its entry in `docs/features/README.md`, the index of implemented features;
5. update `docs/HOW-TO.md` when the change is visible to users or operators;
6. delete the completed task file with normal tracked deletion, never by rewriting Git history;
7. include the documentation updates and the task-file deletion in the same commit as the feature whenever practical.

Safety rules:

- Never delete an incomplete, partially implemented, failed, blocked, or uncertain task file; report what is missing instead.
- Never treat the task text as evidence that something is implemented; verify it against the code and the tests.
- When a change modifies an already documented feature, update that feature document instead of adding a second one.
- A small fix needs a new feature document only when it introduces behavior that no existing document covers.
- These steps are in addition to the `docs/changes/` record, not a replacement for it.
- If committing is not authorized for a given task, still prepare the complete working tree and report the files that are ready to commit. The Git rules below remain authoritative.

## Versioning

- Follow Semantic Versioning, with `package.json` as the source of truth. Keep the version in `package-lock.json` synchronized.
- The MVP version line starts at `0.1.0`.
- Increment the patch component (`0.1.x`) for fixes, maintenance changes, and small features.
- Increment the minor component (`0.x.0`) for substantial improvements or meaningful new features.
- Documentation-only changes normally do not change the version. They may increment the patch or minor component when they materially change the project structure, development workflow, or product contract.
- Reserve `1.0.0` for an explicit decision that the product is ready to leave the initial MVP version line.
- Decide and apply the version change as part of the task, before writing its completion record and creating the commit.

## Browser test coverage

Playwright is the browser-level safety net for user-facing behavior. It complements the API tests in `test/e2e.test.js`; do not duplicate detailed API validation there in the browser suite.

- Every new user-facing feature must add a Playwright test or update an existing one covering its primary browser workflow.
- A feature is not complete while its browser behavior has changed and the relevant Playwright coverage has not been updated.
- Run `npm run test:e2e` during development once the implementation is integrated, and again as one of the final checks.
- Locate elements by accessible role, label, and visible name. Add a stable test ID only when the interface offers no user-facing locator.
- Never use fixed sleeps; wait for observable UI state. Keep tests independent and give created records unique names.
- In Linux headless Chromium desktop tests, a new page can retain the pointer at `(0, 0)`. This expands the folded-hover sidebar, which intentionally overlays controls on the left of the page. After a direct `page.goto()` to a page with such controls, move the pointer into the page work area (for example, `await page.mouse.move(600, 400)`) before the locator action.
- The suite uses a temporary SQLite database and its own ports. It must never touch `data/inventory.sqlite`.
- Run `npx playwright install chromium` once before the first run in a new environment.

## Verification

After a change, run checks appropriate to its scope. The final verification sequence for a feature is:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run lint` checks JavaScript and Vue files with the recommended ESLint and `eslint-plugin-vue` rules. `npm test` checks the main API flow against an isolated temporary database. `npm run build` verifies that the Vue client compiles. `npm run test:e2e` runs the Playwright workflows in Chromium against an isolated application. For UI changes, also verify the relevant flow manually with `npm run dev` when the environment permits it.

## Git

- After updating the version when applicable and writing the completion record, create a local Git commit with a short, meaningful message written in English.
- When a completed feature updates the project version, create a new local tag named `v<version>` on the resulting feature commit immediately after committing (for example, version `0.10.0` uses tag `v0.10.0`).
- Commit only files that belong to the current task; do not include unrelated or pre-existing user changes.
- Never run `git push`. The user always pushes commits themselves.
