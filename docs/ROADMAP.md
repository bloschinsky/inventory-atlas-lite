# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-26. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **AI background-removal quality, Phase 2** — Planned; Phase 1 is complete. Adds target-aware
   extraction so the cutout favors the intended inventory item over hands and surrounding clutter.
   Includes a film-boxes-in-hand regression asset. See
   [`TASK-background-removal-quality-phase-2.md`](issues/TASK-background-removal-quality-phase-2.md).

2. **Additional UI languages** — Planned; the English/Ukrainian localization foundation is complete.
   Adds Polish, German, Spanish, French, and Brazilian Portuguese with a central locale registry and
   automated translation-key completeness checks. See
   [`TASK-I18N-ADDITIONAL-LANGUAGES.md`](issues/TASK-I18N-ADDITIONAL-LANGUAGES.md).

3. **Hierarchy, Phase 2: Graph View** — Planned; the Phase 1 storage tree is complete. Adds an
   interactive graph view to the shared hierarchy page without a second containment model. See
   [`TASK-HIERARCHY-PHASE-2-GRAPH-VIEW.md`](issues/TASK-HIERARCHY-PHASE-2-GRAPH-VIEW.md).

4. **Hierarchy, Phase 3: Drag & Drop** — Planned; blocked by Hierarchy, Phase 2. Adds safe
   tree-based containment editing while preserving the existing server-side cycle protection. See
   [`TASK-HIERARCHY-PHASE-3-DRAG-DROP.md`](issues/TASK-HIERARCHY-PHASE-3-DRAG-DROP.md).


## Distribution

1. **Windows desktop distribution via Electron** — Planned and unblocked by the completed
   [GitHub release pipeline](features/github-release-pipeline.md). Adds Setup and portable Windows
   executables to the same tagged GitHub Release. See
   [`TASK-02-WINDOWS-ELECTRON-RELEASE.md`](issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md).

2. **Cross-platform desktop distribution** — Planned; blocked by Windows desktop distribution via
   Electron. Extends the shared Electron runtime and release pipeline to macOS and Linux packages.
   See [`TASK-CROSS-PLATFORM-DESKTOP-DISTRIBUTION.md`](issues/TASK-CROSS-PLATFORM-DESKTOP-DISTRIBUTION.md).

3. **Local Network Access for Windows Electron** — Planned; blocked by Windows desktop distribution
   via Electron. Adds opt-in, pairing-protected LAN access to the same local desktop inventory.
   See [`TASK-LOCAL-NETWORK-ACCESS.md`](issues/TASK-LOCAL-NETWORK-ACCESS.md).

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
