# Guided tour v2: multi-scene product presentation

- **Completed:** 2026-10-06
- **Version:** 0.55.0

## Summary

Implemented GitHub issue #18, *TASK: Guided Tour v2 — Multi-Scene Product Presentation Mode*, on top
of the guided tour from #17. See [`docs/features/demo-guided-tour.md`](../features/demo-guided-tour.md).

- **Chapter → Scene model:** `client/src/demo/tourSteps.js` became `tourChapters.js`: eight chapters
  (Dashboard, Categories & Fields, Hierarchy, Add an Item, Find Items, Templates, Checklists, Your
  inventory changed) of 4–8 automated scenes each, defined as data (`target`, `action`, `hold`,
  `skip`, `params`). `client/src/demo/tour.js` is the chapter engine: it opens the chapter's page on a
  fresh mount (`reloadDemoPage()` in `client/src/api.js` when it is the same page), plays the scenes,
  and offers Next, Back, Replay chapter, Pause, and Resume. One `AbortController` per run and a pause
  gate inside every presentation pause keep Next, Back, Replay, Close, and restarts from leaking
  actions into the next page. Failures log the chapter and scene ids and leave the page unlocked.
- **Timing:** `TIMING` in `client/src/demo/tourActions.js` centralizes the beats, transitions,
  viewing times, the longer Graph View hold, and the typing cadence (2 characters every 70 ms).
  Reduced motion keeps only the reading times.
- **Chapters:** every Dashboard area; the Categories overview before Photography's Fields; Location
  and Category grouping, Tree View, and Graph View; a narrated Add item form with serial number,
  Stored inside, Fields, photo, and Save inside the chapter; the Items filter, a Condition sort (table
  header or the phone Sort select), and a typed Nikon search; the *35mm film roll* template in its
  editor; a *Weekend photo walk* run with Nikon F65 marked Packed; and a final chapter that compares
  the Dashboard with the baseline taken when the tour started and presents only real changes. The
  existing fixture already contained the template and checklist the chapters need, so it is unchanged.
- **Idempotency:** Add an Item finds the tour item by name and edits it (no second photo), Items resets
  its stored sort, Checklists continues an open run, and every chapter mounts its page again.
- **Presenter:** `client/src/components/DemoTour.vue` shows *Chapter n of 8*, the scene copy, scene
  dots, a status line, Back, Pause/Resume, Replay chapter, and Next, with the final actions on the last
  chapter. The card carries the inverse `data-bs-theme`, so its Tabler tokens are the opposite of the
  page's. A `#<id>` spotlight target highlights a form control with its label.
- **Hooks:** new `data-tour` attributes on the Dashboard charts, the Hierarchy switches and graph, the
  Stored inside field and the category fields block, the Items filters, sortable headers, and rows,
  the template list and editor, and the checklist cards, expected items, start/continue buttons,
  progress, and run items.
- **Copy:** `tour.*` in `en.json` and `uk.json` rewritten per chapter and scene with
  ASD-STE100-inspired English rules; the rules and the review checklist are in the feature document.
- **Tests:** `test/e2e/tour.spec.js` rewritten (10 tests); `test/demo.test.js` gained a fixture check
  for the Templates and Checklists chapters and a copy-rule test.
- **Documentation:** the feature document (architecture, timing, Replay/Pause, inverse theme, the
  eight chapters, hooks, how to add chapters and scenes, deterministic replay, copy rules), its index
  entry, `public-demo.md`, `README.md`, `docs/HOW-TO.md`, `AGENTS.md`, and the 0.55.0 release-history
  entry. No task file or roadmap entry existed for this issue.

## Verification

- `npm run lint` — passed.
- `npm test` — 280 tests: 279 passed, 1 skipped (shellcheck is not installed locally). One earlier
  full run had `existing databases migrate and purchase and serial fields round-trip safely` fail
  once; it passed alone and in the next full run.
- `npm run build` — passed.
- `APP_VERSION=0.55.0 npm run test:e2e` — 175 tests: 174 passed (the 10 tour tests take about
  8.6 minutes of the run), 1 failed: `ai-visibility.spec.js` › *stays usable when the capability
  request fails*, with `ENOENT` on its trace file because a second Playwright run started during the
  suite cleared `test-results/`. `APP_VERSION=0.55.0 node test/e2e/run.js ai-visibility.spec.js` —
  6 passed.
- Visual review of screenshots of the built demo at 1440 × 900 (light) and 390 × 844 and
  1280 × 800 (dark): the inverse card, the spotlight on Dashboard charts, the Hierarchy tree and
  graph, the Add item fields, the Items sort and result, the checklist run, and the final chapter.
