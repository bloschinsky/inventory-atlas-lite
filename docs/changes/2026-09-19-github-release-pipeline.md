# GitHub release pipeline implementation

- **Completed:** 2026-09-19
- **Resulting version:** 0.8.0

## Summary

- Added a tag-only GitHub Actions release workflow. It rejects non-stable tags and mismatches among
  the tag, `package.json`, and both root version fields in `package-lock.json` before running the
  normal lint, API, build, and Playwright checks.
- Added a non-root `linux/amd64` Docker image with OCI source/version/revision labels, configurable
  `PORT`, and `/data` as the persistent `DATA_DIR`. The workflow publishes the version and `latest`
  tags to GHCR using `GITHUB_TOKEN`.
- Added a required Docker smoke test that checks health and version, creates related inventory data
  and a photo, recreates the container with the same mount, and verifies the field value,
  relationship, exact photo bytes, and backup. The workflow also verifies an anonymous pull.
- Added deterministic source packaging with the legacy-compatible
  `inventory-atlas-lite-v<version>.tar.gz` name, one enclosing directory, and `SHA256SUMS`, followed
  by an automatically generated GitHub Release.
- Made Proxmox install/update health polling verify the expected application version while retaining
  the existing source build, backup, code swap, rollback, service, environment, and data paths.
- Made the documented-branch test support detached tag checkouts by accepting the fetched
  `origin/master` ref, and documented that the workflow commit must reach `master` before the first
  release tag is pushed.
- Made the Vite test proxy connect to the IPv4 loopback explicitly, matching the Express listener on
  Linux runners, and retained Playwright traces and screenshots as workflow artifacts after a
  browser-test failure.
- Removed two browser-test platform assumptions: backup bytes are read through Playwright's download
  stream instead of a browser-managed temporary path, and the pointer is moved outside the folded
  sidebar before its initial dimensions are measured. CI failures now also produce GitHub check
  annotations with the exact assertion message.
- Documented Docker use, official release creation, GitHub Releases, persistent storage, version
  pinning, and the unchanged Proxmox deployment architecture.

## Verification

- `npm run lint` — passed.
- `npm test` — passed: 12 executed tests, including the release contract, detached-checkout branch
  resolution, and the unmodified v0.7.0 download helper; 10 platform-specific shell tests were
  skipped because a usable local Bash and shellcheck environment was unavailable.
- `npm run build` — passed.
- `npm run test:e2e` — passed: 16 Chromium tests.
- `npx --yes yaml-lint .github/workflows/release.yml` — passed.
- `actionlint 1.7.12 .github/workflows/release.yml` — passed.
- Docker build/smoke was not run locally because the Docker Desktop engine was unavailable. It is a
  mandatory pre-publish workflow step.
- A release was not pushed, and a disposable Proxmox v0.7.0 upgrade was not available in this
  environment. The active task remains in `docs/issues/` until those external acceptance checks are
  recorded; no release behavior is claimed from those pending checks.
- The first tag run reached `npm test` but exposed the detached-checkout assumption in the documented
  branch test; the test now accepts either a local branch or the fetched `origin` branch.
- The second tag run passed lint, Node tests, and build, then exposed that the Vite proxy used
  `localhost` while Express listened on IPv4. The proxy now uses `127.0.0.1` consistently with the
  browser suite's base URL.
- The third tag run reached the full browser suite and identified Linux-specific failures in the
  backup download and initial sidebar hover state; both tests now avoid those platform assumptions.
