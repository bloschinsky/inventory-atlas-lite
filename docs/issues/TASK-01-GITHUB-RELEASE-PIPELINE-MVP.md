# Task 01 — GitHub Release Pipeline MVP

## Status
Planned / implement first.

## Depends on
None.

## Blocks
`TASK-02-WINDOWS-ELECTRON-RELEASE.md`

## Goal

Create the first production release pipeline for **Inventory Atlas Lite**.

A Git tag matching the release pattern must become the single trigger for publishing an official version of the project.

Example:

```bash
git tag v0.8.0
git push origin v0.8.0
```

After the tag is pushed, GitHub Actions must automatically:

1. validate the project;
2. build and publish the Docker image;
3. prepare/update the Proxmox distribution flow;
4. create a GitHub Release for the same tag;
5. attach the Proxmox release assets/checksums to that GitHub Release.

**GitHub Releases must become the central distribution page for Inventory Atlas Lite.**

Windows/Electron artifacts are explicitly out of scope for this task and are implemented later in Task 02.

---

# Current state

The project already has:

- Vue 3 frontend;
- Express backend;
- SQLite storage;
- production build/start scripts;
- a Proxmox installer;
- a Proxmox updater;
- release/version handling in the Proxmox installation flow;
- checksum validation for release artifacts.

The current Proxmox deployment installs Node.js directly inside an LXC and downloads a source archive from GitHub Releases.

This task changes the release architecture so that the **Docker image becomes the canonical server runtime artifact**.

The Proxmox installation/update flow must consume the published Docker image instead of maintaining a separate application runtime build.

---

# Target architecture

```text
git tag vX.Y.Z
      │
      ▼
GitHub Actions
      │
      ├── Validate / test / build
      │
      ├── Build Docker image
      │      │
      │      └── Publish to GHCR
      │
      ├── Prepare Proxmox installer assets
      │
      └── Create GitHub Release
             │
             ├── Proxmox installer
             ├── Proxmox support files, if required
             └── SHA256SUMS

GHCR
 └── ghcr.io/bloschinsky/inventory-atlas-lite:<version>

Proxmox
 └── LXC
      └── Docker
           └── same GHCR image
```

There must not be a separate application build specifically for Proxmox.

Docker and Proxmox must execute the same published application image for the same release tag.

---

# 1. Release trigger

Create/update a release workflow under:

```text
.github/workflows/
```

The official release workflow must run only for release tags.

Minimum supported pattern:

```yaml
on:
  push:
    tags:
      - 'v*'
```

Prefer validating the actual tag with semantic-version rules:

```text
vMAJOR.MINOR.PATCH
```

Examples:

```text
v0.8.0
v1.0.0
v2.14.3
```

Prerelease support such as:

```text
v1.0.0-beta.1
```

may be supported if it can be implemented cleanly, but stable releases are the MVP requirement.

Do not trigger a production release from a normal branch push.

---

# 2. Resolve version from Git tag

The tag must be the authoritative version for the release.

For:

```text
v0.8.0
```

derive:

```text
TAG=v0.8.0
VERSION=0.8.0
```

The same version must be used for:

- Docker tags;
- Docker labels;
- application build metadata where applicable;
- Proxmox installer metadata;
- GitHub Release title;
- generated asset names.

Do not require manually editing the version in several independent files before a release.

If the application exposes its version through `/api/health`, About, logs, or another existing version endpoint, make it resolve consistently from the build/release version.

---

# 3. Validation gate

No release must be published if the project does not pass its normal validation.

At minimum run the existing checks that are appropriate for CI, such as:

```bash
npm ci
npm run lint
npm test
npm run build
```

Run the existing Playwright/E2E tests too if they are stable and practical in GitHub Actions.

Recommended flow:

```text
tag
 │
 ▼
validate
 │
 ├── fail -> stop release
 │
 └── pass
      ▼
 build/publish
```

A failed validation must prevent publication of:

- Docker image;
- GitHub Release;
- release assets.

---

# 4. Docker image

Create or update the project Docker packaging so the application can run as the supported server distribution.

The Docker image must contain everything needed to run Inventory Atlas Lite except persistent user data.

The SQLite database must remain outside the disposable application layer through a mounted volume/path.

The container must support the existing runtime configuration, including at least:

```text
PORT
DATA_DIR
```

The final image must be published to GitHub Container Registry:

```text
ghcr.io/bloschinsky/inventory-atlas-lite
```

For a stable tag such as:

