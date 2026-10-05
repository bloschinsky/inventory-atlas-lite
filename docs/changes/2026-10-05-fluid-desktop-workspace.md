# Fluid desktop workspace

- **Completed:** 2026-10-05
- **Version:** 0.51.0

## Summary

Implemented GitHub issue #6, *TASK: Replace Centered Desktop Container with a Fluid Application
Workspace*. The global application workspace is now fluid on desktop and wide screens, while local
form width constraints remain intentional.

- **Shell:** `client/src/App.vue` wraps `RouterView` in `.container-fluid.app-content` instead of the
  centered, breakpoint-limited `.container-xl`. Routed pages fill the `.page-wrapper` width beside the
  sidebar with the normal Tabler gutters; no custom widths or breakpoints were added.
- **Width policy:** the shell no longer decides that every page is narrow. Data pages (Dashboard,
  Items, Hierarchy tree and graph, Categories, Templates, Checklists, Item details) grow with the
  screen; `.form-card` (`--app-form-width: 820px`) keeps the item, template, checklist, AI, Settings,
  and Data forms readable. No page needed its own fix: every route was inspected at `2560` and `1366`
  pixels, and the Dashboard charts resize inside their cards.
- **Print Labels:** the print rule that removed the shell margins, padding, and width limit now
  targets `.app-content` instead of the removed `.container-xl`.
- **Documentation:** updated `docs/features/application-ui.md`, `qr-label-printing.md`,
  `playwright-e2e-tests.md`, `docs/HOW-TO.md`, `AGENTS.md`, the release history, and the roadmap;
  removed the completed `docs/issues/TASK-FLUID-DESKTOP-WORKSPACE.md`.

## Verification

- `npm run lint` — passed.
- `npm test` — 266 tests: 265 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `npm run test:e2e` (with `APP_VERSION=0.50.1`) — 136 passed. An earlier full run had one failure in
  `restore.spec.js` (the backup validation result did not appear within 5 seconds); that spec passed
  on its own and in the following full run, and it does not touch the changed layout. The new
  `test/e2e/fluid-workspace.spec.js` checks the fluid wrapper without `.container-xl` or `max-width`,
  the content filling the available width minus gutters without sideways scrolling at `1366`, `1440`,
  `1920`, `2560`, `768`, and `360` pixels, the Dashboard with its charts inside their cards, the Items
  table, the Hierarchy tree and graph at Full HD, and `.form-card` forms keeping their local width.
  It fails against the previous `.container-xl` shell. `print-labels.spec.js` now also asserts that
  the shell wrappers have no margin, padding, or width limit in print media.
