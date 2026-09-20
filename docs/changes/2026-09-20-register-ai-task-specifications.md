# Register AI task specifications

**Completion date:** 2026-09-20

**Version:** 0.13.1

## Summary

Added the active task specifications for the OpenAI model selector and the two planned phases of
AI background-removal quality work to version control. Updated the roadmap with concise summaries
and the Phase 2 dependency on Phase 1. Corrected the Phase 2 task's dependency links to its
tracked Phase 1 specification.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
