# Landing visual polish: screenshot viewer, mobile gutters, typography, and product identity

- **Completed:** 2026-10-06
- **Version:** 0.54.0 (unchanged: only the public landing page changed, not the application)
- **Issue:** #19

## Summary

A focused polish pass over the public landing page in `landing/`, without a redesign.

- **Screenshot viewer:** `landing/src/ScreenshotLightbox.vue`, one native modal `<dialog>`, replaces
  the links that navigated to the raw image files. Every screenshot, the two hero ones included,
  opens enlarged on a light panel titled by its caption, fitted to the window with its aspect ratio
  kept. The screenshots of one section form a gallery with Previous/Next, the arrow keys, and a
  counter. Close, Escape, and a backdrop click close it, and focus returns to the screenshot. On
  phones it fills the screen with a small margin and 44-pixel buttons. The links still point at the
  full-size files, so modified clicks and a page without its script keep working. No dependency was
  added for it.
- **Try Demo** opens the demo in a new tab (`target="_blank"`, `rel="noopener noreferrer"`), with an
  external-link icon and a visually hidden *(opens in a new tab)*.
- **Mobile gutters:** one `--landing-gutter` (24 px on phones, 32 px from 768 px) sets Tabler's
  container gutter on every band. On phones the hero spacing is tuned, the hero title is about
  34–36 px, and below 400 px the navigation's GitHub button shows only its icon so the bar stays on
  one row.
- **Typography:** Geist (`@fontsource-variable/geist` 5.3.0, OFL-1.1, a new exact development
  dependency) is bundled with the landing build and set before Tabler's system stack. The hero title
  is weight 720 with −0.03em tracking, section titles weight 680 with −0.02em, and body text 17–18 px
  with shorter lines. The application does not import the font.
- **Facts rail:** the four benefit cards became a compact rail of six facts in the dark hero band —
  Self-hosted, SQLite, Docker, Proxmox, No accounts, Local-first — six across on wide screens, three on
  tablets and laptops, two on phones.
- **Numbered story and captions:** the showcase labels read *01 / Organize*, *02 / Describe*,
  *03 / Label*, *04 / Find*, and *05 / Understand* next to the existing icon and title. Every
  screenshot is a figure with a short *Page · what it shows* caption. The alternating layout and the
  existing glow, dot grid, and reveal animation are unchanged.
- `docs/features/landing-page.md`, its index entry, and the landing entry in `AGENTS.md` describe
  the result. The user guide covers the application only, so it is unchanged.

## Verification

- `npm run lint` — passed.
- `npm test` — 277 passed, 1 skipped, 0 failed.
- `npm run build` — passed.
- `APP_VERSION=0.54.0 npm run test:e2e` — 172 passed, 2 failed. `APP_VERSION` is needed because the
  untagged working copy otherwise reports a `-dev` version to the What's New tests. The first failure
  was the new phone viewer test, which measured the Close button during the opening animation. It
  now runs with reduced motion, and `landing.spec.js` passed 18 of 18 on the re-run. The second was
  `condition-grading.spec.js` › *the info button beside Condition…*: the folded desktop sidebar
  intercepted the click. That test is in the application, which this change does not touch. It passes
  and fails intermittently with the same code, and it passed on a clean `master` checkout.
  `test/e2e/landing.spec.js` now has 18 tests (previously 8). They cover the viewer, Try Demo's
  new-tab attributes, the gutters and hero title at 360/390/430 px, no sideways scrolling at 360, 390,
  430, 768, 1366, and 1920 px, the font loaded only from the base path with no request to another
  host and missing from the application, the facts rail, the story markers, and the figure captions.
- Manual review of the built page in Chromium at 1366 × 768 (hero, facts rail, viewer gallery,
  Escape with focus return), plus Playwright captures at 360, 390, 430, and 768 px of the hero,
  the showcase, and the viewer on desktop and phone screenshots.
