# Fix the Item History UUID e2e test that stopped the 0.74.3 release (#90)

- **Completed:** 2026-11-10
- **Version:** 0.74.4
- **Branch:** `bugfix/90-item-history-uuid-e2e-scroll`

## Summary

The `v0.74.3` release workflow stopped in **End-to-end (app)**, so nothing was published.
The failing test was `test/e2e/item-history.spec.js` *an item opened by its UUID, as a QR scan does,
keeps that address and its page under the history dialog*, with `scrollY` `0` where it expected a
scrolled page.

The test was at fault, not the application. It created an item with a long description so the item
page would scroll in a 500 px window. It then moved the item with `PUT /api/items/:id` without the
description. `PUT` replaces the item, so the description was cleared and the page became short.
**View full history** then sat at the window's bottom edge, `scrollIntoViewIfNeeded()` did not scroll,
and the check failed on Linux CI. Wider Windows fonts pushed the link below the fold, so it passed
locally. The dialog test before it had the same flaw but passed because its page stayed long enough.

Both tests now send the shared `longDescription` again in their `PUT`, so their pages really scroll.
No application code changed. Version 0.74.4 releases the 0.74.3 Item History dialog with this fix,
and its release-history entry says so.

## Verification

- `npx playwright test --project=app test/e2e/item-history.spec.js` — 11 passed.
- `npm run lint` — clean.
- `npm test` — 442 of 445 passed (one skipped). The two failures are the known Windows-only CRLF
  guide tests in `test/landing.test.js`, which pass on CI.
- `APP_VERSION=0.74.4 npm run test:e2e` — 321 passed (Windows, alternate e2e ports).
