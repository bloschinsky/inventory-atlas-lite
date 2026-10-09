# AGENTS.md

## Project overview

Inventory Atlas Lite is a small self-hosted application for tracking personal physical items. Users can create categories and custom fields, add items and photos, search and filter records, and download a backup of the entire SQLite database.

This is an MVP without authentication, intended for use on a trusted local network or through VPN/Tailscale. During development, prioritize the fastest simple implementation that fully solves the current need and remains easy to understand. Follow KISS, DRY, and YAGNI: do not add abstractions, dependencies, configuration, or features for hypothetical future use.

## Language

- Use English throughout the project.
- Write all documentation, code comments, commit messages, identifiers, user-facing copy, test descriptions, and configuration notes in English.
  The only exceptions are the Ukrainian translations: the interface in `client/src/i18n/locales/uk.json`, the landing page in
  `landing/src/locales/uk.json`, the `uk` texts of the public demo inventory in `client/src/demo/fixture.js`, and the
  Ukrainian user guide in `docs/HOW-TO.uk.md`.
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
  page content area, a fluid `.container-fluid.app-content` (pages limit narrow surfaces such as
  `.form-card` themselves).
- `client/src/components/AppSidebar.vue` — desktop folded-hover sidebar.
- `client/src/components/AppMobileNav.vue` — mobile header and offcanvas navigation drawer.
- `client/src/components/AppNavigation.vue` — navigation list shared by both of them.
- `client/src/components/AppBrand.vue` — product mark and name.
- `client/src/components/ThemeToggle.vue` — light/dark control; `client/src/theme.js` holds the state.
- `client/src/api.js` — shared `fetch` wrapper and helper for JSON requests, `photoUrl()` for stored
  photos, and the only switch to the in-browser backend of the public demo build (`__DEMO__`).
- `client/src/demo/` — the public demo (`npm run demo:build`, `vite build --mode demo`, into
  `dist-landing/demo/`): `backend.js` dispatches API requests to the real route tables over
  `services.js` (the inventory repositories and services on an in-memory sql.js database adapted by
  `sqlite.js`), `express.js` is the Router stand-in the demo build aliases `express` to, `fixture.js`
  is the canonical demo inventory — one structure of semantic keys with its display text in every
  supported locale, resolved by `createDemoFixture(locale)` — that `seed.js` loads through the
  services in the interface language, and `photos/` holds its generated item photos. `client/src/components/DemoBanner.vue` and `DemoUnavailable.vue` are the
  demo strip and the stand-in for server-only features. The demo's guided tour: `tourChapters.js`
  (the ordered, data-driven chapters and their scenes, which name fixture entities by key and fill
  their copy's placeholders from the fixture of the tour's language; `actionLabelKey()` names each
  scene's contextual action button), `tour.js` (the manual-first chapter engine: scenes wait for
  their action button, `advance()` is shared by that button and Auto Play; Pause, Replay, abort),
  `tourActions.js` (`TIMING` and the DOM actions a scene performs), and
  `client/src/components/DemoTour.vue` (launcher, inverse-theme card with the compact phone layout,
  spotlight); it finds the UI
  through `data-tour` attributes, and `backend.js` `reset(locale)` gives it a fresh fixture. A
  language change in the demo seeds it again in the new language (`DemoBanner.vue`) and closes the tour.
