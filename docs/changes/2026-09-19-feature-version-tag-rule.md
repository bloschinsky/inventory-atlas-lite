# Feature version tag rule

- **Completed:** 2026-09-19
- **Resulting version:** 0.9.0 (unchanged)

## Summary

- Updated the repository instructions to require a local `v<version>` Git tag on the completed
  feature commit whenever that feature updates the project version.
- Kept pushing commits and tags as a user-owned action under the existing Git rules.

## Verification

- Reviewed the updated Git instructions for consistency with the existing versioning and release
  workflow conventions.
- Automated tests were not run because this documentation-only change does not affect application
  code or behavior.
- Playwright was not run because there is no user-facing application change.
