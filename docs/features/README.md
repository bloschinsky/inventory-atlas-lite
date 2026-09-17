# Implemented features

This directory documents functionality that is implemented and verified in Inventory Atlas Lite. Each
document describes the current behaviour and its boundaries, not the original plan.

| Feature | Summary |
| --- | --- |
| [Nested items](nested-items.md) | Store an item inside another item and browse its direct contents. |
| [Custom-field autocomplete](custom-field-autocomplete.md) | Suggest previously saved values for text custom fields. |
| [Proxmox one-line installer](proxmox-one-line-installer.md) | Create a Debian LXC on Proxmox VE with the application, a systemd service, and an update command. |
| [Playwright browser tests](playwright-e2e-tests.md) | Chromium end-to-end coverage of the main user workflows. |

These documents describe feature boundaries and implementation. For how a user operates the
application, see the [quick how-to](../HOW-TO.md).

Related documentation:

- [`../HOW-TO.md`](../HOW-TO.md) — quick user guide for the current application.
- [`../issues/`](../issues/) — active task specifications for work that is not finished yet.
- [`../changes/`](../changes/) — dated records of completed repository changes.
- [`../proxmox.md`](../proxmox.md) — installing and maintaining the application on Proxmox VE.
