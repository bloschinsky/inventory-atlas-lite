# Static interactive public demo

- **Completed:** 2026-10-05
- **Version:** 0.53.0

## Summary

Implemented GitHub issue #15, *TASK: Static Interactive Demo Mode with Curated Demo Inventory*
(Phase 2 of the public showcase). See [`docs/features/public-demo.md`](../features/public-demo.md).

- **Real UI, real server code:** `npm run demo:build` (`vite build --mode demo`) builds the regular
  client into `dist-landing/demo/` with `__DEMO__` set. `client/src/api.js` then hands every API
  request to `client/src/demo/backend.js`, which runs the real route tables, services, repositories,
  and schema over an in-memory sql.js database. `client/src/demo/express.js` replaces Express's
  `Router` through a build alias, and `client/src/demo/sqlite.js` adapts sql.js to the better-sqlite3
  calls the repositories make. The normal build contains none of it.
- **Server changes for reuse, behavior unchanged:** the schema and migrations moved from
  `server/src/db.js` to `server/src/schema.js` (re-exported by `db.js`); `itemRepository.js` and the
  schema use the global `crypto.randomUUID()`; `errorResponse()` recognizes upload errors by name
  instead of importing multer.
- **Canonical inventory:** `client/src/demo/fixture.js` — six categories with custom fields, five
  containers across *Home / Office*, *Home / Storage*, *Workshop*, and *Travel gear*, 22 invented
  items with fixed UUIDs, a template, and two checklists with one completed verification run.
  `client/src/demo/seed.js` loads it through the services.
- **Demo UI:** the **Demo mode** strip with **Reset demo** and **Get Inventory Atlas Lite**
  (`DemoBanner.vue`), hash routing, object URLs for photos through the new `photoUrl()`, and
  `DemoUnavailable.vue` in place of the Data page's backup, restore, and Danger Zone cards and the
  Cloud Backup and AI settings sections (`serverOnly` in `settingsSections.js`). Unknown API paths
  answer the new `DEMO_UNAVAILABLE` error, translated in English and Ukrainian.
- **Landing and Pages:** `.github/workflows/pages.yml` builds the landing page with `LANDING_DEMO_URL`
  pointing to `demo/`, builds the demo into the same artifact, checks it, and deploys both; it also
  runs on client, server, shared, and Vite configuration changes. The hero now shows **Try Demo**.
- **Dependency:** `sql.js` 1.14.2 (MIT) as a development dependency; only the demo build bundles it.
- **Tests:** `test/demo.test.js` (6 tests) and `test/e2e/demo.spec.js` (8 tests);
  `test/e2e/landing.spec.js` now expects Try Demo, and `playwright.config.js` builds the demo into the
  previewed landing site.
- **Documentation:** the new feature document and its index entry, `landing-page.md`,
  `playwright-e2e-tests.md`, `README.md`, `docs/HOW-TO.md`, `AGENTS.md`, and the 0.53.0
  release-history entry.

## Demo photo assets

The issue's comment carries the canonical photos as a Base64 ZIP, but the posted payload is
truncated: it contains a literal `[... ELLIPSIZATION ...]` marker, decodes to 15,009 bytes, and does
not match the published SHA-256. The archive stores its files uncompressed, so four of them were
recovered intact and verified against the CRC32 in the archive's central directory:
`cordless-drill.webp`, `power-bank.webp`, `speedlight.webp`, and `usb-c-charger.webp`.

The other six — `nikon-f65.webp`, `nikkor-50mm.webp`, `film-rolls.webp`, `portable-ssd.webp`,
`multimeter.webp`, and `handheld-radio.webp` — were supplied again by the project owner as 1254 × 1254
PNG images in the same generated style, matched to their items, and converted to 256 × 256 WebP
(quality 80, 2.5–9.5 KB each) like the recovered ones.

## Verification

The first full run used temporary plain-color stand-ins for the six then-missing photos; they were
deleted, and the demo tests were run again on the final photos.

- `npm run lint` — passed.
- `npm test` — 277 tests: 276 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed; the bundle contains neither sql.js nor the demo backend.
- `npm run landing:build` and `npm run demo:build` — passed.
- `npm run test:e2e` with `APP_VERSION=0.53.0` — 155 passed, including the eight demo tests and the
  updated landing tests. With the final photos: `test/demo.test.js` 6 passed and `demo.spec.js` with
  `landing.spec.js` 16 passed.
- Manual review of the built demo in Chromium at 1366 and 390 pixels under the Pages-style base path:
  the strip, the Dashboard, item details with a photo, no console errors, and no sideways scrolling.
- The Pages workflow has not run yet with the demo.
