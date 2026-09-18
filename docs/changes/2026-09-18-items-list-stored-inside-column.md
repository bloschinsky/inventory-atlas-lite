# Stored inside column on the items list

- **Completed:** 2026-09-18
- **Version:** 0.6.1

## Summary

The items list now shows the direct container of each item. `GET /api/items` joins the parent row and
returns `parent_id` and `parent_name` alongside the existing fields, so the list needs no extra
request per row and no schema change.

In `client/src/components/ItemResults.vue` the table gained a `Stored inside` column that links to
the container, and the phone cards gained a `Stored inside` line. Because seven columns are too many
for a narrow desktop window, Location and Stored inside are their own columns from the `xl`
breakpoint (`1200px`); between `lg` and `xl` both values are shown under the item name instead, which
keeps the name from being squeezed into one word per line.

## Verification

- `npm run lint`, `npm test` (16 passed, 1 skipped), `npm run build`, and `npm run test:e2e`
  (12 passed) all pass.
- `test/e2e.test.js` asserts that the list response carries `parent_id` and `parent_name`;
  `test/e2e/nesting.spec.js` now also finds the container link on the contained item's row and
  follows it to the container page.
- The items page was rendered and inspected in Chromium at `1440`, `1200`, `1024`, and `390` pixels
  with nested and top-level items, a long item name, and long location values. No page scrolls
  horizontally.

## Documentation

- Updated `docs/features/nested-items.md`, `docs/features/responsive-ui.md`, and `docs/HOW-TO.md`.
