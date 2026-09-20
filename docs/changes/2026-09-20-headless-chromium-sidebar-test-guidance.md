# Document Linux headless Chromium sidebar test guidance

**Completion date:** 2026-09-20

**Version:** 0.13.1

## Summary

Added Playwright guidance to `AGENTS.md` for Linux headless Chromium: after direct navigation to a
desktop page with controls near the left edge, move the pointer out of the folded-hover sidebar
before interacting. This prevents the intentionally expanded sidebar from intercepting an unrelated
form control action.

## Verification

- `npm test` -- passed (18 tests passed; 10 platform-specific tests skipped).
- No application or browser-test behavior changed; the full Playwright suite passed before this
  documentation-only update.
