# QR label printing

- **Completed:** 2026-09-22
- **Version:** 0.27.0

## Summary

Added batch selection on **Items** and an A4 QR label print view at `/labels/print`.

- **Items** rows and mobile cards have a **Select <item name>** checkbox, and the table header selects
  or clears the current page. A bar shows the selected count, **Clear selection**, and **Print
  Labels** (disabled at zero). The selection is a reactive `Set` of UUIDs in the new
  `client/src/labelSelection.js`, so it survives paging, filtering, sorting, and item visits.
- Added `client/src/pages/PrintLabels.vue` with the **Large** (8/page), **Standard** (21/page,
  default), and **Compact** (30/page) presets in millimetres, the metadata toggles (QR Code required;
  Item name and Description on; Category and Location off), the A4 preview, the page count, and
  **Print** through `window.print()`. Labels reuse `ItemQrCode.vue`, so each encodes only
  `ial:item:v1:<uuid>`.
- The UUIDs reach the print view through Vue Router history state instead of the URL, which keeps
  large selections below the HTTP header limit on reload.
- Added `POST /api/items/labels`: `ItemService.labels` validates, de-duplicates, and limits the job
  to 500 labels and reports deleted items as `missing`; `ItemRepository.findLabels` loads all labels
  with their effective location in one query. Deleted items are skipped with a visible warning.
- Print CSS in `client/src/style.css`: the named page `labels` is A4 with no margin, each sheet is
  exactly one page, labels never break across pages, and only the sheets print, black on white in
  both colour modes. The desktop sidebar is now `d-print-none` as well.
- **Print Label** in the item's **QR Code** modal opens the same print view with that item.
- Mobile item cards now wrap long metadata such as an unbroken location, which previously made the
  Items page scroll sideways on a phone.
- No schema change and no new dependency.

## Documentation

- Added `docs/features/qr-label-printing.md` and its entry in `docs/features/README.md`.
- Updated `docs/HOW-TO.md`: new *Select items and print QR labels* section, the QR modal and Items
  list steps, the QR concept row, the limitations (removed "no label printing", added the 500-label
  limit and the fixed layouts), and a troubleshooting row for print scaling.
- Updated `docs/features/item-qr-identity.md`, `docs/features/application-ui.md`, and
  `docs/features/playwright-e2e-tests.md`.
- Listed the new client files in `AGENTS.md`.
- Removed the completed `docs/issues/TASK-select-and-print-qr-labels.md` and its `docs/ROADMAP.md`
  entry.
- Added the 0.27.0 entry to `shared/release-history.json`.

## Verification

- `npm run lint` — passed.
- `npm test` — passed (83 tests, 1 pre-existing skip); `test/services.test.js` has a new
  label-service test.
- `npm run build` — passed.
- `npm run test:e2e` — passed, 73 Playwright tests in Chromium. The new
  `test/e2e/print-labels.spec.js` (6 tests) also passed three times in a row with `--repeat-each 3`.
- Printing was verified through Chromium's print output (`page.pdf()`) in the tests; no physical
  printer was used in this environment.
