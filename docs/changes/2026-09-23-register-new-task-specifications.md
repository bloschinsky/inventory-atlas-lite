# Register new task specifications

**Completion date:** 2026-09-23

**Version:** 0.27.0

## Summary

Added seven active task specifications to version control and registered their scope, status, and
dependencies in the roadmap. The planned work covers batch item creation, a transferred-to field,
multiple AI providers, cloud backup, safe inventory reset, cross-platform desktop packages, and
protected LAN access for the Windows desktop app.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
