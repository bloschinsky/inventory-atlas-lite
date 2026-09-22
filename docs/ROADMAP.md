# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-22. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **AI background-removal quality, Phase 1** — Planned. Strengthens the local cutout model and
   mask cleanup to produce cleaner white-background inventory photos with a subtle synthetic shadow.
   Includes a Sound Blaster-on-bubble-wrap regression asset. See
   [`TASK-background-removal-quality-phase-1.md`](issues/TASK-background-removal-quality-phase-1.md).

2. **AI background-removal quality, Phase 2** — Planned; blocked by Phase 1. Adds target-aware
   extraction so the cutout favors the intended inventory item over hands and surrounding clutter.
   Includes a film-boxes-in-hand regression asset. See
   [`TASK-background-removal-quality-phase-2.md`](issues/TASK-background-removal-quality-phase-2.md).

3. **AI Add Item from photo or description** — Planned. Extends the existing reviewed draft flow
   to accept a photo, a text description, or both without adding a separate AI item workflow. See
   [`TASK-ai-add-item-photo-or-prompt.md`](issues/TASK-ai-add-item-photo-or-prompt.md).

4. **AI feature visibility** — Planned. Makes the saved **Enable AI Features** setting control all
   AI entry points and direct AI-page navigation while retaining the existing backend guards. See
   [`TASK-ai-feature-visibility.md`](issues/TASK-ai-feature-visibility.md).

5. **Version History in About** — Planned. Adds an offline, bundled release timeline to the About
   experience and a structured source for concise user-facing release changes. See
   [`TASK-version-history-about.md`](issues/TASK-version-history-about.md).

## Distribution

1. **Windows desktop distribution via Electron** — Planned and unblocked by the completed
   [GitHub release pipeline](features/github-release-pipeline.md). Adds Setup and portable Windows
   executables to the same tagged GitHub Release. See
   [`TASK-02-WINDOWS-ELECTRON-RELEASE.md`](issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md).

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
