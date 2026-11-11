# Responsive Batch Add Fields review on phones (#93)

- **Completed:** 2026-11-11
- **Version:** 0.74.6
- **Branch:** `bugfix/93-batch-add-fields-mobile-review`

## Summary

On a phone in portrait, the Batch Add Fields / AI Add Fields preview squeezed its four-column table
(Field, Type, Status, Remove) into the screen width, so names and types were cut off, and the footer
wrapped awkwardly.

- `client/src/components/BatchAddFieldsDialog.vue` renders one stacked card per proposed field below
  768 px: a *Proposed field N* heading with the status badge, full-width **Name** and **Type** with
  visible labels, the blocking reason, and a full-width **Remove**. A `matchMedia` query picks the
  cards or the existing table, so only one view is in the DOM. Both views read the same `drafts`
  and `rows` from `reviewFieldDefinitions`; no validation, count, or creation logic was duplicated.
  Card controls are described by their status and reason, and the badge is a polite live region.
- The dialog is full screen below `md` (`modal-fullscreen-md-down`). On phones its footer keeps the
  secondary actions on one row and gives the primary action its own full-width row, with 44 px
  buttons and the bottom safe-area inset. Its inputs use a 16 px font there, so iOS Safari does not
  zoom the page when one is focused (`client/src/style.css`).
- `client/src/pages/Categories.vue` used `row g-4` inside an 8 px container padding, which made the
  page 4 px wider than a touch screen and let mobile browsers scroll it sideways (and widen their
  layout viewport, pushing the dialog footer below the screen). It now uses `row g-3`, which matches
  the padding.
- Two new interface strings: `batchFields.proposed` and `batchFields.name` in English and Ukrainian.
- The user guide (English and Ukrainian) and `docs/features/batch-add-fields.md` and
  `ai-add-fields.md` describe the phone layout.

No backend, schema, or data-contract change.

## Verification

- `test/e2e/batch-fields-mobile.spec.js` (new, 7 tests): 360, 390, and 402 × 874 (iPhone 16 Pro) CSS
  pixel viewports with mobile emulation, every status and reason, a long name, full-width controls,
  no sideways page or body scroll, footer layout and position; a 14-field batch corrected,
  scrolled, and created with nothing saved before the confirmation; an empty batch; AI Add Fields in
  the cards; the 767/768 px switch and a landscape phone keeping the table and the draft.
- The same spec, run locally with a temporary config in Playwright's mobile WebKit
  (`devices['iPhone 15 Pro']`): 7 passed. CI keeps running Chromium only.
- `npx playwright test --project=app batch-fields-mobile.spec.js categories.spec.js` — 12 passed.
- `npm run lint` — clean.
- `npm test` — 442 of 445 passed (one skipped). The two failures are the known Windows-only CRLF
  guide tests in `test/landing.test.js`, which pass on CI.
- `npm run build` — succeeded.
- `APP_VERSION=0.74.6 npm run test:e2e` — 332 passed (Windows, alternate e2e ports), including the
  landing and guide build checks for the updated English and Ukrainian guide.

## Real iPhone Safari smoke test

Run on the device after the release, in portrait and in landscape:

1. Open *Categories & Fields*, select a category, press **Batch Add Fields**, and press
   **Insert Template**, then **Preview**: three cards, nothing cut off, no sideways scroll.
2. Press **Edit JSON**, add a duplicate, an existing name, an unsupported type, and a 60-character
   name; press **Preview** again, and check every status and reason is readable.
3. Tap a **Name** field near the bottom: the keyboard opens, the field stays visible, and the page
   does not zoom. Rename it and change a **Type**; the status and **Create N Fields** update.
4. Remove the blocking cards; **Create N Fields** becomes enabled. Paste a 50-field document and
   scroll to the last card with the footer still reachable.
5. Rotate to landscape: the table returns with the same edits. Rotate back and create the batch.
6. Repeat steps 1, 3, and 5 with **AI Add Fields** when an AI provider is configured.
