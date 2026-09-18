# AGENTS.md

## Project overview

Inventory Atlas Lite is a small self-hosted application for tracking personal physical items. Users can create categories and custom fields, add items and photos, search and filter records, and download a backup of the entire SQLite database.

This is an MVP without authentication, intended for use on a trusted local network or through VPN/Tailscale. During development, prioritize the fastest simple implementation that fully solves the current need and remains easy to understand. Follow KISS, DRY, and YAGNI: do not add abstractions, dependencies, configuration, or features for hypothetical future use.

## Language

- Use English throughout the project.
- Write all documentation, code comments, commit messages, identifiers, user-facing copy, test descriptions, and configuration notes in English.
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

The data flow is intentionally simple: a Vue page calls the helper in `client/src/api.js`, an Express route validates the request and works directly with SQLite, and then returns JSON. Do not introduce additional layers without a concrete need.

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
- `client/src/pages/ItemsList.vue` — item list, search, filtering, sorting, and pagination.
- `client/src/pages/ItemDetails.vue` — item details, photos, and deletion.
- `client/src/pages/ItemForm.vue` — item creation/editing, custom field values, and photo uploads.
- `client/src/pages/Categories.vue` — category and custom field management.
- `client/src/pages/DataBackup.vue` — SQLite backup download.
- `client/src/style.css` — small set of application styles layered on Tabler, built only from
  Tabler custom properties so both color modes stay correct.
- `server/src/index.js` — Express app, all API routes, validation, photo handling, backup, and production static serving.
- `server/src/db.js` — database path, SQLite connection, PRAGMAs, and current table/index schema.
- `test/e2e.test.js` — end-to-end acceptance test for the API, persistence, photos, and backups.
- `test/e2e/` — Playwright browser tests, their fixtures, shared helpers, and the run launcher.
- `playwright.config.js` — Playwright projects, isolated test ports, and the API and Vite processes started for the suite.
- `docs/README.md` — documentation layout and conventions.
- `docs/HOW-TO.md` — quick user guide for the current application.
- `docs/issues/` — active tasks, feature specifications, and future work.
- `docs/features/` — permanent documents for implemented features, with `README.md` as their index.
- `docs/changes/` — dated records of completed repository changes.
- `data/` — local runtime data; SQLite files and backups are ignored by Git.
- `dist/` — output from `npm run build`; generated automatically and ignored by Git.
- `eslint.config.js` — recommended ESLint rules for JavaScript and Vue files, plus browser and Node.js globals.
- `vite.config.js` — Vue plugin and development proxy configuration.
- `README.md` — setup, production, and backup instructions.

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
- Validate data on the server. Return API errors as `{ "error": "..." }`, as expected by `client/src/api.js`.
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
- Commit only files that belong to the current task; do not include unrelated or pre-existing user changes.
- Never run `git push`. The user always pushes commits themselves.
