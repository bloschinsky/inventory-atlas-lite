# Register additional task specifications

**Completion date:** 2026-09-21

**Version:** 0.16.0

## Summary

Added four active task specifications to version control and registered their scope, status, and
dependencies in the roadmap. The planned work covers effective inherited locations, a Tabler photo
carousel, pragmatic backend OOP/SOLID development rules, and a behavior-preserving backend
structural refactor that is blocked by those rules.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
