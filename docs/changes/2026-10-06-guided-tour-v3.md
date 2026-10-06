# Guided tour v3: compact mobile presenter and manual-first scenes

- **Completed:** 2026-10-06
- **Version:** 0.57.0

## Summary

Implemented GitHub issue #21, *TASK: Guided Tour v3 — Compact Mobile Presenter and Manual-First Scene
Interaction*, on top of the chapter/scene tour from #18 and the localized fixture from #20. See
[`docs/features/demo-guided-tour.md`](../features/demo-guided-tour.md).

- **Manual-first engine:** `client/src/demo/tour.js` no longer plays every scene on its own. A scene
  moves the spotlight (`opening`), then waits (`waiting`) without any timeout; `advance()` — the one
  canonical path, called by the scene action button and by Auto Play — runs the scene's action and
  its `hold` (`acting`), and the next scene appears. The last scene completes the chapter (`done`);
  `failed` and `idle` are unchanged. `advance()` acts only on a waiting scene, so double clicks and
  late delays never run an action twice. The existing per-run `AbortController` now also rejects the
  waiting scene, and the Auto Play delay is an abortable `sleep()` bound to one waiting scene.
- **Auto Play:** off by default and kept for the visit; it presses the waiting scene's action after
  `TIMING.read` (4 s, kept under reduced motion). Pause/Resume exist only while Auto Play is on;
  Pause cancels the delay and holds a running action at its next pause point; switching Auto Play
  off returns to manual waiting. A new chapter starts unpaused.
- **Contextual labels:** `actionLabelKey()` in `client/src/demo/tourChapters.js` labels the button:
  `tour.chapters.<chapter>.actions.<scene>` for a scene's own action, and
  `tour.chapters.<chapter>.continue.<next scene>` for an action-less scene, keyed by the next scene
  actually shown (so the final chapter's skipped scenes never mislabel a button). 33 labels per
  language, with fixture names as placeholders.
- **Chapter data:** actions moved so that the next scene's copy explains their result (Hierarchy,
  Find Items, Templates, Checklists), or stay on the scene whose copy announces them (Add an Item).
  Categories lost its `select` scene (the overview's action selects Photography); Checklists'
  `check` scene became `open` (*Start the Checklist*) and `run` (*Mark as Packed*); Find Items ends on
  `item-row-<id>` through a function `target`. A few scene texts were rewritten to describe the
  result after the press, in both languages.
- **Separate navigation:** the primary button is the scene action while the chapter is unfinished
  and **Next** only once it is complete; **Skip chapter** (icon) leaves an unfinished chapter, and
  **Back** and **Replay chapter** became icon buttons with names and tooltips.
- **Presenter and phones:** `client/src/components/DemoTour.vue` and `client/src/style.css` lay the
  card out as one CSS grid with different areas per breakpoint. At `max-width: 575.98px` it is a
  compact strip: one header line (*3/8 · Hierarchy*, dots, Close), a 2 px progress bar, the copy
  scrolling inside the card, and one controls row of 36 px icon buttons plus the scene action; at
  most `max(35dvh, 14rem)` tall and about 170–240 px in normal scenes. The scene dots mark completed,
  current, and remaining scenes. While the tour is open the page keeps 40vh of room at its end so
  targets scroll above the card; the card stays at the bottom edge (no dynamic top placement). The
  lock covers the page only while the tour changes it, not while a scene waits.
- **Focus:** after a chapter opens or a scene finishes acting, the focus moves to the new primary
  button (unless the visitor focused something on the page), so Enter or Space continues the tour.
- **Copy:** new presenter strings `tour.progressShort`, `tour.autoplay`, `tour.skip`, and a clearer
  `tour.paused`, plus the `actions` and `continue` labels, in `en.json` and `uk.json`.
- **Tests:** `test/e2e/tour.spec.js` rewritten for the manual-first flow (16 tests): the full tour
  pressed scene by scene; waiting scenes proven idle with Playwright's page clock; a double click;
  Auto Play, Pause, Resume, Auto Play off, a stale delay, and Replay in both modes; Replay/Back/Next
  idempotency including Back during an action; Close and Escape during an action; a failing scene
  action; the inverse theme; the keyboard; Ukrainian labels; reduced motion; the compact presenter
  measured at every scene on a 390 × 844 phone and the controls row on 360 × 800 and 430 × 932.
  `test/demo.test.js` gained a label rule test.
- **Documentation:** the feature document (manual-first scenes, labels, Next, Auto Play, Pause rules,
  the compact phone layout, the engine states, how scenes name their labels, how to test a chapter
  in both modes), its index entry, `public-demo.md`, `README.md`, `docs/HOW-TO.md`, `AGENTS.md`, and
  the 0.57.0 release-history entry. As the issue asked, no task file was created; the roadmap has no
  entry for it.

## Verification

- `npm run lint` — passed.
- `npm test` — 288 tests: 287 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `node test/e2e/run.js tour.spec.js` — 16 passed during development (the 360 px controls row first
  wrapped because of Tabler's 40 px `.btn-icon` minimum; fixed and re-run).
- `APP_VERSION=0.57.0 npm run test:e2e` — 193 tests, all passed (18.9 minutes).
- Visual review of screenshots of the built demo at 1920 × 1080 and 390 × 844: the desktop card in
  one controls row, the disabled action during the spotlight move, and the compact phone strip
  (about 170 px) with the highlighted field above it.
