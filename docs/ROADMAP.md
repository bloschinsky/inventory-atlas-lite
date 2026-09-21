# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-21. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **Self-update from About** - Planned. Lets the About dialog check the latest GitHub release
   and initiate the existing safe updater only on supported deployments. See
   [`TASK-SELF-UPDATE-FROM-ABOUT.md`](issues/TASK-SELF-UPDATE-FROM-ABOUT.md).

2. **Restore database backup** — Planned independently of the UI migration. Adds a validated,
   confirmation-protected backup restore workflow with a pre-restore safety backup and rollback
   protections. See [`TASK-restore-database-backup.md`](issues/TASK-restore-database-backup.md).

3. **Batch Add Fields for Category, Phase 1** — Planned. Adds a reviewed JSON batch editor for
   creating validated custom fields atomically, providing the shared field-definition format for
   future imports and AI suggestions. See
   [`TASK-phase-1-batch-add-fields.md`](issues/TASK-phase-1-batch-add-fields.md).

4. **AI Add Fields Batch, Phase 2** — Planned; blocked by Batch Add Fields for Category, Phase 1.
   Generates field-definition drafts from a natural-language prompt, then sends them through the
   Phase 1 review, validation, and atomic-create flow. See
   [`TASK-phase-2-ai-add-fields-batch.md`](issues/TASK-phase-2-ai-add-fields-batch.md).

5. **AI background-removal quality, Phase 1** — Planned. Strengthens the local cutout model and
   mask cleanup to produce cleaner white-background inventory photos with a subtle synthetic shadow.
   Includes a Sound Blaster-on-bubble-wrap regression asset. See
   [`TASK-background-removal-quality-phase-1.md`](issues/TASK-background-removal-quality-phase-1.md).

6. **AI background-removal quality, Phase 2** — Planned; blocked by Phase 1. Adds target-aware
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
