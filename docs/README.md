# Project documentation

The `docs/` directory keeps project planning and implementation history close to the code. All documentation is written in English and committed with the related repository changes.

## Directory structure

### Guides

Markdown files directly in `docs/` are user-facing guides that are too long for the README. The README
keeps a short summary and links to them.

- [`proxmox.md`](proxmox.md) — installing and maintaining Inventory Atlas Lite on Proxmox VE.

### `issues/`

Contains tasks, feature specifications, and future plans that may be implemented later. Use descriptive filenames with the `TASK-` prefix, for example `TASK-nested-items.md`.

These documents define desired behavior and acceptance criteria. Treat them as planning material until the corresponding work is implemented and verified.

### `changes/`

Contains records of completed work. After each task that changes repository files, add one Markdown document named `YYYY-MM-DD-short-description.md`.

Each record should contain:

- the completion date;
- the resulting project version;
- a concise summary of the implemented changes;
- the checks or manual verification performed.

Keep each record focused on the final implementation. Detailed plans and unfinished ideas belong in `issues/`.
