# Active task roadmap update

- **Completed:** 2026-09-19
- **Version:** 0.7.0

## Summary

Added four active task specifications for purchase and serial item fields, an About dialog with build
metadata, the GitHub release pipeline, and Windows Electron distribution. Updated the roadmap to
list every active task file and to record the independent product work and the release-pipeline
dependency of the Windows distribution.

## Verification

- Confirmed every active `TASK-*.md` file in `docs/issues/` has a corresponding roadmap entry.
- Ran `git diff --check` to verify the documentation changes contain no whitespace errors.
- Playwright was not run because this change only adds and indexes task documentation; no application
  behavior changed.