- `client/src/i18n/index.js` — the `vue-i18n` instance, the browser-local language preference, and display formatting in the active locale.
- `client/src/i18n/core.js` — supported locales, the shared locale storage key, `pickLocale()` (the demo's `?lang=`, then the saved choice, then English), vue-i18n options (English default and fallback, Ukrainian plural rule), and the `Intl` date, number, money, and file-size formatters; the landing page reuses it.
- `client/src/i18n/locales/` — `en.json` and `uk.json`, the interface messages grouped by feature.
- `client/src/update.js` — shared state and polling of the update panel in the About dialog.
- `client/src/whatsNew.js` — the last acknowledged version in browser storage and the unseen releases shown after an update; `client/src/components/WhatsNewDialog.vue` renders them.
- `client/src/capabilities.js` — shared visibility state of optional features, loaded once from `/api/capabilities`.
- `client/src/pages/ItemsList.vue` — item list, search, filtering, column choice, sorting, and pagination.
- `client/src/components/ItemResults.vue` — the item table and phone cards, rendered from the visible column list.
- `client/src/components/ItemNewStatusBadge.vue` — the read-only New/Used badge of the core New flag, shared by the item table, cards, and details.
- `client/src/components/ItemLifecycleBadge.vue` — the neutral Retired (and, on details, Active) badge of the item lifecycle;
  `RetireItemDialog.vue` (reason, date, recipient, note, and the contents choice of a container) and
  `RestoreItemDialog.vue` (restore on its own at a location or inside an active container) are its two transitions.
- `client/src/itemColumns.js` — Items view column labels, cell text formatting, and its preference storage key.
- `client/src/colors.js` — the interface face of the Color custom field (label keys, reading a stored value, checkmark contrast); `client/src/components/ColorPicker.vue` is the accessible swatch picker with Custom HEX and Clear, shared by the item form, the template editor, and Batch Add Items, and `ColorValue.vue` the read-only swatch and name of the details, table, and cards.
- `client/src/conditionGrades.js` — the interface mapping of the Condition grades (label key, badge class, chart color, best-first order); `client/src/components/ConditionGradeBadge.vue` is the shared grade badge and `ConditionHelpDialog.vue` the Condition grading help opened from the item form.
- `client/src/useTablePreferences.js` — reusable browser-local table view state: visible columns, sort, reset, and reconciliation with the current columns.
- `client/src/components/TableColumnPicker.vue` and `SortableHeader.vue` — reusable Columns menu and sortable table header cell.
- `client/src/pages/Dashboard.vue` — the Dashboard: category scope, KPI cards, charts, and their text values.
- `client/src/dashboardCharts.js` — on-demand loading of the ApexCharts copy bundled in `@tabler/core`, Tabler color resolution for the active mode, and the options of each Dashboard chart.
- `client/src/components/DashboardChart.vue` — one ApexCharts instance: creation, in-place updates, and cleanup.
- `client/src/pages/Hierarchy.vue` — `/hierarchy`: loads the flat hierarchy nodes, owns the search and the independent Group by (`?group=category`) and View (`?view=graph`) switches; `client/src/components/HierarchyTree.vue` renders the read-only tree, and `HierarchyGraph.vue` (loaded on demand) the read-only Vue Flow graph, both from the same normalized rows.
- `client/src/hierarchyTree.js` — pure hierarchy rules shared by both views: one normalized projection built by `buildLocationTree()` (Location nodes grouped by normalized effective location with their per-location Uncontained items groups) or `buildCategoryTree()` (Category nodes keeping only direct same-category nesting), item counts, the stable virtual keys, item and group name search with ancestor paths, and the visible rows with their parent keys and item metadata.
- `client/src/useHierarchyExpansion.js` — the opened branches of the Hierarchy page (one browse set per grouping and a search set) shared by the Tree and Graph views.
- `client/src/hierarchyGraph.js` — the library-independent Graph layout: deterministic left-to-right node positions, edges, the node limit, and view fitting.
- `client/src/pages/ItemDetails.vue` — item details, Last verified, photos, deletion, the container's Audit contents and recent audits, the open loan, the Retirement card, Retire and Restore, and the History preview; `client/src/components/AuditContentsDialog.vue` chooses the audit scope and starts the audit, and `ItemLoanDialog.vue` starts a loan (Transfer) or marks it as returned.
- `client/src/pages/ItemHistory.vue` — `/items/:id/history`, the full timeline; `client/src/components/ItemHistoryTimeline.vue` renders the timeline (preview or filtered pages with Load more), grouping the events of one operation.
- `client/src/pages/ItemForm.vue` — item creation/editing, custom field values, photo uploads, the photo order and cover, and the required *Where is this item now?* choice when an item is taken out of its container; it is prefilled from an item draft (the edited item, an AI draft, `?template=`, or `?duplicate=`).
- `client/src/itemDraft.js` — item drafts: the shared form state of the item form and the template editor, and the drafts built from an item or a template.
- `client/src/components/ItemDraftFields.vue` — the item base and custom field inputs shared by the item form and the template editor.
- `client/src/pages/Templates.vue` and `TemplateForm.vue` — the item template list and the template editor (also started from an item through `?fromItem=`).
- `client/src/pages/Checklists.vue`, `ChecklistForm.vue`, `ChecklistDetails.vue`, and `ChecklistRun.vue` — the checklist cards, the container audit history, and the deleted-checklist run history, the checklist editor, one checklist with its expected items and run history, and the phone-first run page (state buttons, notes, completion, Run again).
- `client/src/components/ChecklistItemPicker.vue` and `ChecklistRunHistory.vue` — the checklist membership editor (item search, add, reorder, remove) and the run history table; `client/src/checklists.js` maps modes and run states to their labels.
- `client/src/components/AddItemMenu.vue` and `TemplatePickerDialog.vue` — the Items page Add item split button and its template picker.
- `client/src/pages/PrintLabels.vue` — `/labels/print`: A4 QR label sheets for the selected items, their layout presets, and print styles.
- `client/src/labelSelection.js` — the Items list selection used by label printing and Bulk Move, shared by the Items list, the QR modal, and the print view.
- `client/src/components/BulkMoveDialog.vue` — the Items list **Move to…** dialog: destination search, the selection-root summary, confirmation, and the bulk move.
- `client/src/pages/ScanQr.vue` — `/scan`: live camera and image QR scanning that opens the matching item.
- `client/src/qrScan.js` — local QR decoding with the bundled `jsqr` and classification of the scanned text.
- `client/src/pages/Categories.vue` — category and custom field management, including renaming a field in place.
- `client/src/pages/DataBackup.vue` — SQLite backup download, restore, and the Danger Zone.
- `client/src/pages/Settings.vue` — the Settings shell: the grouped section list on desktops, the section selector on phones, and the active section; `client/src/settingsSections.js` lists the groups and sections (path, label, icon, component) used by the routes and both navigations.
- `client/src/components/settings/` — one component per Settings section: `InterfaceSettings.vue` (language), `DatabaseSettings.vue` (editable database name, last update, folded technical details), `CloudBackupSettings.vue` (Dropbox/Google Drive connections, Backup now, the schedule, retention, and status) with `CloudAppCredentials.vue` (the masked app key/client ID and secret form of one provider), and `AiSettings.vue` (the AI form in Features, Connection, and Model cards).
- `client/src/components/BulkReplaceValue.vue` — the Data page card that previews and applies the replacement of one exact field value on every matching item.
- `client/src/components/ResetDatabaseDialog.vue` — impact review and confirmation of the inventory reset.
- `client/src/style.css` — small set of application styles layered on Tabler, built only from
  Tabler custom properties so both color modes stay correct.
- `shared/fieldDefinitions.js` — application-level custom field-definition format and validation, imported by both the client and the server.
- `shared/itemValidation.js` — canonical item input rules, applied by the server and reused by the batch item preview.
- `shared/itemImport.js` — category-scoped item import document format, template, structural reading, and per-draft review.
- `shared/aiProviders.js` — AI provider presets (default base URLs, key requirements) and base-URL validation, shared by Settings and the server.
- `shared/itemColumns.js` — Items view core columns, default sort, and the stable custom column key, shared by the client and the server.
- `shared/conditionGrades.js` — the fixed Condition grade keys in rank order, shared by the client and the server.
- `shared/colors.js` — the Color field palette (twelve presets with canonical HEX codes, then `custom`) in sort order, HEX normalization, and the reading, validation, and canonical encoding of `{ key, hex }` values, shared by the client and the server.
- `shared/itemLifecycle.js` — the lifecycle statuses, retirement reasons, list views (`active`, `all`, `retired`), and text limits, shared by the client and the server.
- `shared/itemQr.js` — canonical `ial:item:v1:<uuid>` QR payload with its encoder and strict decoder.
- `shared/checklists.js` — checklist modes, run item states, the note limit, and the run count rule, shared by the client and the server.
- `shared/semver.js` — semantic version parsing and comparison, used by the updater and the What's New dialog.
- `shared/releaseHistory.js` and `shared/release-history.json` — the single release history read by Version History, What's New, and the release notes.
- `shared/appError.js` — `AppError` (stable code, parameters, HTTP status) thrown by the shared rules and the server, and its `{ code, params }` body.
- `server/src/index.js` — process entry point: port and production flag, the HTTP listener, and shutdown.
- `server/src/app.js` — composition root: builds every repository, service, upload, and route table and assembles the Express app, including production static serving.
- `server/src/routes/` — thin Express route tables; they parse the request, call one service, and shape the response.
- `server/src/services/` — application and business logic, independent of Express request and response objects. `itemColumns.js` builds the Items column catalog and merges same-name, same-type custom fields; `bulkReplaceService.js` previews and applies exact-value replacement over the column whitelist of `repositories/bulkReplaceRepository.js`; `databaseMetadataService.js` exposes the database identity and renames it through `repositories/databaseMetadataRepository.js`; `checklistService.js` owns checklist definitions and membership and `checklistRunService.js` the runs (server-side snapshots, container audits, state changes by run item or inventory item, completion with Last verified) over `repositories/checklistRepository.js` and `checklistRunRepository.js`; `itemService.js` owns the containment rule (`assertCanContain`) shared by the item form and Bulk Move, which reduces a selection to its roots before moving it, and the lifecycle rule that a container and its contents share one status; `itemLifecycleService.js` retires and restores an item with its whole subtree in one transaction (`PATCH /api/items/:id/lifecycle`), refusing a retirement while anything in it is on loan; `itemHistoryService.js` records the item activity history (`track()` compares the affected items before and after a write in its transaction, `trackLifecycle()` records Retire and Restore) and pages it, and `itemTransferService.js` owns temporary loans, both over `repositories/itemHistoryRepository.js`.
- `server/src/repositories/` — all SQL and row mapping for the inventory tables.
- `server/src/integrations/` — adapters for external or heavy dependencies: the AI providers (`openAiProvider.js`, `openAiCompatibleProvider.js`, and their shared `aiProviderHttp.js` transport), the GitHub release API, the local background-removal model, and the cloud storage providers (`dropboxStorageProvider.js`, `googleDriveStorageProvider.js`, and their shared `cloudStorageHttp.js` transport). AI features call `services/aiProviderService.js`, never an adapter directly; cloud backup reaches the storage adapters only through `services/cloudConnectionService.js`, and their OAuth app credentials come from `services/cloudAppSettingsService.js`.
- `server/src/restore/` — restore and reset configuration, staged-upload sessions, the SQLite file checks, and `databaseMaintenance.js`: the shared maintenance lock, safety backup, atomic swap, and rollback used by the restore and reset services.
- `server/src/cloudBackup/` — cloud backup configuration, the owner-only JSON file store for its credentials and state, schedule rules, and the in-process scheduler timer.
- `server/src/update/` — deployment capability, the updater's status file, and the privileged update trigger.
- `server/src/http/` — transport middleware: uploads, the maintenance guard, and the central error handler that answers `{ error: { code, params } }`.
- `server/src/db.js` — database path, SQLite connection, PRAGMAs, and the fresh-database initializer used by the reset; it re-exports the schema.
- `server/src/schema.js` — the current table/index schema, its migrations (`applySchema()`), the database metadata row and its write triggers; free of the file system, so the public demo applies it too.
- `test/e2e.test.js` — end-to-end acceptance test for the API, persistence, photos, and backups.
- `test/services.test.js` — service-level regression tests that run without HTTP against a temporary database.
- `test/custom-field-rename.test.js` — custom field rename: unchanged ids, types, categories, and item and template values, name validation and conflicts, column split and merge, Batch Add names, and the `PATCH /api/fields/:id` contract.
- `test/item-photo-order.test.js` — persisted photo order and the cover photo: the schema and the version 7 migration, restore validation, ordered uploads, reorder validation and atomicity, deletion, the shared cover thumbnail, and the `PUT /api/items/:id/photos/order` contract.
- `test/item-lifecycle.test.js` — the item lifecycle: schema and the version 8 migration, restore of an older backup, retire and restore of leaves and subtrees with their snapshots, atomicity, invalid and repeated transitions, the containment guards, server-side list and hierarchy filters, the Dashboard, checklists, and the HTTP API.
- `test/item-new-flag.test.js` — the core New flag: schema and the version 6 migration, restore validation, strict boolean validation, list sorting, the column catalog, template defaults, and batch import.
- `test/color-field.test.js` — the Color custom field: the shared rules, the version 10 rebuild of `custom_fields` and restore of a version 9 backup, item and template values, batch import, semantic sorting, the group/Custom/Not set filter, and the HTTP contract.
- `test/condition-grading.test.js` — Condition grade and Condition Notes: schema, the version 7 migration that keeps old text as notes, restore, grade validation, rank sorting, the filter, templates, duplicates, batch import, and the Dashboard.
- `test/serverProcess.js` — starts and stops the real server for the API tests on a free port chosen by the operating system (`PORT=0`), reading the bound port from its listening line.
- `test/hierarchy.test.js` — the hierarchy endpoint (shape, inherited location, one statement), the Location and Category projection rules, per-grouping expansion, and the Graph layout.
- `test/checklists.test.js` — checklist definitions, ordering, duplicates, runs, state changes, counts, completion, run history, snapshots over renamed and deleted items and deleted checklists, Last verified, container audits, and the version 3 and 4 migrations at the service level.
- `test/bulk-replace.test.js` — Bulk Replace Value matching, scope, validation, atomicity, and location inheritance at the service level.
- `test/item-history.test.js` — item activity history: change detection and no-ops, inherited moves at any depth, bulk move and replace, rollback, loans, retire and restore events with the open-loan rule, pagination, deletion, migration, the 100,000-event capacity measurement, and the HTTP contract; `scripts/history-benchmark.mjs` is the opt-in 1,000,000-event benchmark and shares its fill and measurement.
- `test/bulk-move.test.js` — Bulk Move selection roots, preserved nesting, cycle rejection, atomicity, unchanged roots, and untouched item data at the service level.
- `test/database-metadata.test.js` — database metadata creation, migration, repair, rename validation, and the `last_updated_at` write triggers.
- `test/background-removal.test.js` — local cutout tests: stubbed model output for the composition
  rules, plus one full run of the real model over the regression photo when it is installed.
- `test/i18n.test.js` — locale parity, message compilation, fallback, Ukrainian plurals, and locale-aware formatting.
- `test/errors.test.js` — error code coverage in both locales, the error response mapping, and error translation.
- `test/cloud-backup.test.js` — cloud backup services, adapters, scheduler, and API against the local Dropbox/Google Drive stub in `test/e2e/cloudProviderStub.js`.
- `test/fixtures/` — real source photos used as regression input by the Node.js tests.
- `test/e2e/settings-navigation.spec.js` — Settings section routes and redirects, the active state, the desktop section list, and the phone section selector.
- `test/e2e/color-field.spec.js` — creating a Color field, the picker (presets, arrow keys, Custom HEX, Clear), details, the Items column with sorting and filters, templates, both color modes, and phones.
- `test/e2e/lifecycle.spec.js` — Retire and Restore from the item page, the Active / All / Retired views of Items and Hierarchy, the container contents choice, checklists with retired items, the Dashboard link, phones, and Ukrainian.
- `test/e2e/` — Playwright browser tests, their fixtures, shared helpers, and the run launcher.
- `playwright.config.js` — Playwright projects, isolated test ports, and the cloud provider stub, API, Vite, and landing and demo build/preview processes started for the suite.
- `landing/` — the public landing page and user guide, a separate two-page Vue/Vite/Tabler build into
  `dist-landing/` (ignored by Git) published to GitHub Pages by `.github/workflows/pages.yml`:
  `index.html` and `guide/index.html` (the pages), `vite.config.js` (base path from
  `LANDING_SITE_URL`, release from `LANDING_RELEASE_TAG`, demo buttons from `LANDING_DEMO_URL`, and
  the `virtual:guide` modules; it fails without a full screenshot set per locale, on a guide
  translation that drifted from `docs/HOW-TO.md`, or on invalid guide presentation metadata),
  `site.js` (repository and documentation links, the guide source file of each locale,
  `landingRelease()` over the release history), `screenshots.js` (the screenshot names, sizes, and
  per-locale files), `guideSource.js` (renders `docs/HOW-TO.md` and `docs/HOW-TO.<locale>.md` with
  markdown-it at build time into sections with stable ids, checks their structural parity, and reads
  the demo's routes), `guidePresentation.js` (the guide's presentation layer by section id:
  screenshot, diagrams, demo route, self-hosted note — never guide text), `src/` (`content.js` holds
  the landing's language-neutral structure — section ids, icons, screenshot names, links, the page
  addresses, and the demo address with `?lang=` and a route — and `locales/en.json` and `uk.json` all
  the copy of both pages, loaded by `i18n.js` over the application's `client/src/i18n/core.js`;
  `main.js`/`App.vue`/`FeatureSection.vue` are the product page and `guide.js`/`GuidePage.vue` the
  guide with `GuideToc.vue`, `GuideExtras.vue`, and `GuideDiagram.vue`; both pages share
  `SiteNav.vue`, `SiteFooter.vue`, `LanguageMenu.vue` (the language dropdown), `ScreenshotFigure.vue`,
  `ScreenshotLightbox.vue` (the screenshot viewer, wired by `screenshotViewer.js`), and
  `landing.css`; the bundled Geist typeface is imported in each entry, and the screenshots are in
  `src/assets/screenshots/<locale>/`), `public/` (favicon and Open Graph image), and `scripts/`
  (`capture-screenshots.mjs`, which photographs the built public demo in every locale).
- `test/landing.test.js` — landing release resolution, site address, documentation links, landing
  message parity and compilation, the screenshot set and sizes of every locale, and the user guide:
  its sources, the same section ids in every language, structural drift that fails the build, safe
  Markdown rendering and links, valid presentation metadata and demo routes, and no guide text copied
  into the landing sources;
  `test/e2e/landing.spec.js` — the built landing page under a Pages-style base path, in English and
  Ukrainian: the language dropdown, persistence, metadata, localized screenshots, and Try Demo's
  `?lang=`;
  `test/e2e/guide.spec.js` — the built user guide under the base path: the landing links, metadata,
  accessibility, anchors and reloads, the desktop and phone tables of contents, screenshots and the
  viewer, diagrams, tables and code on phones, Try this in Demo and the self-hosted notes, the language
  change that keeps the section, the language across landing, guide, and demo, and every viewport.
- `test/demo.test.js` — the public demo data layer in Node: deterministic fixture, seeded content,
  the same structure in every locale and the Ukrainian texts, isolation of changes, the sql.js
  adapter, the demo photo and private-data checks, the fixture template and checklist the tour opens, retiring and restoring through the shared lifecycle service,
  and the guided tour's copy and action label rules;
  `test/e2e/demo.spec.js` — the built demo inside the landing build: no server requests, photos,
  temporary changes and Reset demo, reloaded deep links, unavailable features, no bundled secrets,
  `?lang=` and the language change that seeds the demo again;
  `test/e2e/tour.spec.js` — the demo's guided tour: every chapter pressed scene by scene, scenes
  that wait for their action, Auto Play with Pause/Resume, idempotent Replay/Back/Next, close,
  failing scenes, the inverse theme, the keyboard, the tour on the Ukrainian inventory, a language
  change during the tour, reduced motion, the compact phone presenter, and its absence from the
  self-hosted app.
- `docs/README.md` — documentation layout and conventions.
- `docs/HOW-TO.md` — quick user guide for the current application, the canonical English text of the
  public user guide.
- `docs/HOW-TO.uk.md` — its Ukrainian translation, the Ukrainian public user guide.
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
- These rules cover the application in `client/` and the public landing page in `landing/`, whose
  copy lives in `landing/src/locales/<locale>.json` (its own messages, the application's locale codes,
  rules, and storage key). The public demo inventory in `client/src/demo/fixture.js` is invented sample
  data, not user data: it carries its display text for every supported locale under stable semantic
  keys, and the guided tour identifies entities by those keys, never by English text.

## Data model and important constraints

- `categories` group items; a category used by any item cannot be deleted.
- `custom_fields` belong to a category and have the type `text`, `number`, `date`, `boolean`, or `color` (the `CHECK` is built from `FIELD_TYPES`; version 10 rebuilt older tables to widen it).
- `items` have a UUID, category, basic text attributes, a non-null `is_new` flag (`0`/`1`, a boolean in the API), a nullable `condition_grade` limited by a `CHECK` to `broken`, `poor`, `fair`, `good`, or `excellent`, the free-text `condition_notes`, and timestamps. New, the grade, and the notes are independent; `item_templates` has the same three columns. `items.lifecycle_status` is `active` or `retired` (`CHECK`), with the retirement columns (`retired_at`, `retired_reason` limited by a `CHECK`, recipient, note, and text snapshots of the last effective location and the former container). A container and everything inside it always share one lifecycle status, and every list, count, hierarchy, Dashboard figure, parent candidate, and new checklist run defaults to active items. `item_templates.is_new` is nullable: `NULL` means the template sets no New default.
- `item_field_values` store custom field values as text; booleans are normalized to `"1"` or `"0"`, and colors to the canonical JSON `{"key":"brown","hex":"#795548"}` (`key` a preset or `custom`).
- `item_templates` and `item_template_field_values` store user-defined presets for new items. A template is never an item; deleting its category sets `category_id` to NULL, and template values of deleted fields are ignored when read.
- `database_metadata` holds exactly one row: the database UUID, name, `created_at`, `last_updated_at`, and a mirror of `PRAGMA user_version` (the schema version source of truth). Triggers advance `last_updated_at` on every write to the tables in `TRACKED_TABLES` in `server/src/db.js`; a new inventory table must be added there.
- `item_photos` stores metadata and BLOB data in the same database. The API accepts up to 10 JPEG/PNG/WebP/GIF files of 15 MB each. `sort_order` (`0..n-1`, unique per item) is the persisted photo order, and the first photo is the cover: there is no cover flag. Every thumbnail query uses `coverPhotoIdSql()` from `server/src/repositories/itemPhotoRepository.js`.
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
- The guide is also the public user guide on the landing site (`landing/guide/`), rendered from the
  Markdown at build time. Every change to `docs/HOW-TO.md` updates its translation
  `docs/HOW-TO.uk.md` in the same change: the same headings at the same levels and in the same order,
  the same section numbers, and the same tables and code blocks per section; only the prose is free.
  The landing build and `test/landing.test.js` fail on any drift and name the section. Section ids
  come from the English headings, so renaming an English heading changes a public anchor: update
  `landing/guidePresentation.js`, which the build checks, and the guide's in-page links.
- Never copy guide text into the landing sources; the Markdown is its only source.
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

`npm run test:e2e` also builds and checks the landing page. After a visible interface change, re-run
`npm run landing:screenshots` when the landing screenshots no longer match the application.

`npm run lint` checks JavaScript and Vue files with the recommended ESLint and `eslint-plugin-vue` rules. `npm test` checks the main API flow against an isolated temporary database. `npm run build` verifies that the Vue client compiles. `npm run test:e2e` runs the Playwright workflows in Chromium against an isolated application. For UI changes, also verify the relevant flow manually with `npm run dev` when the environment permits it.

## Git

- Start every new task from the project issues on its own branch created from an up-to-date `master`, unless the user explicitly says to work on the current branch.
- Name the branch `<type>/<number>-<short-task-name>`, where `<type>` is `feature`, `bugfix`, or `techdebt`, `<number>` is the task number (the GitHub issue number, or the number in the `docs/issues/` task file name), and `<short-task-name>` is the task name in lowercase kebab case (for example, `feature/23-local-network-access`). If the task has no number or its type is unclear, ask the user before creating the branch.
- Title the pull request with the same parts: `<type>: #<number> <Task name>` (for example, `feature: #23 Local network access`).
- After updating the version when applicable and writing the completion record, create a local Git commit with a short, meaningful message written in English.
- When a completed feature updates the project version, create a new local tag named `v<version>` on the resulting feature commit immediately after committing (for example, version `0.10.0` uses tag `v0.10.0`).
- Commit only files that belong to the current task; do not include unrelated or pre-existing user changes.
- Never run `git push`. The user always pushes commits themselves.
