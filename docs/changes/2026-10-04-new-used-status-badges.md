# New/Used status badges for the New flag

- **Completed:** 2026-10-04
- **Version:** 0.50.0 (prepared as 0.49.1, released together with item photo ordering; see `2026-10-04-release-0.50.0.md`)

## Summary

Implemented GitHub issue #7, *TASK: Visualize Item New/Used State with Status Badges*. The core New
boolean is now presented as a semantic status badge in read-only item views instead of Yes/No:
`true` is a green **New** badge and `false` an amber **Used** badge.

- **Component:** the new `client/src/components/ItemNewStatusBadge.vue` (`:is-new` prop) is the only
  owner of the mapping. It renders a Tabler `badge` with `bg-success-subtle text-success-emphasis`
  or `bg-warning-subtle text-warning-emphasis`. These pairs follow the color mode through
  `light-dark()` and keep a contrast of at least 4.5:1, which the bright `bg-green-lt`/`bg-yellow-lt`
  text colors do not reach. Red is never used, and the visible word always carries the meaning.
- **Views:** Item details (under the existing **New** label), the Items table **New** column, and the
  phone cards when that column is visible (without a label, like Category). `itemColumns.js` returns
  the same New/Used words as the column text, so the card emptiness check stays consistent.
- **Unchanged:** the Add/Edit Item switch, the template tri-state select, Batch Add, AI drafts, the
  API, the schema, and server-side sorting by `i.is_new`.
- **i18n:** `items.newStatus.new`/`used` in English (New, Used) and Ukrainian (Новий, Вживаний,
  matching the existing masculine `items.fields.isNew`).
- **Documentation:** updated `docs/features/item-new-flag.md`, its index entry, `docs/HOW-TO.md`,
  `AGENTS.md`, and the 0.50.0 release-history entry. The task was tracked as a GitHub issue, so there
  was no `docs/issues/` file to remove.

## Verification

- `npm run lint` — passed.
- `npm test` — 247 tests: 246 passed, 1 skipped (shellcheck is not installed locally); includes
  English/Ukrainian locale parity.
- `npm run build` — passed.
- `npm run test:e2e` (with `APP_VERSION=0.49.1`, because the version is otherwise read from the
  latest Git tag) — 125 passed. The new `test/e2e/item-new-status.spec.js` covers the New and Used
  badges and their styles in the Items table, boolean sorting of the New column in both directions,
  Item details, the unchanged form switch, the phone cards, the Ukrainian labels, and the text
  contrast in light and dark mode. The existing items, columns, templates, duplicate, and batch specs
  now expect New/Used instead of Yes/No for the core flag.
