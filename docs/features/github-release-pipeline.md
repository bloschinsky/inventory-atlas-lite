# GitHub release pipeline

## Summary

A stable `vMAJOR.MINOR.PATCH` tag is the single trigger for an official Inventory Atlas Lite
release. The tag version must equal the versions committed in `package.json` and both root version
fields in `package-lock.json`. GitHub Releases is the human-facing distribution page for two server
paths built from that tagged commit: a Docker image and the existing Proxmox source deployment.

## Published distributions

The workflow publishes `ghcr.io/bloschinsky/inventory-atlas-lite:<version>` and `latest` for
`linux/amd64`. The OCI metadata identifies the source repository, version, and commit. The runtime
image uses Node.js 22, runs as the non-root `node` user, listens on `PORT` (default `3000`), and keeps
SQLite data in `DATA_DIR` (default `/data`). `/data` must be a named volume or writable bind mount.

The GitHub Release attaches:

- `inventory-atlas-lite-v<version>.tar.gz`, a tracked-source archive with one enclosing directory;
- `SHA256SUMS`, containing the archive's exact SHA-256 hash and filename.

That name and layout are the contract used by the existing Proxmox installer and updater. Proxmox
continues to install dependencies and build the Vue client inside the unprivileged LXC, then runs
Express directly with Node.js and systemd. The pipeline does not ship a prebuilt Proxmox runtime.

## Release gate and job flow

The tag-only `.github/workflows/release.yml` workflow first validates the tag and committed versions,
installs dependencies, runs lint, API and shell tests, builds the client, installs Chromium, and runs
the Playwright suite. A failed browser run retains its traces and screenshots as a seven-day workflow
artifact. Docker publishing and Proxmox asset packaging depend on this validation job; the GitHub
Release depends on both publishing jobs.

Before upload, the Docker job starts the image, checks `/api/health` and its version, creates a
category, custom field, nested item and photo, then fully recreates the container with the same
mounted data directory. It verifies the relationships, field value, exact photo bytes, and SQLite
backup after recreation. Publishing with the repository `GITHUB_TOKEN` and source label links the
package to this public repository so it inherits public visibility. The job then logs out of GHCR
and verifies a pull without registry credentials.

The source job uses `git archive`, generates `SHA256SUMS`, and asserts the enclosing-directory
layout. This excludes ignored working data, dependencies, secrets, and generated output by
construction.

## Creating a release

Update `package.json` and `package-lock.json` to the intended stable version and commit them with the
release changes. Create and push the matching tag, for example:

```bash
git tag v0.8.0
git push origin v0.8.0
```

Normal branch pushes do not run this workflow. Prerelease tags are intentionally rejected in the
MVP, so `latest` always names a stable version.

## Boundaries

- The published image supports `linux/amd64` only.
- The pipeline does not create Electron, Windows, macOS, or mobile packages.
- Publishing requires the repository's standard `GITHUB_TOKEN`; no registry password or personal
  access token is used.
- The application still has no authentication and should remain on a trusted LAN or VPN.

## Verification

Local tests cover version rejection, the workflow dependency and asset contract, Docker runtime
requirements, and version-aware health polling. The workflow itself makes lint, API tests, build,
Playwright, Docker persistence, anonymous GHCR pulling, and archive validation mandatory before it
creates a GitHub Release. A disposable Proxmox validation of the first published pipeline release is
still tracked by the active release task.
