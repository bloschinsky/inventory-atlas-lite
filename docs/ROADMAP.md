# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-22. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **AI background-removal quality, Phase 2** — Planned; Phase 1 is complete. Adds target-aware
   extraction so the cutout favors the intended inventory item over hands and surrounding clutter.
   Includes a film-boxes-in-hand regression asset. See
   [`TASK-background-removal-quality-phase-2.md`](issues/TASK-background-removal-quality-phase-2.md).

2. **Item QR identity and code generation** — Planned. Adds a local, deployment-independent QR code
   based on each item's existing UUID, with shared encoding and decoding helpers for later workflows.
   See [`TASK-item-qr-foundation.md`](issues/TASK-item-qr-foundation.md).

3. **Select and print QR labels** — Planned; blocked by Item QR identity and code generation.
   Adds item selection and a multi-page A4 label-printing view that reuses the canonical QR payload.
   See [`TASK-select-and-print-qr-labels.md`](issues/TASK-select-and-print-qr-labels.md).

4. **In-app QR scanner** — Planned; blocked by Item QR identity and code generation. Adds a
   mobile-first scanner with camera and local image fallback that opens the matching inventory item.
   See [`TASK-in-app-qr-scanner.md`](issues/TASK-in-app-qr-scanner.md).

## Distribution

1. **Windows desktop distribution via Electron** — Planned and unblocked by the completed
   [GitHub release pipeline](features/github-release-pipeline.md). Adds Setup and portable Windows
   executables to the same tagged GitHub Release. See
   [`TASK-02-WINDOWS-ELECTRON-RELEASE.md`](issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md).

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
