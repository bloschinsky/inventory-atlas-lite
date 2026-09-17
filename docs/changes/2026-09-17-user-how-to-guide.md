# User how-to guide and its maintenance rule

- **Completed:** 2026-09-17
- **Version:** 0.5.5

## Summary

Added [`docs/HOW-TO.md`](../HOW-TO.md), the canonical quick user guide for a deployed installation. It
covers what the application does, the first setup path from an empty database to the first backup,
the core concepts, and every user-facing workflow: categories, custom fields, items, photos, search
and paging, nesting, custom-field autocomplete, and the SQLite backup. It ends with the practical
`Garage → Box A → lens` example, the backup and data-safety section, the current limitations, and a
short troubleshooting table.

The guide describes the interface as it is today, using the real navigation names (**Items**,
**Categories & Fields**, **Data / Backup**) and the real control labels.

Supporting changes:

- Linked the guide from the root `README.md`, from [`../README.md`](../README.md), and from
  [`../features/README.md`](../features/README.md); the feature index and the guide now point at each
  other with their purposes kept separate.
- Added a **User guide maintenance** section to `AGENTS.md` requiring every user-facing change to
  update the guide, and added the guide to the task-file lifecycle steps.
- Deleted `docs/issues/TASK-user-how-to-and-maintenance-rule.md`, the last open task file.
  `docs/issues/` keeps a `.gitkeep` so the directory stays available for future tasks.
- Extended `test/docs.test.js` to check the relative links in `README.md`, `docs/README.md`,
  `docs/HOW-TO.md`, `docs/proxmox.md`, and `docs/features/README.md`.

The version was incremented because the change adds a product-facing document and a new required
step to the agent workflow.

## Verification

```bash
npm run lint     # pass
npm test         # 17 tests, 16 pass, 1 skip (shellcheck not installed)
npm run build    # pass
npm run test:e2e # 8 passed
```

Every documented workflow was verified against the current sources — the routes and validation in
`server/src/index.js`, the pages under `client/src/pages/`, and the labels used by the passing
Playwright specs. The limits stated in the guide come from the code: 10 photos of 15 MB each,
JPEG/PNG/WebP/GIF, 12 items per page, and search over the item name and description only.

## Note on the application title

The navigation bar reads **Personal Inventory**, not *Inventory Atlas Lite*. The guide uses the
product name from the documentation and describes the navigation entries by their real labels, so no
instruction depends on the title. Renaming the brand is a product decision and was left alone.
