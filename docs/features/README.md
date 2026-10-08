# Implemented features

This directory documents functionality that is implemented and verified in Inventory Atlas Lite. Each
document describes the current behaviour and its boundaries, not the original plan.

| Feature | Summary |
| --- | --- |
| [Database backup and restore](database-backup-and-restore.md) | Download a consistent SQLite snapshot, and restore one with server-side validation, a pre-restore safety backup, and automatic rollback. |
| [Cloud backup to Dropbox and Google Drive](cloud-backup.md) | Connect Dropbox or Google Drive with OAuth and upload the consistent SQLite snapshot on demand or on a server-side daily or weekly schedule, with retention and status. |
| [Inventory database reset](inventory-database-reset.md) | Reset the inventory from the Danger Zone to a fresh current-schema database after an impact review, typed confirmation, a single-use token, and a verified pre-reset backup, with automatic rollback. |
| [Database metadata](database-metadata.md) | Give every SQLite database a persistent UUID, an editable name, creation and last-update timestamps kept by write triggers, and a mirrored schema version, shown under Settings → Database and carried by backups. |
| [Inventory Dashboard](dashboard.md) | Server-calculated inventory totals, photo, placement, and field coverage, recent activity, and category, Condition grade, and effective-location distributions, drawn with Tabler's ApexCharts. |
| [Settings center](settings-center.md) | Settings split into grouped sections — Interface, Database, Cloud Backup, and AI — each with its own `/settings/<section>` address, a Tabler section list on desktops, and a compact section selector on phones. |
| [Application UI](application-ui.md) | The Tabler application shell: a folded desktop sidebar, a mobile offcanvas drawer, light/dark modes, and responsive pages. |
| [API error codes](api-error-codes.md) | Every API error is a stable code with structured parameters that the browser translates, pluralizes, and shows in the active language; unexpected failures never leak details. |
| [Interface localization](interface-localization.md) | English and Ukrainian interface with a browser-local language setting, English fallback, plural rules, and locale-aware dates, numbers, and prices. |
| [Item photo carousel](item-photo-carousel.md) | Browse an item's photos in a Tabler carousel with arrows, indicators, swipe, and drag, and keep a valid slide after a deletion. |
| [Item photo order and cover photo](item-photo-order.md) | Persist the order of an item's photos, choose the cover with Make cover or the move buttons, and show the first ordered photo as the cover everywhere. |
| [Item list columns and sorting](item-list-columns-and-sorting.md) | Choose the Items list columns, including merged same-name custom fields, sort the whole filtered list on the server from the table headers or a compact phone control, and search text custom values. |
| [Item templates](item-templates.md) | Save user-defined presets of default item values, use one to prefill the regular Add Item form, start one from an existing item, and keep templates safe across deleted fields and categories. |
| [Checklists](checklists.md) | Reusable Packing and Verification checklists of existing items; every start is an independent, server-snapshotted run with Pending, Packed/Present, and Missing states saved at once, read-only completed history, Run again, history that survives renamed or deleted items and deleted checklists, container audits of direct or all nested contents, and a Last verified time recorded only for Present items of a completed Verification run. |
| [Duplicate item](duplicate-item.md) | Open the regular Add Item form prefilled from an existing item and save an independent copy without its photos, container, or identity. |
| [Bulk Replace Field Value](bulk-replace-field-value.md) | Replace one exact saved value of Condition Notes, Location, Transferred To, or one text custom field on every matching item after a previewed confirmation, atomically and without partial matches. |
| [Item activity history](item-activity-history.md) | A compact append-only timeline of every item's effective-location moves (including moves with a container, at any depth), container changes, Transferred To changes, and explicit temporary loans with due dates and returns, recorded on the server in the same transaction, paged by an index, and measured at 100,000 and 1,000,000 events. |
| [Nested items](nested-items.md) | Store an item inside another item, browse its direct contents, audit them, and move a selection of items into one container at once while preserving selected subtrees. |
| [Hierarchy (Location and Category, Tree and Graph)](hierarchy.md) | Browse every item as a read-only expandable tree or an interactive left-to-right graph, grouped either by effective location (locations, containers, and per-location uncontained items) or by category (keeping only direct same-category nesting, with the location and container as metadata), and search item and group names with their full path. |
| [Effective location inheritance](effective-location-inheritance.md) | Display a contained item at the location of its outermost container while its own saved location stays editable. |
| [Rename custom fields](rename-custom-fields.md) | Rename a category's custom field in place; its id, type, category, and every saved item and template value stay unchanged, while Items columns, Batch Add, and AI flows use the new name. |
| [Batch Add Fields](batch-add-fields.md) | Paste a field-definition document, review and edit the proposed fields, and create them in one atomic batch. |
| [Batch Add Items from JSON](batch-add-items.md) | Paste or generate a category-scoped item document, review and edit every proposed item, and create them in one atomic batch. |
| [AI Add Fields](ai-add-fields.md) | Describe a category in natural language and review the AI-drafted fields in the batch editor before creating them. |
| [Item QR identity](item-qr-identity.md) | Generate a deployment-independent QR code from an item's UUID locally and open it from a modal on the item page. |
| [QR label printing](qr-label-printing.md) | Select items across pages and print their QR labels on A4 sheets in three fixed layouts, with optional name, description, category, and location. |
| [In-app QR scanner](in-app-qr-scanner.md) | Read an item QR code with the camera or from an image, locally in the browser, and open the matching item. |
| [Custom-field autocomplete](custom-field-autocomplete.md) | Suggest previously saved values for text custom fields; the same control serves Transferred To. |
| [Purchase and serial fields](purchase-and-serial-fields.md) | Record an optional purchase date, structured multi-currency price, and serial number on every item. |
| [New item flag](item-new-flag.md) | Record whether an item is new as a core yes/no attribute, separate from Condition, shown as a New/Used status badge, in the item form, details, list columns, templates, duplicates, batch import, and AI drafts. |
| [Condition grading](condition-grading.md) | A fixed five-level Condition grade (Broken to Excellent, or Not set) with colored badges, rank sorting, a filter, a help dialog, and Dashboard breakdown, plus free-text Condition Notes that keep the old Condition values. |
| [Transferred To field](transferred-to-field.md) | Note who or where an item was lent, given, or sold to, with autocomplete, search, and an informational badge. |
| [AI feature visibility](ai-feature-visibility.md) | Hide every AI action and the AI page while **Enable AI features** is off, without weakening the server-side AI guards. |
| [AI providers](ai-providers.md) | Use OpenAI, OpenRouter, Ollama, LM Studio, or a custom OpenAI-compatible endpoint for every AI feature, with model discovery, a connection test, image-capability checks, and normalized errors. |
| [AI Add Item](ai-add-item.md) | Choose a model of the configured AI provider, create a draft from a photo, a description, or both, optionally remove the photo background locally, and review the editable draft before saving. |
| [Proxmox one-line installer](proxmox-one-line-installer.md) | Create a Debian LXC on Proxmox VE with the application, a systemd service, and an update command. |
| [Self-update from About](self-update.md) | Check for a newer stable GitHub release from the About dialog and, on Proxmox/LXC, run the existing privileged updater from the interface. |
| [About dialog and build metadata](about-dialog.md) | An accessible About modal showing the version, commit, and source date injected at build time. |
| [Version History](version-history.md) | A bundled, offline release timeline opened from About, and the source of the published release notes. |
| [What's New after update](whats-new-after-update.md) | A one-time dialog on the first launch after an update, listing every release since the version this browser last acknowledged from the same bundled history. |
| [Playwright browser tests](playwright-e2e-tests.md) | Chromium end-to-end coverage of the main user workflows. |
| [Public demo](public-demo.md) | The real interface running in the browser on GitHub Pages: an invented inventory in English and Ukrainian (one structure of semantic keys with localized text, chosen by `?lang=` or the saved language and seeded again on a language change) with generated photos, temporary changes, Reset demo, and server-only features explained instead of offered. |
| [Guided tour of the public demo](demo-guided-tour.md) | An optional manual-first presentation in the public demo: eight chapters of scenes on the real pages (Dashboard, Categories, Hierarchy with Graph View, a narrated Add item, Items filter/sort/search, Templates, Checklists, and the real changes) that each wait for a contextual action button, with optional Auto Play and Pause/Resume, an inverse-theme presenter with a compact phone layout, Replay chapter, and idempotent Back/Next, in English and Ukrainian on the inventory of the same language, identifying entities by semantic key. |
| [Public landing page](landing-page.md) | A Vue and Tabler product page in English and Ukrainian (vue-i18n, a language dropdown sharing the application's locale preference, Try Demo in the chosen language) in the bundled Geist typeface with a technical facts rail, a numbered product story, captioned real screenshots of the public demo per language in an in-page viewer, install paths, and the latest release from the release history, built from `landing/` and deployed to GitHub Pages. |
| [Public user guide](public-user-guide.md) | The landing site's second page, `guide/`: `docs/HOW-TO.md` and its structurally checked Ukrainian translation `docs/HOW-TO.uk.md` rendered at build time with markdown-it into numbered sections with stable anchors, a sticky table of contents (an On this page panel on phones), localized screenshots in the viewer, text diagrams, Try this in Demo links in the guide's language, and self-hosted notes for server-only features. |
| [GitHub release pipeline](github-release-pipeline.md) | Validate stable tags and publish the Docker image plus legacy-compatible Proxmox assets. |

These documents describe feature boundaries and implementation. For how a user operates the
application, see the [quick how-to](../HOW-TO.md).

Related documentation:

- [`../HOW-TO.md`](../HOW-TO.md) — quick user guide for the current application, and
  [`../HOW-TO.uk.md`](../HOW-TO.uk.md), its Ukrainian translation; both are published as the
  [public user guide](public-user-guide.md).
- [`../issues/`](../issues/) — active task specifications for work that is not finished yet.
- [`../changes/`](../changes/) — dated records of completed repository changes.
- [`../proxmox.md`](../proxmox.md) — installing and maintaining the application on Proxmox VE.
