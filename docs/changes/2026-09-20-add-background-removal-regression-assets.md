# Add background-removal regression assets

**Completion date:** 2026-09-20

**Version:** 0.13.1

## Summary

Added two source-image regression assets for the planned AI background-removal work. The Phase 1
task now links to a Sound Blaster Audigy LS on bubble wrap for generic cutout cleanup, and the
Phase 2 task links to Svema DS-4 film boxes held in a hand for target-aware foreground selection.
Updated the corresponding roadmap summaries with the added regression coverage.

## Verification

- Inspected both source images and confirmed their task-to-asset mapping.
- Confirmed that each task links to an existing asset in `docs/issues/assets/`.
- Playwright was not run because this documentation-and-test-data change does not alter browser behavior.