```text
v0.8.0
```

publish at least:

```text
ghcr.io/bloschinsky/inventory-atlas-lite:0.8.0
ghcr.io/bloschinsky/inventory-atlas-lite:latest
```

It is acceptable to additionally publish:

```text
ghcr.io/bloschinsky/inventory-atlas-lite:v0.8.0
ghcr.io/bloschinsky/inventory-atlas-lite:0.8
```

but do not create confusing or inconsistent tag aliases.

`latest` must point only to the latest stable release, not a prerelease.

Use GitHub Actions + `GITHUB_TOKEN`/GHCR permissions; do not require a manually maintained registry password when GitHub's native token is sufficient.

---

# 5. Docker image metadata

Add OCI labels where practical.

At minimum include:

```text
org.opencontainers.image.source
org.opencontainers.image.version
org.opencontainers.image.revision
```

The image should be traceable back to:

- repository;
- Git tag;
- commit SHA.

---

# 6. Proxmox deployment migration

Update the existing Proxmox installer/updater so Proxmox uses the canonical Docker image produced by this release pipeline.

Target runtime:

```text
Proxmox VE host
└── dedicated LXC
    └── Docker
        └── Inventory Atlas Lite image from GHCR
```

The installer should continue to provide the current simple UX:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh)"
```

or an equivalent stable command.

The installer must:

1. run from the Proxmox VE host;
2. create a dedicated LXC;
3. configure the minimum LXC features required to run Docker;
4. install Docker inside the LXC;
5. create the persistent Inventory Atlas Lite data location;
6. pull the requested Inventory Atlas Lite image from GHCR;
7. start the application;
8. wait for the existing health endpoint;
9. print the final application URL.

Preserve configurable values where they already exist, including as applicable:

```text
CTID
CT_HOSTNAME
STORAGE
TEMPLATE_STORAGE
BRIDGE
DISK_GB
CORES
RAM_MB
SWAP_MB
IPV4
GATEWAY
PORT
APP_VERSION
```

Do not silently overwrite an existing LXC.

---

# 7. Persistent data

Application data must survive:

- application container recreation;
- Docker image upgrades;
- Proxmox application updates.

Keep a stable host/LXC data path such as the current Inventory Atlas Lite data location.

The actual application container must mount it as `DATA_DIR`.

Updating from:

```text
0.8.0
```

to:

```text
0.8.1
```

must replace the application runtime only, not the SQLite database.

---

# 8. Proxmox updater

Update the existing updater so it works with versioned Docker images.

Expected UX:

```bash
inventory-atlas-lite-update
```

updates to the latest stable version.

Also preserve explicit version pinning:

```bash
inventory-atlas-lite-update --version v0.8.0
```

The updater must approximately perform:

```text
resolve requested release
      ↓
verify release exists
      ↓
create SQLite backup
      ↓
pull target Docker image
      ↓
replace/restart application container
      ↓
wait for /api/health
      ↓
success
```

If the new version fails its health check, restore/restart the previous working image/version where reasonably possible.

Do not delete user data during rollback.

Keep the existing backup-retention behavior unless there is a strong technical reason to change it.

---

# 9. GitHub Release

After all required release jobs succeed, automatically create a GitHub Release for the tag.

Example:

```text
Inventory Atlas Lite v0.8.0
```

Use GitHub-generated release notes if practical.

The GitHub Release page must be the canonical human-facing download/distribution page.

It should clearly expose:

### Docker

```text
ghcr.io/bloschinsky/inventory-atlas-lite:0.8.0
```

### Proxmox

A release asset such as:

```text
inventory-atlas-lite-proxmox-v0.8.0.tar.gz
```

or a standalone installer asset if that produces a cleaner implementation.

The Proxmox release bundle may contain only deployment/support files. It must not contain another duplicate application runtime if the Docker image already provides it.

---

# 10. Release assets and checksums

Create SHA-256 checksums for downloadable GitHub Release assets.

Publish:

```text
SHA256SUMS
```

The checksum file must cover the manually downloadable artifacts created by this workflow.

The Proxmox installer must verify downloaded release assets where applicable.

Docker image integrity should rely on the container registry image digest rather than duplicating the image into a `.tar.gz` release asset.

---

# 11. Job structure

Keep the workflow maintainable.

A suggested structure:

```text
validate
   │
   ├──────────────┐
   ▼              ▼
docker         proxmox-assets
   │              │
   └──────┬───────┘
          ▼
       release
