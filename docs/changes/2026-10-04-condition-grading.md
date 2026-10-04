# Structured Condition grading, Condition Notes, and help dialog

- **Completed:** 2026-10-04
- **Version:** 0.51.0

## Summary

Implemented GitHub issue #8, *TASK: Add Structured Condition Grading, Condition Notes, and Help Modal*.
The free-text Condition became two separate values: a structured **Condition** grade on one fixed
scale (Broken, Poor, Fair, Good, Excellent, or Not set) and free-text **Condition Notes**. Both stay
independent of the New flag.

- **Schema version 7:** `items` and `item_templates` rename `condition` to `condition_notes` and gain a
  nullable `condition_grade` with a `CHECK` on the five keys. **Existing Condition text is preserved as
  Condition Notes. No grade is guessed during migration.** Empty and `NULL` values stay as they were;
  older backups are migrated on their staged restore copy. `CORE_SCHEMA` no longer lists `condition`,
  so backups from before and after the rename are both recognized.
- **Shared rules:** `shared/conditionGrades.js` holds the keys in rank order;
  `validateConditionGrade()` accepts a key or unset and refuses anything else with the new
  `INVALID_CONDITION_GRADE` code.
- **API:** items and templates carry `condition_grade` and `condition_notes` in requests, responses,
  the template item draft, and the list. `GET /api/items` gains `condition=<key>|unset`. Condition
  sorts by rank with Not set last; the new `conditionNotes` core column sorts as text.
- **Badges:** `ConditionGradeBadge.vue` with a tint of the grade's Tabler color and text mixed toward
  the body color, so every label keeps a contrast of at least 4.5:1 in both color modes.
- **Items page:** Condition badges in the table and the phone cards, a Condition filter, and a
  Condition Notes column hidden by default.
- **Item form and template editor:** a Condition select with the chosen badge beside it, an info
  button that opens the new **Condition grading** dialog (About dialog pattern: Escape, backdrop,
  focus trap and return, scrollable body), and a Condition Notes text area.
- **Item details:** the badge, and Condition Notes as its own line when present; container contents
  show each child's badge.
- **Dashboard:** the Condition breakdown counts grades only, in the fixed order Excellent → Broken
  then Not set, with the badge colors; the old case-insensitive free-text grouping was removed. Field
  coverage counts items with a grade.
- **Batch Add Items from JSON:** `conditionGrade` and `conditionNotes`, with the legacy `condition`
  still accepted as notes; using both note properties is refused with the new
  `IMPORT_ITEM_CONDITION_CONFLICT`. The document stays version 1, as when `new` was added.
- **AI Add Item:** `condition_grade` with an enum of the keys plus `null`, and `condition_notes`;
  the model is told to leave the grade unset unless the evidence clearly supports one, and any other
  value is dropped.
- **Bulk Replace Value:** offers Condition Notes instead of the old Condition; the grade is never a
  text target.
- **i18n:** the `condition.*` keys (grades, Not set, help title, button, definitions, hint, filter),
  `items.fields.conditionNotes`, the notes placeholder, and the two error codes in English and
  Ukrainian; the unused `dashboard.notSpecified` and `itemForm.conditionPlaceholder` were removed.
- **Documentation:** new `docs/features/condition-grading.md` and its index entry; updated
  `item-new-flag.md`, `dashboard.md`, `batch-add-items.md`, `item-templates.md`, `duplicate-item.md`,
  `bulk-replace-field-value.md`, `item-list-columns-and-sorting.md`,
  `database-backup-and-restore.md`, and smaller mentions in other feature documents,
  `docs/HOW-TO.md`, `AGENTS.md`, and the 0.51.0 release-history entry. The task was tracked as a
  GitHub issue, so there was no `docs/issues/` file to remove.

## Verification

- `npm run lint` — passed.
- `npm test` — 257 tests: 256 passed, 1 skipped (shellcheck is not installed locally). New
  `test/condition-grading.test.js` (9 tests) covers the schema and `CHECK`, the version 6 → 7 migration
  with every old text kept as notes and no grade guessed, restore of a version 6 backup, accepted and
  refused grades, round-trips, New independence, rank sorting, the filter, the column catalog,
  templates, template and duplicate drafts, legacy and new import properties, and the Dashboard. A new
  AI test covers the grade schema and normalization; existing tests were updated for schema version 7
  and the new fields.
- `npm run build` — passed.
- `npm run test:e2e` — 124 Chromium tests passed with `APP_VERSION=0.51.0`. Without it the 7 What's New
  tests fail only because the uncommitted working copy sits on the `v0.49.0` tag, which
  `vite.config.js` prefers over `package.json`. New `test/e2e/condition-grading.spec.js` covers the
  help dialog (content, badges, close button, Escape, backdrop, focus return), badge text contrast in
  light and dark mode, the selector badge,
  table badges and colors for every grade and Not set, rank sorting both ways, the filter, the
  Condition Notes column, details, and the dialog and cards at phone width; the items, templates,
  Duplicate, AI Add Item, Dashboard, columns, and Ukrainian specs were updated.
- Manual: screenshots of the item form, the help dialog (light, dark, phone), the Items table, and
  the Dashboard against an isolated temporary database.
