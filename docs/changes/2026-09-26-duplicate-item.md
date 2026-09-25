# Duplicate existing item

- **Completed:** 2026-09-26
- **Version:** 0.37.1

## Summary

- The item page has a new **Duplicate** action that opens `/items/new?duplicate=<id>`.
- `ItemForm.vue` gained `?duplicate=` as a fourth draft source next to the edited item, a pending AI
  draft, and `?template=`. It loads the source item and prefills the form through the existing
  `draftFromItem()` and `useItemDraftForm()`; there is no duplicate-only form and no server change.
  The save request is the normal item creation request.
- The container (`parent_item_id`), photos, ID, UUID, timestamps, and contents are never copied; the
  form starts top-level with an empty photo selection. A notice names the source item, and
  `ItemDraftFields.vue` shows a non-blocking hint under a copied, non-empty serial number. A source
  item that cannot be loaded leaves a blank form with the error.
- New English and Ukrainian strings: `itemDetails.duplicate`, `itemForm.duplicateNotice`, and
  `itemForm.duplicateSerialHint`.
- Documentation: new `docs/features/duplicate-item.md` and its index entry; updates to
  `docs/HOW-TO.md`, `docs/features/item-templates.md`, `docs/ROADMAP.md`, `AGENTS.md`, and the release
  history. The completed task file `docs/issues/TASK-DUPLICATE-ITEM.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 146 tests: 145 passed, 1 skipped (shellcheck is not installed locally).
- `npm run build` — passed.
- `npm run test:e2e` — 94 passed, including the new `test/e2e/duplicate-item.spec.js` (prefilled base
  and custom fields, serial hint, no container or photos, nothing created before saving, editing
  before save, a new UUID, an unchanged source item, and independent deletion) and the existing Add
  Item, AI, and template specs.
