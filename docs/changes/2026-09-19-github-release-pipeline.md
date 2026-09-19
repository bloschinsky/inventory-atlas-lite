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
- Removed browser-test platform assumptions: backup bytes are read through Playwright's download
  stream, its link is activated by keyboard so the sidebar overlay cannot intercept a pointer click,
  and the sidebar test waits for both its labels and width transition to collapse before measuring.
  CI failures now also produce GitHub check annotations with the exact assertion message.
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
- GitHub Actions release run
  [`35441550220`](https://github.com/bloschinsky/inventory-atlas-lite/actions/runs/35441550220)
  completed successfully for tag `v0.8.0` and commit `70199a1` on 2026-09-19.
- [GitHub Release `v0.8.0`](https://github.com/bloschinsky/inventory-atlas-lite/releases/tag/v0.8.0)
  was published with `inventory-atlas-lite-v0.8.0.tar.gz` and `SHA256SUMS`.
- The downloaded archive matched its published SHA-256 checksum, contained 122 entries under the
  single `inventory-atlas-lite-v0.8.0/` directory, and included `package.json` in the expected path.
- An anonymous GHCR request retrieved `ghcr.io/bloschinsky/inventory-atlas-lite:0.8.0` with manifest
  digest `sha256:5a5d83f58482d3120b2a728aec29417dd1eb4afd2927b1158684696c36464204`.
- The operator confirmed that the existing Proxmox installation updated successfully to the new
  published release through the installed updater.
