# Item form category warning flash

- **Date:** 2026-10-19
- **Version:** 0.66.1
- **Task:** GitHub issue #46

## Summary

- The item form showed *Create a category before adding an item.* for a moment on every load. The
  warning was rendered while `categories` from `useItemDraftForm()` was still the empty list it holds
  until `start()` has loaded `/api/categories`.
- `client/src/pages/ItemForm.vue` now records when the categories have loaded
  (`categoriesLoaded`) and shows the warning only for a loaded empty list.
- The flash also made `test/e2e/ai-add-item.spec.js` › *keeps the AI draft and original photo when
  local background removal fails* flaky: its `getByRole('alert')` could match both the
  background-removal warning and the transient category warning, a strict-mode violation. The test
  failed intermittently on `master` and needs no change of its own.
- New regression test in `test/e2e/items.spec.js`: *does not warn about missing categories while
  they are still loading* holds the category response and checks that the form shows no alert
  before or after it arrives.
- Release history: the 0.66.1 entry.

## Verification

- The new test fails without the fix (one alert while the categories are held) and passes with it.
- `ai-add-item.spec.js` › *keeps the AI draft…* with `--repeat-each=5` — 5 passed.
- `npm run lint` and `npm run build` — passed.
- `npm test` — 399 passed, 2 failed: the two guide tests in `test/landing.test.js` that also fail on
  a clean `master` on Windows.
- `APP_VERSION=0.66.1 npm run test:e2e` — 265 passed.