```

The exact YAML/job names may differ.

Avoid one giant shell script when separate GitHub Actions jobs/steps provide clearer responsibility.

---

# 12. Permissions

Use minimum required GitHub Actions permissions.

Expected requirements will likely include:

```yaml
permissions:
  contents: write
  packages: write
```

Use narrower permissions per job where practical.

Do not add long-lived personal access tokens unless GitHub's built-in `GITHUB_TOKEN` cannot perform the required action.

---

# 13. Existing CI

If the repository already has normal branch/PR CI, keep release responsibilities separate from ordinary CI where practical.

Preferred layout:

```text
.github/workflows/ci.yml
.github/workflows/release.yml
```

Normal pushes/PRs:

```text
lint
test
build
```

Release tags:

```text
validation
Docker publish
Proxmox assets
GitHub Release
```

Reuse existing commands instead of duplicating project-specific build logic unnecessarily.

---

# 14. Documentation

Update the relevant documentation.

At minimum review/update:

```text
README.md
docs/proxmox.md
docs/README.md
docs/ROADMAP.md
```

Document:

- how official releases are created;
- tag format;
- Docker image location;
- how to run the Docker image;
- how Proxmox installation works after migration;
- how Proxmox updates work;
- where persistent data lives;
- how to pin a release version;
- how to find downloads on GitHub Releases.

Remove or rewrite obsolete documentation that claims Proxmox installs the application directly under Node.js without Docker.

---

# 15. Backwards compatibility

Existing Inventory Atlas Lite SQLite databases must continue to work.

Do not change the database format just for the release pipeline.

The migration from the current Proxmox runtime to Docker must not introduce intentional data loss.

If existing installed Proxmox instances cannot be automatically migrated safely, document the supported migration procedure rather than implementing a destructive automatic migration.

---

# 16. Out of scope

Do **not** implement in this task:

- Electron;
- Windows `.exe`;
- Windows installer;
- Windows portable build;
- auto-update for Windows;
- macOS desktop packaging;
- Android/iOS packaging;
- code signing;
- Microsoft Store packaging.

Those belong to Task 02 or later tasks.

---

# Acceptance criteria

The task is complete when all of the following are true:

- [ ] Pushing a valid `v*` release tag starts the release workflow.
- [ ] A normal branch push does not create an official release.
- [ ] CI validation runs before publishing.
- [ ] A failing validation stops the release.
- [ ] A versioned Docker image is published to GHCR.
- [ ] Stable releases update the `latest` Docker tag.
- [ ] The Docker image uses persistent external storage for SQLite.
- [ ] The Docker image reports/contains traceable version + commit metadata.
- [ ] The Proxmox installer deploys the published Docker image rather than a separate source runtime.
- [ ] The Proxmox updater can install the latest stable image.
- [ ] The Proxmox updater can pin/install a specific version.
- [ ] Proxmox application data survives updates.
- [ ] A pre-update SQLite backup is created.
- [ ] The health check is used before an install/update is reported as successful.
- [ ] A GitHub Release is created automatically for the tag.
- [ ] The GitHub Release contains the required Proxmox download assets.
- [ ] `SHA256SUMS` is generated for downloadable release assets.
- [ ] The GitHub Release documents the corresponding GHCR image/version.
- [ ] README/Proxmox documentation reflects the new architecture.
- [ ] Existing application functionality and SQLite compatibility are preserved.

---

# Manual verification scenario

Use a test version such as:

```text
v0.x.y
```

and verify:

1. Push the release tag.
2. Confirm validation succeeds.
3. Confirm the Docker image appears in GHCR.
4. Confirm its tag matches the Git tag.
5. Confirm GitHub Release is created automatically.
6. Confirm Proxmox assets are attached.
7. Install a fresh Proxmox instance using the normal one-line installer.
8. Confirm the LXC starts Inventory Atlas Lite using the GHCR image.
9. Add a test inventory item.
10. Release another patch version.
11. Run the Proxmox updater.
12. Confirm the application version changes.
13. Confirm the test item/database remains intact.
14. Confirm the backup is created.
15. Confirm `/api/health` reports a healthy application and the correct release version.

---

# Result

After this task the supported server release model should be:

```text
ONE TAG
  │
  ▼
ONE OFFICIAL SERVER IMAGE
  │
  ├── Docker users
  └── Proxmox installer
        └── deploys the same image
```

GitHub Releases become the central human-facing release/distribution page.

Task 02 can then extend the same release without redesigning the pipeline.
