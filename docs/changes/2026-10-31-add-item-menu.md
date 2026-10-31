# Consolidate the Add item menu and fix it on phones

- **Completed:** 2026-10-31
- **Version:** 0.70.1
- **Issue:** #56 (UX — Consolidate Add Item Menu and Fix Mobile Dropdown)

## Summary

- The Items page **Add item** menu (`client/src/components/AddItemMenu.vue`) now lists every entry
  point in a fixed order, each with a Tabler icon: **Blank item**, **From template…**, a divider,
  **From URL** (URL import capability), **AI Add Item** (AI capability), and **Batch Add from JSON**.
- **AI Add Item** stays an outline quick action beside **Add item** while AI is on, and is also in the
  menu on purpose. The main part of the split button still opens the blank form.
- The standalone **Batch Add from JSON** header button is gone. The menu entry emits `batch-add`.
  `ItemsList.vue` keeps the dialog, its selected-category start, and the workflow unchanged. The entry
  is disabled while no category exists. Cancelling the dialog returns focus to the menu toggle.
- **Phones.** On opening, and on a resize while open, the menu is aligned to the end of the button. It
  moves toward the start only as far as needed to keep an 8 px margin inside the viewport. It is never
  wider than the viewport, labels wrap instead of being cut, and coarse pointers get taller entries
  (`client/src/style.css`). Before this change, the end-aligned menu ran past the left edge of narrow
  screens.
- No API, database, or translation key changes. The user guide (EN/UK),
  `docs/features/application-ui.md`, `batch-add-items.md`, `item-templates.md`,
  `playwright-e2e-tests.md`, `AGENTS.md`, and the landing `items` and `items-search` screenshots
  (EN/UK) are updated.

## Verification

- New `test/e2e/add-item-menu.spec.js`: the shortcut, the complete menu and its order, Escape and
  focus return, outside press, Batch Add for the selected category with focus return on Cancel, the
  AI menu entry, the main Add item segment, hidden AI and URL entries, disabled Batch Add without
  categories, and the menu inside the viewport with untruncated EN and UK labels and tap heights at
  320, 375, 390, 768, 1024, and 1440 px. With the repositioning disabled, the Ukrainian run fails at
  320 px (left edge −2.8 px), as expected. `batch-items.spec.js` now opens Batch Add from the menu.
- `npm run lint`: passed.
- `npm test`: 424 tests, 421 passed, 2 failed. The 2 failures are the known Windows-only guide tests in
  `test/landing.test.js`, which fail identically on a clean `master`.
- `npm run build`: passed.
- `APP_VERSION=0.70.1 E2E_LANDING_PORT=4700 npm run test:e2e`: 300 passed. The local landing port
  was moved off a Windows-reserved range.
- `CAPTURE_PORT=4710 npm run landing:screenshots`: regenerated. Only the screenshots that show the
  Items header were kept.
