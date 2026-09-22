# Register additional task specifications

**Completion date:** 2026-09-22

**Version:** 0.20.0

## Summary

Added four active task specifications to version control and registered their scope and status in
the roadmap. The planned work covers photo-or-description AI item drafts, UI visibility controlled
by the saved AI feature toggle, canonical template insertion for Batch Add Fields, and an offline
version history accessible from About.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
