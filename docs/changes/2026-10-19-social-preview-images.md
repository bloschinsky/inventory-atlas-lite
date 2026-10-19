# Social preview images, phase 1

- **Date:** 2026-10-19
- **Version:** 0.66.1 (unchanged: only the public site's assets and tooling changed, not the application)
- **Task:** GitHub issue #39

## Summary

- Six localized 1200 × 630 social preview cards for the public site, one per page and language:
  `landing/public/og/landing-en.png`, `landing-uk.png`, `guide-en.png`, `guide-uk.png`,
  `demo-en.png`, and `demo-uk.png` (256–277 KB each), published as `og/<page>-<locale>.png` under
  the site address. `landing/socialImages.js` names them, their size, and the 400 KB budget for the
  next phase.
- One design for all cards — the landing hero's ink, glows, and dot grid, Geist, the product mark,
  and a shared copy column — with a page-specific accent and visual:
  - **Landing:** *Know what you own. Know where it is.* / *Знай, що маєш. Знай, де воно.*, *Your
    server. Your data.* / *Твій сервер. Твої дані.*, the localized Items list and an item on a phone.
  - **Guide:** *User Guide*, *How to use Inventory Atlas Lite*, and a contents page listing the first
    eight sections of the localized user guide (read from `docs/HOW-TO.md` and `docs/HOW-TO.uk.md`)
    over a faded Hierarchy screenshot.
  - **Demo:** *Live demo*, *Try it right in your browser*, *No installation, no sign-up*, the
    localized Dashboard in a browser window and a checklist run on a phone.
- The copy is `social.<page>` in `landing/src/locales/en.json` and `uk.json`; the pictures are the
  existing localized demo screenshots, so only invented demo data appears.
- `npm run landing:social` (`landing/scripts/render-social-images.mjs`) renders the cards locally
  in Chromium from `landing/social/layouts.js` and `card.css` with the bundled Geist Latin and
  Cyrillic subsets, at twice the size scaled down by sharp. It fails on a missing typeface, copy that
  overflows its column or a cut contents line, and a result that is not a PNG of the exact size within
  the budget, and it does not rewrite unchanged files. `--locale=<code>` renders one language.
- The pages still reference `og-image.png`; switching them to the localized images, URLs, and
  metadata is the next phase.
- Tests: `test/landing.test.js` checks the six files (PNG, exact size, budget, all distinct, no stray
  files, copy present) and that `og-image.png` stays; `test/e2e/landing.spec.js` checks that all six
  are served as PNG under the Pages base path.
- Documentation: `docs/features/landing-page.md`, `docs/features/README.md`, `README.md`, and
  `AGENTS.md`.

## Verification

- Visual review of all six cards side by side: equivalent EN/UK compositions, Ukrainian glyphs in
  Geist, no clipping; a second render reported every file unchanged.
- `npm run lint` — passed.
- `npm test` — 400 passed, 2 failed: the two guide tests in `test/landing.test.js` that also fail on
  a clean `master` on Windows; the new social image test passes.
- `npm run build` and `npm run landing:build` — passed; `dist-landing/og/` holds the six images.
- `APP_VERSION=0.66.0 npm run test:e2e` — 263 passed, 1 failed: `ai-add-item.spec.js` *keeps the AI
  draft and original photo when local background removal fails*, a strict-mode race with the
  transient "Create a category" alert of the item form. It is unrelated to this change: run alone it
  passed and failed on this branch and also failed on a clean `master`. The updated landing test
  passed.
