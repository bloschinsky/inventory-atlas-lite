# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-20. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **Self-update from About** - Planned. Lets the About dialog check the latest GitHub release
   and initiate the existing safe updater only on supported deployments. See
   [`TASK-SELF-UPDATE-FROM-ABOUT.md`](issues/TASK-SELF-UPDATE-FROM-ABOUT.md).

2. **Restore database backup** — Planned independently of the UI migration. Adds a validated,
   confirmation-protected backup restore workflow with a pre-restore safety backup and rollback
   protections. See [`TASK-restore-database-backup.md`](issues/TASK-restore-database-backup.md).

3. **OpenAI model selector** — Planned. Replaces the free-text AI model setting with a curated
   selector of models available to the configured API key, while retaining a custom-model option.
   See [`TASK-AI-MODEL-SELECTOR.md`](issues/TASK-AI-MODEL-SELECTOR.md).

4. **AI background-removal quality, Phase 1** — Planned. Strengthens the local cutout model and
   mask cleanup to produce cleaner white-background inventory photos with a subtle synthetic shadow.
   Includes a Sound Blaster-on-bubble-wrap regression asset. See
   [`TASK-background-removal-quality-phase-1.md`](issues/TASK-background-removal-quality-phase-1.md).

5. **AI background-removal quality, Phase 2** — Planned; blocked by Phase 1. Adds target-aware
   extraction so the cutout favors the intended inventory item over hands and surrounding clutter.
   Includes a film-boxes-in-hand regression asset. See
   [`TASK-background-removal-quality-phase-2.md`](issues/TASK-background-removal-quality-phase-2.md).

## Distribution

1. **Windows desktop distribution via Electron** — Planned and unblocked by the completed
   [GitHub release pipeline](features/github-release-pipeline.md). Adds Setup and portable Windows
   executables to the same tagged GitHub Release. See
   [`TASK-02-WINDOWS-ELECTRON-RELEASE.md`](issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md).

## Maintenance

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
