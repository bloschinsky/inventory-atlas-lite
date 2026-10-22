# Faster release checks: the guided tour runs in parallel

- **Completed:** 2026-10-22
- **Version:** 0.69.2

## Summary

- In the v0.69.1 release, `test/e2e/tour.spec.js` took 10.4 of the 16.7 minutes of the browser
  suite. The tour plays at its real presentation pace from `client/src/demo/tourActions.js`:
  - beats of 600 ms and transitions of 900 ms;
  - 1.3 s and 2.6 s views;
  - typing of two characters every 70 ms;
  - 4 s reading times in Auto Play.

  Five tests play all or most chapters, and with `workers: 1` they ran after the rest of the suite.
- The tests that play every chapter again now run under reduced motion (`withoutMotion()` in the spec)
  for Replay/Back/Next, the Ukrainian demo, and the phone. That drops the beats and the typing cadence
  but keeps every scene waiting for its action. The first full play and Auto Play keep the animated
  pace. The visible clearing of a field before a replayed typing is now covered by no test.
- `playwright.config.js` has two projects instead of one `chromium` project. `tour` holds
  `tour.spec.js`, and `app` holds every other spec. The tour spec runs in parallel mode, because each
  test has its own in-browser demo and never touches the shared database.
- `.github/workflows/release.yml`: the `validate` job keeps the version checks, lint, `npm test`, and
  the build. Beside it, the `e2e` matrix job runs `app` with one worker and `tour` with three. Each
  job uploads failure artifacts named after its project. The Docker and Proxmox jobs now need
  `validate` and `e2e`.
- Updated `AGENTS.md` (which spec belongs in which project),
  `docs/features/playwright-e2e-tests.md`, `docs/features/github-release-pipeline.md`, and the
  0.69.2 release-history entry. The application itself is unchanged.

## Verification

- `npx eslint` of the changed files: passed. `npx playwright test --list`: 275 tests in `app`, 16 in
  `tour`, and 291 in total, as before.
- `tour.spec.js` locally:

  | Run | Time |
  |---|---|
  | before | 11.2 min |
  | with reduced motion | 8.2 min |
  | `--project=tour --workers=3` | 4.4 min, including the demo build and the servers |

  All 16 tests passed in every run.
- `APP_VERSION=0.69.2 npm run test:e2e` (both projects, one worker, 23.2 min on a loaded machine):
  288 passed and 3 failed.
  - The failures were two `landing.spec.js` tests and one `settings-navigation.spec.js` test, files
    this change does not touch, in the same run order as before.
  - Run again on their own, both files passed: 33 of 33.
- The release workflow is the final check of the parallel jobs.
