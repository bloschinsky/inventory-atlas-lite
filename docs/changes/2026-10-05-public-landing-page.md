# Public landing page and GitHub Pages showcase

- **Completed:** 2026-10-05
- **Version:** 0.52.0

## Summary

Implemented GitHub issue #14, *TASK: Public Vue Landing Page and GitHub Pages Showcase* (Phase 1 of
the public showcase). The application itself is unchanged.

- **Page:** `landing/` is a separate Vue 3 + Vite build with Tabler (`npm run landing:dev`,
  `landing:build`, `landing:preview`; output `dist-landing/`). It has a hero with **Get Inventory
  Atlas Lite** (the README's Official releases section) and **View on GitHub**, four self-hosting
  principles, five showcase sections (Hierarchy, categories and fields, photos and QR, search and
  checklists, Dashboard and optional AI), four install cards (GitHub Release, Docker, Proxmox VE,
  Node.js), a final call to action, and SEO/Open Graph metadata with a favicon. It follows the system
  light/dark mode. No Try Demo control is rendered; `LANDING_DEMO_URL` enables it once Phase 2 exists.
- **Release information:** `landing/site.js` resolves the announced version and date from
  `shared/release-history.json` — the entry of the latest published GitHub Release
  (`LANDING_RELEASE_TAG`) or, in a local build, the newest entry. Nothing is edited per release.
- **Base path:** `LANDING_SITE_URL` sets the Vite base and the canonical/Open Graph addresses.
- **Deployment:** the new `.github/workflows/pages.yml` builds and deploys to GitHub Pages on landing
  changes to `master`, after each successful Release run, and on demand. `release.yml` is unchanged.
- **Screenshots:** `npm run landing:screenshots` captures eight real application screenshots and the
  Open Graph image from a fictional inventory seeded through the API on a temporary data directory;
  item photos are generated SVG illustrations. Total screenshot weight is about 330 KB of WebP.
- **Tests:** `test/landing.test.js` and `test/e2e/landing.spec.js`; `playwright.config.js` builds and
  previews the landing under `/pages-base-test/`.
- **Documentation:** `docs/features/landing-page.md`, the features index, the Playwright and release
  pipeline documents, `README.md`, `AGENTS.md`, and the 0.52.0 release-history entry. `docs/HOW-TO.md`
  is unchanged because the application's behavior did not change.

## Verification

- `npm run lint` — passed.
- `npm test` — 271 tests: 270 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `npm run landing:build` — passed.
- `npm run test:e2e` (with `APP_VERSION=0.52.0`, because the uncommitted tree still sits on the
  `v0.51.0` tag) — 144 passed, 1 failed: a click timeout in `condition-grading.spec.js` (the grading
  help), which passed in the earlier full run and on its own rerun (3 passed) and does not touch the
  landing. The six new `landing.spec.js` tests passed. A run without `APP_VERSION` failed only the
  seven `whats-new.spec.js` tests for that tag reason; they passed with it.
- `scripts/validate-release-version.mjs v0.52.0` and `scripts/release-notes.mjs v0.52.0` — passed.
- Manual review of the built page in Chromium at 1440 (light and dark) and 390 pixels: no console
  errors, no failed requests, no sideways scrolling.
- The Pages workflow has not run yet: Pages must first be enabled with the GitHub Actions source.
