# Public user guide: a localized visual handbook rendered from HOW-TO.md

- **Completed:** 2026-10-07
- **Version:** 0.58.0
- **Issue:** #22

## Summary

The landing site has a second page, `guide/`, the public **User Guide**, rendered from the
repository's user documentation instead of a third hand-maintained manual.

- **Source of truth:** `docs/HOW-TO.md` stays the canonical English guide; the new
  `docs/HOW-TO.uk.md` is its full Ukrainian translation with the same structure. Nothing of the guide
  text is copied into the landing sources.
- **Rendering pipeline:** `landing/guideSource.js` renders the Markdown at build time with markdown-it
  (new development dependency; raw HTML disabled, nothing of it in the bundle) into a title, an
  introduction, and numbered sections with subsections. Section ids are slugs of the English headings
  without numbers, shared by every language; in-page links map to them, repository links open on
  GitHub, tables and code blocks scroll in their own focusable box. A Vite plugin serves each locale
  as a lazily loaded `virtual:guide/<locale>` module.
- **Parity checks:** a translation must match the English headings, levels, order, numbers, and the
  tables and code blocks of every section; any drift, a link to a missing heading, or invalid
  presentation metadata fails the landing build and `npm test`, naming the section.
- **Presentation layer:** `landing/guidePresentation.js` adds, by section id, localized landing
  screenshots (opening in the existing viewer), three text diagrams (location/container/item,
  category/fields/values, the backup model), *Try this in Demo* links to the described demo page in
  the guide language (`?lang=` + hash route), and *Requires a self-hosted installation* notes for
  backup, restore, reset, cloud backup, updates, and AI. Demo routes are validated against the
  application routes and the demo's unavailable pages.
- **Page:** `GuidePage.vue` with a dark title band, sticky desktop table of contents with the current
  section, a compact *On this page* bar on phones, linkable headings, anchors that survive reloads and
  language changes, localized metadata and canonical URL, and the landing's language menu, Geist,
  gutters, and both color modes.
- **Landing:** **Read the user guide** and a new **Guide** navigation link open the guide; the
  navigation, footer, screenshot figure, and viewer wiring became shared components; screenshots now
  carry their pixel size; the language menu no longer scrolls the page when it takes focus.
- `pages.yml` also deploys on changes to the guide Markdown.
- Documentation: new `docs/features/public-user-guide.md` (architecture, pipeline, parity rules,
  metadata, screenshots, diagrams, demo links, updating both languages, adding a locale), the features
  index, `landing-page.md`, `docs/HOW-TO.md` and `HOW-TO.uk.md`, `docs/README.md`, `README.md`, and
  `AGENTS.md` (the Ukrainian guide exception and the rule to update both guides together). No task file
  was created, as the issue requested.

## Verification

- `npm run lint` — passed.
- `npm test` — 294 passed, 1 skipped, 0 failed. New in `test/landing.test.js`: both guides built from
  their files, the same unique section ids and numbers in every language, drift detection (removed
  section, heading level, number, code block, table, broken in-page link), safe Markdown and link
  resolution, presentation metadata and demo route validation, self-hosted sections without demo
  links, screenshot sizes, and no guide text in the landing sources.
- `npm run build`, `npm run landing:build`, `npm run demo:build` — passed.
- Visual review of the guide in English and Ukrainian, light and dark, at 1366 and 360–390 px.
- `APP_VERSION=0.58.0 npm run test:e2e` — 213 passed, 1 failed: a guide locator also matched the
  new User Guide link in the Ukrainian introduction; after scoping it to the navigation, the guide and
  landing specs passed on re-run (47 passed). New `test/e2e/guide.spec.js` (21 tests):
  landing links, metadata, accessibility, anchors and reloads, both tables of contents, screenshots
  and the viewer, diagrams, tables and code on a phone, demo links and self-hosted notes, language
  changes that keep the section, the language across landing/guide/demo, six viewports, and phone
  gutters.
