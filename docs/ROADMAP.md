# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-19. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **Inventory Dashboard** — High priority, unblocked: the Tabler UI migration it depended on is
   implemented and documented in [`features/application-ui.md`](features/application-ui.md). Adds a
   default Dashboard route with server-calculated inventory metrics, category filtering, and compact
   category and condition distributions. See [`TASK-dashboard.md`](issues/TASK-dashboard.md).
2. **Restore database backup** — Planned independently of the UI migration. Adds a validated,
   confirmation-protected backup restore workflow with a pre-restore safety backup and rollback
   protections. See [`TASK-restore-database-backup.md`](issues/TASK-restore-database-backup.md).
3. **Purchase and serial base fields** — Planned independently. Adds optional Purchase Date,
   structured multi-currency Purchase Price, and Serial Number fields to every item, including safe
   schema migration, API and form support, and serial-number search. See
   [`TASK-ADD-PURCHASE-AND-SERIAL-BASE-FIELDS.md`](issues/TASK-ADD-PURCHASE-AND-SERIAL-BASE-FIELDS.md).
4. **About dialog and build metadata** — Planned independently of the release pipeline. Adds an
   accessible About dialog with automatically injected version, build revision, source date,
   developer information, and a repository link. See
   [`TASK-ABOUT-DIALOG-BUILD-METADATA.md`](issues/TASK-ABOUT-DIALOG-BUILD-METADATA.md).

## Distribution

1. **GitHub Release Pipeline MVP** — Planned to be implemented first in the distribution track;
   it has no dependency and blocks the Windows desktop release. A release tag will validate the
   project, publish the canonical Docker image to GHCR, prepare Proxmox assets, and create the
   GitHub Release. See
   [`TASK-01-GITHUB-RELEASE-PIPELINE-MVP.md`](issues/TASK-01-GITHUB-RELEASE-PIPELINE-MVP.md).
2. **Windows desktop distribution via Electron** — Planned for later and blocked until the GitHub
   Release Pipeline MVP is stable. Adds Setup and portable Windows executables to the same tagged
   GitHub Release. See [`TASK-02-WINDOWS-ELECTRON-RELEASE.md`](issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md).

## Maintenance

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
