# Project documentation

The `docs/` directory keeps project planning and implementation history close to the code. All documentation is written in English and committed with the related repository changes.

## Directory structure

### Guides

Markdown files directly in `docs/` are user-facing guides that are too long for the README. The README
keeps a short summary and links to them.

- [`HOW-TO.md`](HOW-TO.md) — the canonical quick user guide: what the application does and how to use it.
  The public [user guide](https://bloschinsky.github.io/inventory-atlas-lite/guide/) on the landing site is
  rendered from it.
- [`HOW-TO.uk.md`](HOW-TO.uk.md) — its Ukrainian translation, kept structurally identical (same
  headings, numbers, tables, and code blocks); the landing build fails on drift. Ukrainian is allowed
  here only, like the other Ukrainian translations listed in `AGENTS.md`.
- [`proxmox.md`](proxmox.md) — installing and maintaining Inventory Atlas Lite on Proxmox VE.
- [`../README.md`](../README.md) — Docker installation and the official release procedure.

### Roadmap

[`ROADMAP.md`](ROADMAP.md) is the concise overview of active planned features and their dependencies.
Its entries link to the authoritative GitHub Issues.

### Planned work: GitHub Issues

Planned work is not kept in this directory. Every task — feature, bug fix, or technical debt — is a
self-contained [GitHub Issue](https://github.com/bloschinsky/inventory-atlas-lite/issues) with its
desired behavior and acceptance criteria. Treat an issue as planning material until its work is
implemented and verified.

An approved idea becomes an issue, the issue is implemented on its own branch and pull request, and
merging the pull request closes it. The result is then written to `features/`, linked from
`features/README.md`, and recorded in `changes/`.

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

Keep each record focused on the final implementation. Detailed plans and unfinished ideas belong in GitHub Issues.
