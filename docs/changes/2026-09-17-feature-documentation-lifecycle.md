# Feature documentation lifecycle

- **Completed:** 2026-09-17
- **Version:** 0.5.4

## Summary

Separated active work from implemented functionality in the documentation.

- Added `docs/features/` with one permanent document per implemented feature: nested items,
  custom-field autocomplete, the Proxmox one-line installer, and the Playwright browser tests. Each
  document describes the current behavior, its implementation, how it was verified, and its
  limitations.
- Added `docs/features/README.md` as the index of implemented features, linked from the root
  `README.md` and from `docs/README.md`.
- Deleted the five task files whose work is implemented and verified:
  `TASK-nested-items.md`, `TASK-custom-field-autocomplete.md`, `TASK-playwright-e2e-tests.md`,
  `TASK-proxmox-one-line-installer.md`, and `TASK-completed-task-documentation-lifecycle.md`.
  `TASK-user-how-to-and-maintenance-rule.md` stays: `docs/HOW-TO.md` does not exist yet.
- Added a **Task file lifecycle** section to `AGENTS.md` requiring future agents to document a
  completed feature, update the index, and delete the task file in the same commit, and never to
  delete an unfinished or uncertain task.
- Added `test/docs.test.js`, which fails when the feature index contains a broken relative link or
  when a feature document is missing from the index.

The version was incremented because the change alters the required agent workflow.

## Verification

```bash
npm run lint     # pass
npm test         # 17 tests, 16 pass, 1 skip (shellcheck not installed)
npm run build    # pass
npm run test:e2e # 8 passed
```

Each deleted task file was checked against the code before removal: `items.parent_item_id` with its
cycle and delete guards, `GET /api/fields/:id/suggestions` with `FieldAutocomplete.vue`,
`scripts/*.sh` with `deploy/inventory-atlas-lite.service` and `/api/health`, and the Playwright suite
under `test/e2e/`.
