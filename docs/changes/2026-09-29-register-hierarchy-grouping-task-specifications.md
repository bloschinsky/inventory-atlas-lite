# Register hierarchy grouping task specifications

**Completion date:** 2026-09-29

**Version:** 0.43.0

## Summary

Added two active hierarchy task specifications to version control and registered their scope,
status, and dependencies in the roadmap. Location grouping becomes the required shared hierarchy
layer before drag-and-drop editing; Category grouping builds on that layer while remaining a
read-only classification projection.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
