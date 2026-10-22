# Release workflow test for the parallel browser jobs

- **Completed:** 2026-10-22
- **Version:** 0.69.3

## Summary

- The v0.69.2 Release workflow failed in `npm test` of the `validate` job: 422 passed and 1 failed.
  The faster release checks were tagged but never published. *release workflow gates both
  distributions and preserves the legacy asset contract* in `test/release.test.js` still required
  `needs: validate` for the Docker and Proxmox jobs. In 0.69.2 those jobs need `[validate, e2e]`.
  `npm test` was not run again after the workflow changed, so the mismatch reached the release.
- The test now requires `needs: [validate, e2e]` for both publishing jobs. It also requires the
  `e2e` matrix to run the `app` and `tour` Playwright projects through `npm run test:e2e --
  --project=${{ matrix.project }}`. No application code or workflow changed. 0.69.3 publishes 0.69.2,
  and the `v0.69.2` tag is left as it is.
- The v0.69.2 run already showed the new layout working:

  | Job | Result | Time |
  |---|---|---|
  | `End-to-end (app)` | 275 passed | 10.6 min, with setup |
  | `End-to-end (tour)` | 16 passed | 3.7 min, with setup |
  | `validate` | — | under a minute until its failure |

  The whole release used to take about 20 minutes.

## Verification

- `node --test test/release.test.js`: 5 passed.
- `npm run lint`: passed.
- `npm test`: 423 tests, 420 passed, 1 skipped, and 2 failed. The two failures are the guide
  tests in `test/landing.test.js`, which fail on Windows even on a clean `master` and pass in CI.
