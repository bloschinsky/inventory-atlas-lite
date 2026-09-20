# Stabilize AI background-removal browser tests

**Completion date:** 2026-09-20

**Version:** 0.13.1

## Summary

Moved the Playwright cursor into the page content after direct navigation to AI Add Item in the
background-removal success and fallback tests. Headless Chromium on Linux can otherwise begin over
the intentionally folded-hover desktop sidebar, leaving it expanded above the checkbox and causing
an unrelated click timeout.

## Verification

- `npm run lint` -- passed.
- `npm test` -- passed.
- `npm run build` -- passed.
- `npm run test:e2e` -- passed (28 Playwright tests in Chromium).
