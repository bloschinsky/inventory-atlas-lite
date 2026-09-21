# Implemented features

This directory documents functionality that is implemented and verified in Inventory Atlas Lite. Each
document describes the current behaviour and its boundaries, not the original plan.

| Feature | Summary |
| --- | --- |
| [Database backup and restore](database-backup-and-restore.md) | Download a consistent SQLite snapshot, and restore one with server-side validation, a pre-restore safety backup, and automatic rollback. |
| [Inventory Dashboard](dashboard.md) | Server-calculated inventory totals, documentation and placement metrics, plus category and condition distributions. |
| [Application UI](application-ui.md) | The Tabler application shell: a folded desktop sidebar, a mobile offcanvas drawer, light/dark modes, and responsive pages. |
| [Nested items](nested-items.md) | Store an item inside another item and browse its direct contents. |
| [Batch Add Fields](batch-add-fields.md) | Paste a field-definition document, review and edit the proposed fields, and create them in one atomic batch. |
| [AI Add Fields](ai-add-fields.md) | Describe a category in natural language and review the OpenAI-drafted fields in the batch editor before creating them. |
| [Custom-field autocomplete](custom-field-autocomplete.md) | Suggest previously saved values for text custom fields. |
| [Purchase and serial fields](purchase-and-serial-fields.md) | Record an optional purchase date, structured multi-currency price, and serial number on every item. |
| [AI Add Item](ai-add-item.md) | Choose an available OpenAI model, analyze the original photo, optionally remove its background locally, and review the editable draft before saving. |
| [Proxmox one-line installer](proxmox-one-line-installer.md) | Create a Debian LXC on Proxmox VE with the application, a systemd service, and an update command. |
| [About dialog and build metadata](about-dialog.md) | An accessible About modal showing the version, commit, and source date injected at build time. |
| [Playwright browser tests](playwright-e2e-tests.md) | Chromium end-to-end coverage of the main user workflows. |
| [GitHub release pipeline](github-release-pipeline.md) | Validate stable tags and publish the Docker image plus legacy-compatible Proxmox assets. |

These documents describe feature boundaries and implementation. For how a user operates the
application, see the [quick how-to](../HOW-TO.md).

Related documentation:

- [`../HOW-TO.md`](../HOW-TO.md) — quick user guide for the current application.
- [`../issues/`](../issues/) — active task specifications for work that is not finished yet.
- [`../changes/`](../changes/) — dated records of completed repository changes.
- [`../proxmox.md`](../proxmox.md) — installing and maintaining the application on Proxmox VE.
