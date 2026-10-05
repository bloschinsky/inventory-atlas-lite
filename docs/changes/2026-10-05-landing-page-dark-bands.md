# Landing page: dark bands, texture, section icons, and reveal on scroll

- **Completed:** 2026-10-05
- **Version:** 0.52.0 (unchanged: only the public landing page changed, not the application)

## Summary

The first published landing page was too pale: the background, the cards, and the screenshots had
almost the same tone. Four styles were compared on the real page; the dark-band variant was chosen.

- **Dark bands:** the navigation, the hero with the principles, the final call to action, and the
  footer use a dark ink-blue background and `data-bs-theme="dark"`, so Tabler's dark colors style
  their text and buttons in both system modes. The principles became translucent cards.
- **Texture:** the hero has blue and violet glows under a dot grid that fades out towards the
  principles; the bottom edge is plain ink, so the two bands join without a seam.
- **Showcase rhythm:** the sections alternate white and a cool gray (`#eaeff6`) in light mode and the
  two Tabler dark surfaces in dark mode; screenshots got firmer borders and deeper shadows.
- **Section icons:** every section label has a gradient icon (`content.js` gives each section one;
  Install uses a rocket).
- **Reveal on scroll:** `App.vue` uses one `IntersectionObserver` to fade and slide in the
  principles, the showcase columns, the install heading and cards, and the final call to action, with a
  short stagger. The hidden state exists only under `prefers-reduced-motion: no-preference` and after
  the script has started, so reduced motion or a failed script shows everything at once.
- `docs/features/landing-page.md` describes the new look and its tests.

## Verification

- `npx eslint landing test/e2e/landing.spec.js` — passed.
- `npm run landing:build` — passed.
- `test/e2e/landing.spec.js` — 8 passed, including two new tests: the hero and the final call to
  action are dark bands in light and dark system modes, and a section is hidden until it scrolls into
  view but shown at once with reduced motion.
- Manual review of the built page in Chromium at 1440 pixels (light and dark) and 390 pixels: no
  console errors, no failed requests, no sideways scrolling.
