# Register QR task specifications

**Completion date:** 2026-09-22

**Version:** 0.24.1

## Summary

Added three active QR task specifications to version control and registered their scope, status, and
dependencies in the roadmap. The foundation uses the existing stable item UUID for a
deployment-independent QR payload; both the scanner and the A4 label-printing workflow reuse it and
are blocked by the foundation.

## Verification

- Confirmed that each newly tracked `TASK-*.md` specification has a corresponding roadmap entry.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
