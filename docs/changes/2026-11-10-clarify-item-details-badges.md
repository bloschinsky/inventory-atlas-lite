# Item Details: clear Inventory, New / Used, and Condition labels (#58)

- **Completed:** 2026-11-10
- **Version:** 0.74.2
- **Branch:** `feature/58-clarify-item-details-badges`

## Summary

The Details card of Item details showed three independent attributes as *Status: Active*, *New: Used*,
and *Condition: Excellent*, where *New: Used* read as a contradiction. The change is presentation only:
no schema, API, business logic, or stored data changed, and `is_new` stays a boolean.

- **Labels:** the Details rows are now **Inventory** (lifecycle), **New / Used**, **Condition**, and
  **Condition Notes** (only when filled in, line breaks kept), in that order. Ukrainian: **Інвентар**,
  **Новий / Вживаний**, **Стан**, **Нотатки про стан**. The new keys are `itemDetails.inventory` and
  `itemDetails.newOrUsed`; `lifecycle.fields.status`, whose only use was this row, was removed. The
  forms keep the **New** switch, and the Items list keeps its **New** column.
- **Badges:** `ItemNewStatusBadge.vue` renders **Used** as a neutral gray
  `bg-secondary-subtle text-secondary-emphasis` badge instead of the amber warning pair; **New** stays
  the restrained green pair. The badge is shared, so the list, phone cards, and History show the same
  gray Used.
- **Contrast:** measuring the lifecycle badges with their translucent Tabler `-lt` backgrounds blended
  over the card showed **Active** (`bg-blue-lt`) at about 4.2:1 and **Retired**
  (`bg-secondary-lt text-secondary-emphasis`) at 4.27:1 in light mode, below 4.5:1.
  `ItemLifecycleBadge.vue` now uses the opaque pairs `bg-primary-subtle text-primary-emphasis` (blue
  Active) and `bg-secondary-subtle text-secondary-emphasis` (gray Retired, still with its archive icon).
- Docs: `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (Create an item, step 3),
  `docs/features/item-new-flag.md`, and `docs/features/item-lifecycle.md`.

## Verification

- Playwright `test/e2e/item-new-status.spec.js`: new tests for the Details labels and their order, the
  Active / Used / Excellent and New / Not set combinations, the multiline notes and their absence, and
  the stacked labels without horizontal overflow at 390 px; the contrast test now blends translucent
  backgrounds and covers New, Used, Active, and Retired in Ukrainian in light and dark mode. The specs
  that read the renamed rows (`batch-items`, `duplicate-item`, `items`, `lifecycle`, `templates`) were
  updated.
- `npm run lint`: passed. `npm run build`: passed.
- `npm test`: 442 of 445 passed (1 skipped); the 2 failures are the guide tests in
  `test/landing.test.js` that also fail on a clean `master` on Windows, unrelated to this change.
- `APP_VERSION=0.74.2 npm run test:e2e` (with `E2E_*_PORT` overrides for reserved Windows ports):
  316 passed.
- `npm run landing:screenshots` re-captured the landing screenshots that show the Details card and
  the Used badge.
