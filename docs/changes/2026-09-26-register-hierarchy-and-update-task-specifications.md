# Register hierarchy and update task specifications

**Completion date:** 2026-09-26

**Version:** 0.37.1

## Summary

Added five active task specifications to version control and registered their scope, status, and
dependencies in the roadmap. The planned work covers exact bulk value replacement, a three-phase
storage hierarchy experience, and a one-time What's New modal after application updates.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
