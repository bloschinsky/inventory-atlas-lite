# Release tags only on master

- Completed: 2026-10-09
- Version: 0.61.0 (unchanged; a development workflow change with no application change)

## Summary

Tag `v0.61.0` was pushed on the feature branch before its pull request was merged, and the release
workflow published it from there. Releases are now cut only from `master`:

- `.github/workflows/release.yml` starts its validation job by refusing a tag whose commit is not an
  ancestor of `origin/master` (`git merge-base --is-ancestor`), before any version check, build, or
  publishing job.
- `AGENTS.md` Versioning: the version bump, the release-history entry, and the completion record stay
  in the task branch, one version is one release published only from `master`, a new version is
  incremented from the highest one on `master` and in the branches of open pull requests, and a
  branch whose version `master` has already reached moves to the next free version before merging.
- `AGENTS.md` Git: never tag a task branch; tag the pull request's merge commit on `master` after the
  merge, or the task commit for work done directly on `master`; push a tag only after its `master`
  commit.
- `docs/features/github-release-pipeline.md` and `README.md` describe the master-only release steps.
- `test/release.test.js` asserts that the validation job checks out the full history and runs the
  `master` check before the version validation.

## Verification

- `node --test test/release.test.js` — passed.
- `npm run lint` — passed.
- `git merge-base --is-ancestor` checked locally: `v0.61.0` (already merged) is on `master`, and a
  commit outside `master` is refused.
- Playwright was not run: no application code changed.
