# Implemented features

This directory documents functionality that is implemented and verified in Inventory Atlas Lite. Each
document describes the current behaviour and its boundaries, not the original plan.

| Feature | Summary |
| --- | --- |
| [Database backup and restore](database-backup-and-restore.md) | Download a consistent SQLite snapshot, and restore one with server-side validation, a pre-restore safety backup, and automatic rollback. |
| [Inventory Dashboard](dashboard.md) | Server-calculated inventory totals, documentation and placement metrics, plus category and condition distributions. |
| [Application UI](application-ui.md) | The Tabler application shell: a folded desktop sidebar, a mobile offcanvas drawer, light/dark modes, and responsive pages. |
| [Item photo carousel](item-photo-carousel.md) | Browse an item's photos in a Tabler carousel with arrows, indicators, swipe, and drag, and keep a valid slide after a deletion. |
| [Nested items](nested-items.md) | Store an item inside another item and browse its direct contents. |
| [Effective location inheritance](effective-location-inheritance.md) | Display a contained item at the location of its outermost container while its own saved location stays editable. |
| [Batch Add Fields](batch-add-fields.md) | Paste a field-definition document, review and edit the proposed fields, and create them in one atomic batch. |
| [AI Add Fields](ai-add-fields.md) | Describe a category in natural language and review the OpenAI-drafted fields in the batch editor before creating them. |
| [Item QR identity](item-qr-identity.md) | Generate a deployment-independent QR code from an item's UUID locally and open it from a modal on the item page. |
| [QR label printing](qr-label-printing.md) | Select items across pages and print their QR labels on A4 sheets in three fixed layouts, with optional name, description, category, and location. |
| [In-app QR scanner](in-app-qr-scanner.md) | Read an item QR code with the camera or from an image, locally in the browser, and open the matching item. |
| [Custom-field autocomplete](custom-field-autocomplete.md) | Suggest previously saved values for text custom fields. |
| [Purchase and serial fields](purchase-and-serial-fields.md) | Record an optional purchase date, structured multi-currency price, and serial number on every item. |
| [AI feature visibility](ai-feature-visibility.md) | Hide every AI action and the AI page while **Enable AI features** is off, without weakening the server-side AI guards. |
| [AI Add Item](ai-add-item.md) | Choose an available OpenAI model, create a draft from a photo, a description, or both, optionally remove the photo background locally, and review the editable draft before saving. |
| [Proxmox one-line installer](proxmox-one-line-installer.md) | Create a Debian LXC on Proxmox VE with the application, a systemd service, and an update command. |
| [Self-update from About](self-update.md) | Check for a newer stable GitHub release from the About dialog and, on Proxmox/LXC, run the existing privileged updater from the interface. |
| [About dialog and build metadata](about-dialog.md) | An accessible About modal showing the version, commit, and source date injected at build time. |
| [Version History](version-history.md) | A bundled, offline release timeline opened from About, and the source of the published release notes. |
| [Playwright browser tests](playwright-e2e-tests.md) | Chromium end-to-end coverage of the main user workflows. |
| [GitHub release pipeline](github-release-pipeline.md) | Validate stable tags and publish the Docker image plus legacy-compatible Proxmox assets. |

These documents describe feature boundaries and implementation. For how a user operates the
application, see the [quick how-to](../HOW-TO.md).

Related documentation:

- [`../HOW-TO.md`](../HOW-TO.md) — quick user guide for the current application.
- [`../issues/`](../issues/) — active task specifications for work that is not finished yet.
- [`../changes/`](../changes/) — dated records of completed repository changes.
- [`../proxmox.md`](../proxmox.md) — installing and maintaining the application on Proxmox VE.
