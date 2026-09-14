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
- Client: Vue 3 Composition API (`<script setup>`), Vue Router, Vite, and Bootstrap 5.
- Server: Express 5 and `multer`; the REST API is available under `/api`.
- Data: a single SQLite database accessed through `better-sqlite3`. It stores both records and the original photo bytes.
- In development, Vite runs on `:5173` and proxies `/api` to Express on `:3000`.
- In production, Express serves the built client from `dist/` and listens on `PORT` (default `3000`).

The data flow is intentionally simple: a Vue page calls the helper in `client/src/api.js`, an Express route validates the request and works directly with SQLite, and then returns JSON. Do not introduce additional layers without a concrete need.

## Repository structure

- `client/src/main.js` — starts Vue, configures the router, and lists application routes.
- `client/src/App.vue` — shared application shell and primary navigation.
- `client/src/api.js` — shared `fetch` wrapper and helper for JSON requests.
- `client/src/pages/ItemsList.vue` — item list, search, filtering, sorting, and pagination.
- `client/src/pages/ItemDetails.vue` — item details, photos, and deletion.
- `client/src/pages/ItemForm.vue` — item creation/editing, custom field values, and photo uploads.
- `client/src/pages/Categories.vue` — category and custom field management.
- `client/src/pages/DataBackup.vue` — SQLite backup download.
- `client/src/style.css` — small set of global styles layered on Bootstrap.
- `server/src/index.js` — Express app, all API routes, validation, photo handling, backup, and production static serving.
- `server/src/db.js` — database path, SQLite connection, PRAGMAs, and current table/index schema.
- `test/e2e.test.js` — end-to-end acceptance test for the API, persistence, photos, and backups.
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

## Verification

After a change, run checks appropriate to its scope:

```bash
npm run lint
npm test
npm run build
```

`npm run lint` checks JavaScript and Vue files with the recommended ESLint and `eslint-plugin-vue` rules. `npm test` checks the main API flow against an isolated temporary database. `npm run build` verifies that the Vue client compiles. For UI changes, also verify the relevant flow manually with `npm run dev` when the environment permits it.

## Git

- After completing each task, create a local Git commit with a short, meaningful message written in English.
- Commit only files that belong to the current task; do not include unrelated or pre-existing user changes.
- Never run `git push`. The user always pushes commits themselves.
