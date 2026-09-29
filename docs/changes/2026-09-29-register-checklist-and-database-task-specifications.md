# Register checklist and database task specifications

**Completion date:** 2026-09-29

**Version:** 0.41.0

## Summary

Added five active task specifications to version control and registered their scope, status, and
dependencies in the roadmap. The planned work covers bulk containment moves, reusable checklists and
audits, persistent database metadata, and managed single-active database profiles.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
