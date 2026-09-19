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
3. package the source archive consumed by the existing Proxmox installer/updater;
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

Docker is an additional supported distribution for Docker hosts. Proxmox retains its existing
unprivileged LXC, Node.js, systemd, and local application build. Local builds are acceptable and
must not be moved to CI or replaced with prebuilt Proxmox runtime packages in this task.

One release provides two installation paths from the same tagged commit. Existing Proxmox
instances must be able to update through their already installed updater without a migration.

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
      ├── Package compatible Proxmox source archive
      │
      └── Create GitHub Release
             │
             ├── inventory-atlas-lite-vX.Y.Z.tar.gz
             └── SHA256SUMS

GHCR
 └── ghcr.io/bloschinsky/inventory-atlas-lite:<version>

Proxmox
 └── unprivileged LXC
      └── Node.js + systemd
           └── source archive -> local npm install/build
```

Docker and Proxmox must use the same release version and tagged source commit. They do not
need to use the same runtime artifact. Preserve the existing Proxmox local build commands.

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

The tag identifies the release. Validate that its version matches the committed package.json
version and the corresponding package-lock.json version fields; fail before publishing if they
differ. package.json remains the project version source of truth under the repository rules.

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

Install Chromium and run npm run test:e2e in CI as part of the required validation gate.

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

Create Docker packaging as an additional supported distribution for Docker hosts. It must not
become a requirement for installing or updating the Proxmox deployment.

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

The published GHCR package must allow anonymous pulls. Document the supported image platforms
and verify the packaged application, including native better-sqlite3, on those platforms.
Run a Docker smoke test before publishing the image: check health/version, create data, and
recreate the container with the same persistent mount to verify records and photos survive.

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

# 6. Preserve Proxmox deployment

Keep the existing Proxmox installer/updater and deployment architecture. Only make changes
needed for release integration and compatibility; do not introduce a runtime migration.

Target runtime:

```text
Proxmox VE host
└── dedicated LXC
    └── Node.js + systemd
        └── Inventory Atlas Lite built locally from the release source archive
```

The installer should continue to provide the current simple UX:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh)"
```

or an equivalent stable command.

The installer must:

1. run from the Proxmox VE host;
2. create a dedicated LXC;
3. retain the existing unprivileged LXC configuration without Docker nesting features;
4. install Node.js using the existing installation flow;
5. create the persistent Inventory Atlas Lite data location;
6. download and verify the compatible source archive, then build locally;
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
OS_VERSION
APP_BRANCH
INSTALLER_REF
```

Do not silently overwrite an existing LXC.

---

# 7. Persistent data

Application data must survive:

- application container recreation;
- Docker image upgrades;
- Proxmox application updates.

For Proxmox, preserve /var/lib/inventory-atlas-lite and its backups directory, the service
account, and /etc/inventory-atlas-lite.env (including an existing customized DATA_DIR or PORT).
Application code remains under /opt/inventory-atlas-lite/app, with previous code kept for rollback.
Do not relocate, initialize over, or delete an existing database as part of release integration.

For Docker users, document a persistent volume or bind mount and set DATA_DIR to its path
inside the container. Ensure the runtime user can write there. Container replacement must reuse
that mount. A healthy empty database is not evidence that existing data was preserved.

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

Keep the existing source-based updater and its local build process. Published assets must work
with the updater already installed on existing instances, without requiring a prior script update.

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
download source archive and verify SHA256SUMS
      ↓
run existing npm ci / npm run build / npm prune in staging
      ↓
create consistent SQLite backup through /api/backup
      ↓
stop systemd service, swap application code, restart service
      ↓
wait for /api/health
      ↓
success
```

Preserve the existing rollback to previous application code on a failed health check. Do not
introduce schema changes for the release pipeline. Verify the resulting version as well as health.

Do not delete user data during rollback.

Keep the existing retention of the last five pre-update backups. Download, checksum, and build
failures must leave the running installation and database untouched.

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

The required source archive, with the exact legacy-compatible name:

```text
inventory-atlas-lite-v0.8.0.tar.gz
```

Package the tagged source with one enclosing directory, compatible with the existing updater's
tar --strip-components=1 extraction. Include package.json, package-lock.json, client/server source,
build configuration, scripts/install.sh, scripts/update.sh, scripts/lib.sh, and the deploy systemd
unit. Use git archive or an equivalent tracked-source packaging step; exclude local databases,
node_modules, secrets, and generated runtime files. Do not publish a prebuilt Proxmox runtime.

Do not rename this archive to a deployment-only bundle or replace it with a standalone installer.
The already installed updater expects this exact name and source layout.

---

# 10. Release assets and checksums

Create SHA-256 checksums for downloadable GitHub Release assets.

Publish:

```text
SHA256SUMS
```

