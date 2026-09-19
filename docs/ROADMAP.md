# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-20. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **AI Add Item** - Planned. Uses a photo and optional user hint to prepare a reviewable item
   draft through a configured AI provider; the user must confirm it in the existing Add Item form.
   See [`TASK-AI-ADD-ITEM.md`](issues/TASK-AI-ADD-ITEM.md).

2. **AI Add Item local background removal** - Blocked by AI Add Item. Adds an optional local
   background-removal step that creates a white-background inventory photo without consuming AI
   provider tokens. See
   [`TASK-AI-ADD-ITEM-BACKGROUND-REMOVAL.md`](issues/TASK-AI-ADD-ITEM-BACKGROUND-REMOVAL.md).

3. **Self-update from About** - Planned. Lets the About dialog check the latest GitHub release
   and initiate the existing safe updater only on supported deployments. See
   [`TASK-SELF-UPDATE-FROM-ABOUT.md`](issues/TASK-SELF-UPDATE-FROM-ABOUT.md).

1. **Restore database backup** — Planned independently of the UI migration. Adds a validated,
   confirmation-protected backup restore workflow with a pre-restore safety backup and rollback
   protections. See [`TASK-restore-database-backup.md`](issues/TASK-restore-database-backup.md).

## Distribution

1. **Windows desktop distribution via Electron** — Planned and unblocked by the completed
   [GitHub release pipeline](features/github-release-pipeline.md). Adds Setup and portable Windows
   executables to the same tagged GitHub Release. See
   [`TASK-02-WINDOWS-ELECTRON-RELEASE.md`](issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md).

## Maintenance

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
