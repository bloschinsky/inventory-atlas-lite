# Release test fix for the New item field

- **Completed:** 2026-10-04
- **Version:** 0.48.1

## Summary

- The v0.48.0 Release workflow failed in `npm run test:e2e` (119 passed, 1 failed), so the
  New item field was tagged but never published. *creates an item, finds it in the list, and edits its
  values* in `test/e2e/items.spec.js` timed out on `check()` of the new **New** switch: the folded-hover
  sidebar intercepted the pointer events.
- Cause: the known Linux headless Chromium behavior described in `AGENTS.md`. A new page keeps the
  pointer at `(0, 0)`, which expands the sidebar over the controls on the left of the work area. The
  test opened `/items/new` directly and, unlike the other New-flag specs, did not move the pointer away
  first. The earlier steps of the test only filled inputs, which does not need the pointer; the New
  switch is the first click there. Windows Chromium does not reproduce it, which is why the local run
  passed.
- The test now moves the pointer into the work area after `page.goto('/items/new')`. No application
  code changed; 0.48.1 publishes the 0.48.0 feature. The `v0.48.0` tag is left as it is.
- Also added the Fluid desktop workspace task to `docs/ROADMAP.md` in a separate commit.

## Verification

- `npm run lint` — passed.
- `npm test` — 239 tests: 238 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `npm run test:e2e` with `APP_VERSION=0.48.1` (the uncommitted working copy is not on a release tag)
  — 120 passed. The sidebar overlap itself appears only on Linux headless Chromium, so the release
  workflow is the final check of the fix.