The checksum file must cover the manually downloadable artifacts created by this workflow.

SHA256SUMS must contain the hash and exact filename of the uploaded source archive. The existing
installer/updater must verify it using its current logic. Do not depend on fallback to GitHub's
automatically generated source archive: its bytes may differ from the published asset and its
checksum will not necessarily match. Verify this with the unmodified legacy download helper.

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
docs/HOW-TO.md
docs/features/README.md
```

Document:

- how official releases are created;
- tag format;
- Docker image location;
- how to run the Docker image;
- the two supported paths: Docker image and the existing Proxmox Node.js installation;
- how Proxmox updates work;
- where persistent data lives;
- how to pin a release version;
- how to find downloads on GitHub Releases.

Keep the existing Proxmox Node.js/local-build instructions accurate. Add a permanent feature
document for the implemented pipeline and update affected existing feature documentation.
Do not describe planned release behavior as already implemented.

---

# 15. Backwards compatibility

Existing Inventory Atlas Lite SQLite databases must continue to work.

Do not change the database format just for the release pipeline.

There is no Proxmox runtime migration. Preserve source asset names, archive layout, checksum
compatibility, service configuration, data location, and update commands. Verify upgrading a
real pre-pipeline release (v0.7.0 as the baseline) using its unmodified installed updater and
lib.sh. Updating those scripts in the repository alone does not establish compatibility.

Failure of this legacy upgrade scenario blocks completion; a manual migration workaround is
not a substitute for the required compatibility.

---

# 16. Out of scope

Do **not** implement in this task:

- Docker inside the Proxmox LXC or migration of existing Proxmox instances;
- moving Proxmox local builds to CI or distributing prebuilt Proxmox runtime packages;
- changes to the existing Proxmox npm build process;
- native OCI-to-LXC deployment or replacing the LXC with a VM;
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
- [ ] The Docker image is publicly pullable and passes its persistence/startup smoke test.
- [ ] The Proxmox installer retains Node.js, systemd, and the existing local source build.
- [ ] The source archive name, one-directory layout, and SHA256SUMS work with the unmodified legacy updater.
- [ ] A pre-pipeline v0.7.0 installation updates successfully without migration or prior script replacement.
- [ ] The Proxmox updater can install the latest stable source release.
- [ ] The Proxmox updater can pin/install a specific version.
- [ ] Proxmox records, fields, relationships, and photo bytes survive updates; paths and custom PORT/DATA_DIR remain valid.
- [ ] Failed download/checksum/build leaves the old service running; failed health triggers working code rollback.
- [ ] A pre-update SQLite backup is created.
- [ ] The health check is used before an install/update is reported as successful.
- [ ] A GitHub Release is created automatically for the tag.
- [ ] The GitHub Release contains the required Proxmox download assets.
- [ ] `SHA256SUMS` is generated for downloadable release assets.
- [ ] The GitHub Release documents the corresponding GHCR image/version.
- [ ] Tag/package version mismatches fail before publication; both distributions report the release version.
- [ ] README, guides, and permanent feature documentation explain both installation paths accurately.
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
8. Confirm the LXC builds locally and starts Inventory Atlas Lite under Node.js/systemd without Docker.
9. Add a test inventory item.
10. Release another patch version.
11. Run the Proxmox updater.
12. Confirm the application version changes.
13. Confirm the test item/database remains intact.
14. Confirm the backup is created.
15. Confirm `/api/health` reports a healthy application and the correct release version.

Also verify before completing the task:

1. Install v0.7.0 in a disposable Proxmox LXC using its original scripts. Create categories,
   custom field values, nested items, and photos; record identifiers and photo hashes.
2. Run its unmodified installed updater against the first pipeline release. Check archive/checksum
   compatibility, version, record identifiers, relationships, photo hashes, and backup integrity.
3. Verify explicit --version and latest, including an installation with customized PORT/DATA_DIR.
4. Exercise failed downloads, invalid checksums, and failed builds with controlled fixtures; the
   running service and data must remain intact. Exercise failed startup/health and verify rollback.
5. Reboot the test LXC and verify service startup and persistent data.
6. Separately pull the Docker image anonymously, create an item and photo, then recreate/upgrade
   its container with the same persistent mount. Verify version, records, photo bytes, and backup.

Use isolated test databases and disposable instances. Record actual Proxmox verification results;
CI and browser tests alone do not prove that the legacy deployment/update path works.

---

# Result

After this task the supported server release model should be:

```text
ONE TAG
  │
  ▼
ONE OFFICIAL RELEASE
  │
  ├── GHCR image -> Docker hosts
  └── compatible source archive + SHA256SUMS
        └── Proxmox LXC -> existing local build -> Node.js + systemd
```

GitHub Releases become the central human-facing release/distribution page.

Task 02 can then extend the same release without redesigning the pipeline.
