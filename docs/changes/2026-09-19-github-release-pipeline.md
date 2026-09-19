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
- Documented Docker use, official release creation, GitHub Releases, persistent storage, version
  pinning, and the unchanged Proxmox deployment architecture.

## Verification

- `npm run lint` — passed.
- `npm test` — passed: 11 executed tests, including the release contract and the unmodified v0.7.0
  download helper; 11 platform-specific shell tests were skipped because a usable local Bash and
  shellcheck environment was unavailable.
- `npm run build` — passed.
- `npm run test:e2e` — passed: 16 Chromium tests.
- `npx --yes yaml-lint .github/workflows/release.yml` — passed.
- `actionlint 1.7.12 .github/workflows/release.yml` — passed.
- Docker build/smoke was not run locally because the Docker Desktop engine was unavailable. It is a
  mandatory pre-publish workflow step.
- A release was not pushed, and a disposable Proxmox v0.7.0 upgrade was not available in this
  environment. The active task remains in `docs/issues/` until those external acceptance checks are
  recorded; no release behavior is claimed from those pending checks.
