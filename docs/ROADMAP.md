# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-23. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **AI background-removal quality, Phase 2** — Planned; Phase 1 is complete. Adds target-aware
   extraction so the cutout favors the intended inventory item over hands and surrounding clutter.
   Includes a film-boxes-in-hand regression asset. See
   [`TASK-background-removal-quality-phase-2.md`](issues/TASK-background-removal-quality-phase-2.md).

2. **Batch Add Items from JSON** — Planned. Adds a category-scoped JSON editor, review step, and
   atomic creation of multiple validated item drafts without importing photos or using AI. See
   [`TASK-batch-add-items-from-json.md`](issues/TASK-batch-add-items-from-json.md).

3. **Transferred To common field** — Planned. Adds an optional, searchable common item field with
   autocomplete and informational badges for loaned, gifted, sold, or otherwise transferred items.
   See [`TASK-transferred-to-common-field.md`](issues/TASK-transferred-to-common-field.md).

4. **Multi-LLM and OpenAI-compatible providers** — Planned. Preserves OpenAI support while adding
   reusable provider support for OpenRouter, Ollama, LM Studio, and custom compatible endpoints. See
   [`TASK-multi-llm-openai-compatible-providers.md`](issues/TASK-multi-llm-openai-compatible-providers.md).

## Data management

1. **Cloud backup to Dropbox and Google Drive** — Planned. Adds optional OAuth-connected cloud
   destinations, immediate backups, and scheduled uploads using the existing consistent SQLite
   snapshot process. See
   [`TASK-cloud-backup-dropbox-google-drive.md`](issues/TASK-cloud-backup-dropbox-google-drive.md).

2. **Safe inventory database reset** — Planned. Adds a guarded destructive reset with a verified
   safety backup, impact review, typed confirmation, atomic replacement, and rollback. See
   [`TASK-safe-reset-inventory-database.md`](issues/TASK-safe-reset-inventory-database.md).

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
