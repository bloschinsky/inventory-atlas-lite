# Roadmap overview

This overview lists the active feature work planned for Inventory Atlas Lite. It is current as of
2026-09-18. Each linked task file is the authoritative specification for scope, acceptance criteria,
and verification.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Planned features

1. **Tabler UI design system migration** — High priority, no dependency. Establishes the Tabler
   application shell, folded desktop navigation, mobile offcanvas navigation, and light/dark modes.
   It is the prerequisite for the Dashboard work. See
   [`TASK-tabler-ui-migration.md`](issues/TASK-tabler-ui-migration.md).
2. **Inventory Dashboard** — High priority, blocked until the Tabler migration is complete. Adds a
   default Dashboard route with server-calculated inventory metrics, category filtering, and compact
   category and condition distributions. See [`TASK-dashboard.md`](issues/TASK-dashboard.md).
3. **Restore database backup** — Planned independently of the UI migration. Adds a validated,
   confirmation-protected backup restore workflow with a pre-restore safety backup and rollback
   protections. See [`TASK-restore-database-backup.md`](issues/TASK-restore-database-backup.md).

## Maintenance

Update this file in the same change whenever an active task file is added, removed, reprioritized, or
materially changed. Remove completed work from this roadmap when its task file moves through the
repository documentation lifecycle.
