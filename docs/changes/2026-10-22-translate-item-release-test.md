# Release test fix for Translate Item with AI

- **Completed:** 2026-10-22
- **Version:** 0.69.1

## Summary

- The v0.69.0 Release workflow failed in `npm run test:e2e` (290 passed, 1 failed). Translate Item
  with AI was tagged but never published. *server errors arrive as codes and are shown in the active
  language* in `test/e2e/i18n.spec.js` timed out clicking **Видалити** on Item Details, because the
  folded-hover sidebar intercepted the pointer events.
- Cause: this is the known Linux headless Chromium behavior described in `AGENTS.md`. A new page
  keeps the pointer at `(0, 0)`, so the sidebar expands over the left of the work area. 0.69.0 added
  **Translate with AI** to the Item Details actions. With the Ukrainian labels, that row now wraps on
  the release runner, and Delete moved to the left, under the expanded sidebar. Windows Chromium does
  not reproduce this, which is why the local run passed.
- The test now moves the pointer into the work area after `page.goto()`. No application code
  changed. 0.69.1 publishes the 0.69.0 feature, and the `v0.69.0` tag is left as it is.

## Verification

- `npm run lint`: passed.
- `test/e2e/i18n.spec.js` with `APP_VERSION=0.69.1`: passed.
- The overlap appears only on Linux headless Chromium, so the release workflow is the final check of
  the fix.
