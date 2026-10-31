# Responsive Item Details action bar with a More menu

- **Completed:** 2026-10-31
- **Version:** 0.70.2
- **Issue:** #57 (UX — Responsive Item Details Action Bar with More Menu)

## Summary

- The up to nine wrapped buttons at the top of Item details are replaced by
  `client/src/components/ItemActionBar.vue`. It shows labelled buttons with icons: the primary
  **Edit**, **Transfer** (active items without an open loan), **QR Code**, and **More**.
- **More** lists, in order: **Fill from URL** / **Refresh from Source** (URL import capability),
  **Translate with AI** (AI capability), **Duplicate**, **Save as template**, a divider, **Retire item**
  / **Restore to inventory**, a divider, and the red **Delete item** with its existing confirmation.
  Every route and dialog is unchanged. `ItemDetails.vue` still owns the dialogs and the deletion, and
  the bar only emits `transfer`, `qr`, `retire`, `restore`, and `delete`.
- One action list drives both the bar and the menu. Transfer is a bar button from `md` and a menu entry
  below it, so no action appears twice. A lent item is still returned from its **Loan** card. A retired
  item offers only **Restore to inventory**.
- **Phones.** The bar moves under the name as one row of **Edit**, **QR Code**, and **More** that share
  the width. The buttons are at least 44 px tall. Below 360 px their icons are hidden, so the Ukrainian
  labels still fit at 320 px.
- The dropdown behavior of `AddItemMenu.vue` moved into `client/src/useDropdownMenu.js`, now shared by
  both menus: outside press, Escape with focus return, and placement inside the viewport. Choosing a
  menu action that opens a dialog first returns focus to **More**.
- New translation keys `itemDetails.delete`, `itemDetails.more`, and `itemDetails.moreActions` (EN/UK).
  No API or database changes, and no new dependency or sticky bar.
- Updated: the user guide (EN/UK), `docs/features/application-ui.md`, `docs/features/README.md`,
  `docs/features/playwright-e2e-tests.md`, `AGENTS.md`, and the landing `item-details` and
  `item-phone` screenshots (EN/UK).

## Verification

- New `test/e2e/item-actions.spec.js`:
  - the desktop bar and the menu order, the dividers, and the red Delete item;
  - Escape with focus return, keyboard opening, and an outside click;
  - every route, the Retire and Transfer dialogs, and a dismissed delete confirmation;
  - AI and URL import turned off, Refresh from Source, and lent and retired items;
  - one row with 44 px targets and Transfer in More at 320, 375, and 390 px, with taps, the menu inside
    the viewport, and no horizontal scroll;
  - Ukrainian in dark mode at 320 px.
- Existing specs now open **More** first: `duplicate-item`, `i18n`, `item-history`, `items`,
  `lifecycle`, `scan-qr`, `templates`, `translate-item`, and `url-import`. They use the new
  `openItemActions()` helper in `test/e2e/helpers.js`.
- `npm run lint`: passed.
- `npm test`: 424 tests, 421 passed, 2 failed. The 2 failures are the known Windows-only guide tests in
  `test/landing.test.js`, which also fail on a clean `master`.
- `npm run build`: passed.
- `APP_VERSION=0.70.2 E2E_LANDING_PORT=4758 npm run test:e2e`: 306 passed. The local landing port was
  moved off a Windows-reserved range.
- `CAPTURE_PORT=4710 npm run landing:screenshots`: regenerated. Only the screenshots that show the
  item page header were kept.
