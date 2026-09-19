# Project documentation

The `docs/` directory keeps project planning and implementation history close to the code. All documentation is written in English and committed with the related repository changes.

## Directory structure

### Guides

Markdown files directly in `docs/` are user-facing guides that are too long for the README. The README
keeps a short summary and links to them.

- [`HOW-TO.md`](HOW-TO.md) — the canonical quick user guide: what the application does and how to use it.
- [`proxmox.md`](proxmox.md) — installing and maintaining Inventory Atlas Lite on Proxmox VE.
- [`../README.md`](../README.md) — Docker installation and the official release procedure.

### Roadmap

[`ROADMAP.md`](ROADMAP.md) is the concise overview of active planned features and their dependencies.
Its entries link to the authoritative task specifications in `issues/`.

### `issues/`

Contains active tasks, feature specifications, and future plans that may be implemented later. Use descriptive filenames with the `TASK-` prefix, for example `TASK-nested-items.md`.

These documents define desired behavior and acceptance criteria. Treat them as planning material until the corresponding work is implemented and verified.

A task file is temporary. Once its work is implemented and verified, its result is written to `features/`, linked from `features/README.md`, and the task file is deleted. Anything still open stays here.

### `features/`

Contains one permanent document per implemented feature, describing what the application actually does today: user-visible behavior, a short implementation overview, how it was verified, and its limitations.

[`features/README.md`](features/README.md) is the index. Every feature document must be listed there.

### `changes/`

Contains records of completed work. After each task that changes repository files, add one Markdown document named `YYYY-MM-DD-short-description.md`.

Each record should contain:

- the completion date;
- the resulting project version;
- a concise summary of the implemented changes;
- the checks or manual verification performed.

Keep each record focused on the final implementation. Detailed plans and unfinished ideas belong in `issues/`.
