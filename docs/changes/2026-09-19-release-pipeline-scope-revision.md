# Release pipeline specification revision

- Completion date: 2026-09-19
- Resulting project version: 0.7.0 (unchanged; planning documentation only)

Revised TASK-01 to publish Docker as an additional distribution while preserving the existing
Proxmox Node.js/systemd runtime and local npm build process. Removed the planned Docker-in-LXC
migration and explicitly excluded prebuilt Proxmox runtime packages and moving local builds to CI.

Specified the legacy-compatible source archive name, extraction layout, checksums, persistent
paths, backup retention, and upgrade verification using the unmodified v0.7.0 updater. Added
separate Docker persistence verification and aligned release version validation with package.json.
Updated the roadmap and the dependent Windows task's example source asset name.

Verification: reviewed the specifications against scripts/lib.sh, scripts/update.sh, the systemd
unit, and README; checked the documentation diff and git diff --check. Playwright was not run:
this change only revises planned work and does not change application or deployment behavior.
The release pipeline task remains planned and its implementation checklist remains open.
