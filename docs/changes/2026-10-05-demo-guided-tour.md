# Guided tour and presenter mode for the public demo

- **Completed:** 2026-10-05
- **Version:** 0.54.0

## Summary

Implemented GitHub issue #17, *TASK: Guided Product Tour and Presenter Mode for Public Demo*
(Phase 3 of the public showcase, on top of the demo from #15). See
[`docs/features/demo-guided-tour.md`](../features/demo-guided-tour.md).

- **Presenter:** `client/src/components/DemoTour.vue` — a floating **Guided tour** launcher, the step
  card (*Step n of 6*, progress bar, Back, Next, Close tour, Escape), a spotlight ring with a dimmed
  page that lets clicks through, a transparent lock only while a step acts, and *Retry* / *Skip step*
  when a step fails. The Tabler compass icon is the assistant mark; no character artwork is used.
  `App.vue` loads it through a dynamic import only when `__DEMO__` is set.
- **Data-driven steps:** `client/src/demo/tourSteps.js` defines six ordered steps (welcome on the
  Dashboard, Photography fields in Categories & Fields, the Camera Bag in Hierarchy, the real Add
  item form filled and saved, the Items filter and search, and the Dashboard wrap-up with Explore on
  your own, Reset demo, Get Inventory Atlas Lite, and View on GitHub). `client/src/demo/tour.js` is
  the engine: route, wait for the `data-tour` target, highlight, act, with an `AbortController` per
  run and a console diagnostic on failure. `client/src/demo/tourActions.js` holds the DOM actions,
  which feed the real form controls through `input` and `change` events and respect
  `prefers-reduced-motion`.
- **Deterministic state:** `startDemoBackend()` gained `reset()`; `client/src/api.js` exposes it as
  `resetDemoData()` together with `dataRevision`, which keys the routed page in `App.vue`. Starting
  the tour resets the fixture; the saved item's id makes Back and Next reopen and update it instead of
  creating a duplicate. The tour item (`tourItem` in `client/src/demo/fixture.js`) reuses the
  generated `nikon-f65.webp` photo.
- **Hooks:** `data-tour` attributes on the Dashboard KPI row, the category list and fields card, the
  Hierarchy Tree card, the item form, its Stored inside search and results, photo input, and Save
  button, and a wrapper around the Items results. No styles or behaviour depend on them.
- **Copy:** `tour.*` messages in `en.json` and `uk.json`; styles in `client/src/style.css`.
- **Tests:** `test/e2e/tour.spec.js` (9 tests) and one new test in `test/demo.test.js`.
- **Documentation:** the new feature document and its index entry, `public-demo.md`,
  `playwright-e2e-tests.md`, `README.md`, `docs/HOW-TO.md`, `AGENTS.md`, and the 0.54.0
  release-history entry. No roadmap entry or task file existed for this issue.

## Verification

- `npm run lint` — passed.
- `npm test` — 278 tests: 277 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed; the normal bundle contains no tour JavaScript or tour asset (only the
  tour's CSS rules in the shared stylesheet, like the demo strip's).
- `npm run test:e2e` (full suite, untagged `0.54.0-dev` build) — 156 passed, 8 failed: the seven
  `whats-new.spec.js` tests, which need a release version, and the tour's Escape check, which showed
  that Escape did not reach the card while a step held the focus in the form. Escape now closes the
  tour from anywhere while a step acts, and the test presses it with the focus in the Name field.
  `APP_VERSION=0.54.0 node test/e2e/run.js tour.spec.js whats-new.spec.js demo.spec.js` — 25 passed.
- Visual review of screenshots of the built demo at 1280 × 720 (light) and 390 × 844 (dark): the
  launcher, the card, and the spotlight on the Categories, Hierarchy, Add item, and Items steps.
- The Pages workflow has not run yet with the tour.
