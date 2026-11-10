# Roadmap overview

This is a short, human-friendly overview of the feature work planned for Inventory Atlas Lite, last
reconciled on 2026-11-10. It is not a task tracker: the linked
[GitHub Issues](https://github.com/bloschinsky/inventory-atlas-lite/issues) are authoritative for each
task's status, scope, dependencies, and acceptance criteria. When this page and an issue disagree,
the issue wins.

Implemented behavior is documented separately in [`features/README.md`](features/README.md).

## Product features

1. **AI background removal, Phase 2** — Planned; Phase 1 is complete. Target-aware local extraction
   that keeps the intended item and drops hands and clutter, using a validated localization hint from
   the configured AI analysis and measured against fixed regression photos such as
   `test/fixtures/svema-ds-4-film-boxes-in-hand.jpg`. Independent of the desktop work. See
   [#87](https://github.com/bloschinsky/inventory-atlas-lite/issues/87).

2. **Five additional UI languages** — Planned; the English/Ukrainian localization foundation is
   complete. Adds Polish, German, Spanish, French, and Brazilian Portuguese to the interface.
   Independent. See [#84](https://github.com/bloschinsky/inventory-atlas-lite/issues/84).

3. **Hierarchy, Phase 3: Drag & Drop** — Planned; the read-only Tree, Graph, and Location/Category
   grouping are complete. Safe Location-aware moves that respect the Specific location, the item
   lifecycle, and the activity history, with server-side cycle protection staying authoritative.
   Independent. See [#83](https://github.com/bloschinsky/inventory-atlas-lite/issues/83).

## Data management

1. **Multiple database profiles** — Planned; database metadata is complete. Managed SQLite profiles
   with exactly one active database per running instance, while the instance-wide `auth.sqlite`
   accounts, sessions, and tokens stay shared. Independent. See
   [#86](https://github.com/bloschinsky/inventory-atlas-lite/issues/86).

## Distribution

1. **Windows Electron desktop distribution** — Planned; the GitHub release pipeline is complete.
   Setup and portable Windows builds of a secure local runtime in the same tagged release. Blocks the
   two items below. See [#81](https://github.com/bloschinsky/inventory-atlas-lite/issues/81).

2. **macOS and Linux Electron distribution** — Planned; depends on #81. Extends the same desktop
   runtime and release matrix to macOS and Linux. See
   [#82](https://github.com/bloschinsky/inventory-atlas-lite/issues/82).

3. **Secure LAN access for the desktop build** — Planned; depends on #81. Opt-in local network hosting
   that reuses the existing accounts, roles, sessions, and CSRF protection rather than a separate
   pairing system. See [#85](https://github.com/bloschinsky/inventory-atlas-lite/issues/85).

## Keeping this page current

Change this page only when a planned feature is added, finished, dropped, reprioritized, or changes
its dependencies — in the same change that opens, closes, or reshapes the issue. Keep each entry to a
name, a one-line summary, its dependencies, and the issue link; never copy checklists or acceptance
criteria here. When an issue is closed as completed, remove its entry: the implemented behavior lives
in [`features/`](features/README.md). Statuses here may lag behind GitHub between such changes.
