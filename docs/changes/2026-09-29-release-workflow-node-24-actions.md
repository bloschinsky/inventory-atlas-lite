# Release workflow actions on Node.js 24

- **Completed:** 2026-09-29
- **Version:** 0.44.1 (unchanged; only the CI workflow changed)

## Summary

- The v0.44.1 Release run warned that `actions/checkout@v4` and `actions/setup-node@v4` target the
  deprecated Node.js 20 runtime and were being forced onto Node.js 24.
- `.github/workflows/release.yml` now uses the current major versions, all of which run on Node.js 24:
  `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`,
  `actions/download-artifact@v8`, `docker/setup-buildx-action@v4`, `docker/build-push-action@v7`, and
  `docker/login-action@v4`.
- The breaking changes of these majors were reviewed against the workflow and none applies:
  `setup-node` automatic caching is irrelevant because `cache: npm` is already explicit;
  `download-artifact` v5 changed only downloads by artifact ID (this workflow downloads by name) and
  v8 fails on a digest mismatch, which is the desired behavior for release assets; the removed
  Docker action inputs and environment variables were never used. All require Actions Runner
  2.327.1 or later, which GitHub-hosted runners provide.
- The job runner label stays `ubuntu-latest`; its announced move to Ubuntu 26 on 2026-10-19 is not
  addressed here.

## Verification

- Only the `uses:` version suffixes changed; the workflow structure and every step input are as before.
- The workflow runs only on a pushed `v*` tag, so it is exercised by the next release. No application
  code changed, so `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` were not rerun
  for this change; they passed for 0.44.1 locally and in the v0.44.1 Release run (113 Playwright tests).
