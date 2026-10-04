# Condition grading and Condition Notes

Every item has two separate condition values:

- **Condition** — a structured grade on one fixed five-level scale, used for badges, sorting,
  filtering, and the Dashboard;
- **Condition Notes** — optional free text for the details the grade does not describe, such as
  scratches, defects, wear, missing parts, or battery state.

```text
Condition:       Good
Condition Notes: Small crack near the left hinge. Battery capacity is about 70%.
```

Both are independent of the [New flag](item-new-flag.md): New + Poor, Used + Excellent, and Used +
Broken are all valid, and none of the three values is ever derived from another.

## The scale

| Rank | Stored key | Label | Color |
| ---: | --- | --- | --- |
| 1 | `broken` | Broken | Tabler red |
| 2 | `poor` | Poor | Tabler orange |
| 3 | `fair` | Fair | Tabler yellow |
| 4 | `good` | Good | Tabler blue |
| 5 | `excellent` | Excellent | Tabler green |
| — | `null` | Not set | neutral gray |

Only the stable keys are stored; the labels and the help text are localized in English and Ukrainian.
A badge always shows its label, so color never carries the meaning alone, and Not set never looks like
Broken.

## Behavior

- **Add/Edit Item** and the **template editor** have a **Condition** select (Not set, Excellent, Good,
  Fair, Poor, Broken) with the chosen grade shown as its badge beside it, and an optional **Condition
  Notes** text area. Native options cannot be colored, so the badge is the semantic treatment of the
  closed select; no UI dependency was added.
- An info button beside the **Condition** label (accessible name **Condition grading help**) opens the
  **Condition grading** dialog. It follows the About dialog: Bootstrap modal markup driven by Vue state,
  centered, closed by its × button, the **Close** button, Escape, or the backdrop; the focus moves to
  the dialog, stays inside it, and returns to the info button. Its body scrolls on small screens. It
  lists the five grades best first, each with its real badge and definition, and ends with the hint
  *Use Condition Notes for details that are not described by the grade.*
- **Items table and cards**: the **Condition** column shows the grade badge (Not set in the table; an
  unset grade is left out of the compact phone cards). **Condition Notes** is a separate core column in
  the **Columns** picker, hidden by default. Condition sorts by rank — Broken, Poor, Fair, Good,
  Excellent ascending and the reverse descending — with Not set always last; Condition Notes sorts as
  text.
- **Condition filter** on the Items page: All conditions, one of the five grades, or Not set. It works
  together with the search and the category filter.
- **Item details** show the Condition badge, and Condition Notes as a separate line only when it is not
  empty (line breaks are kept). The Contents list of a container shows each child's badge when it has a
  grade.
- **Dashboard**: the Condition breakdown counts `condition_grade` only, in the fixed order Excellent,
  Good, Fair, Poor, Broken, then Not set, with the same colors as the badges. Grades without items are
  left out. The Condition axis of Field coverage counts items with a grade.
- **Templates and Duplicate** carry the grade and the notes independently.
- **Batch Add Items from JSON** accepts `conditionGrade` and `conditionNotes`; see
  [Batch Add Items](batch-add-items.md).
- **AI Add Item** may propose a grade only from the fixed keys and is told to leave it `null` unless
  the evidence clearly supports one; specific details go to the notes. Any other value is dropped to
  an unset grade.
- **Bulk Replace Value** offers **Condition Notes** for exact text replacement. The structured grade is
  not offered, so arbitrary text can never be written to it.

## Migration

Schema version 7 renames the old free-text `condition` column of `items` and `item_templates` to
`condition_notes` and adds the nullable `condition_grade`. **Existing Condition text is preserved as
Condition Notes. No grade is guessed during migration**: an old value such as `Good` stays the note
`Good`, and every migrated item and template starts with Condition = Not set. Empty and `NULL` values
stay as they were. The same migration runs on older backups on their staged restore copy.

## Implementation

- `shared/conditionGrades.js` is the single list of grade keys in rank order, used by the server,
  the validation, the import, and the client.
- **Storage:** `condition_grade TEXT CHECK (condition_grade IN ('broken', 'poor', 'fair', 'good',
  'excellent'))` and `condition_notes TEXT` on `items` and `item_templates` (`server/src/db.js`). The
  `CHECK` holds for writes that bypass the services and for migrated tables, whose new column is added
  with the same constraint. `CORE_SCHEMA` no longer lists `condition`, so both pre- and
  post-migration backups are recognized; `CURRENT_SCHEMA` requires both new columns.
- **API:** item and template requests and responses carry `condition_grade` and `condition_notes`.
  `validateConditionGrade()` in `shared/itemValidation.js` accepts a grade key, or `null`/omitted/empty
  as unset, and refuses anything else with `INVALID_CONDITION_GRADE`; notes follow the usual trimmed
  nullable text rule. `GET /api/items` accepts `condition=<key>` or `condition=unset`; other values are
  ignored.
- **Sorting:** `ItemRepository` sorts `condition` by a `CASE` rank expression built from the grade list
  and `conditionNotes` by the trimmed text, both through the existing whitelist with empty values last.
- **Dashboard:** `DashboardRepository.countsByConditionGrade()` groups by `condition_grade`;
  `DashboardService` orders the entries and returns `{ key, count }` with `key` a grade or `not-set`.
  The client names each entry through its translation and colors it from the same Tabler variable as
  its badge.
- **Client:** `client/src/conditionGrades.js` maps each key to its label key, badge class
  (`bg-<color>-lt`, `bg-secondary-lt` for Not set), and color variable;
  `ConditionGradeBadge.vue` is the shared badge and `ConditionHelpDialog.vue` the help dialog. The
  help text lives in the `condition.*` translation keys.
- **AI:** `aiItemAnalysisService.js` offers `condition_grade` with an enum of the keys plus `null` and
  `condition_notes` as text, replacing the old `condition` field.

## Verification

- `test/condition-grading.test.js`: fresh schema and `CHECK`, the version 6 → 7 migration (every old
  text kept exactly as notes, no grade guessed, templates included, idempotent), restore of a version 6
  backup, the five grades accepted and other values refused, create/edit round-trip, New independence,
  rank sorting with Not set last, notes sorting, the Condition filter, the column catalog, templates,
  the template and duplicate drafts, legacy and new import properties, the preview error and the API
  refusal of an unsupported grade, the conflict between `condition` and `conditionNotes`, and the
  Dashboard counts.
- `test/ai-providers.test.js`, `test/bulk-replace.test.js`, `test/dashboard.test.js`,
  `test/services.test.js`, `test/e2e.test.js`, and `test/item-new-flag.test.js` cover the AI schema and
  normalization, the notes-only bulk replacement, the Dashboard over HTTP, the API refusal and filter,
  and the unchanged New flag.
- Playwright `test/e2e/condition-grading.spec.js`: the help dialog (content, badges, close button,
  Escape, backdrop, focus return), the selector and its badge, table badges and colors for every grade
  and Not set, rank sorting in both directions, the filter, the Condition Notes column, details, and
  the dialog and cards at phone width. Items, templates, Duplicate, AI Add Item, Dashboard, columns,
  and Ukrainian specs cover the changed flows.

## Limitations

- One universal scale: no category-specific or user-defined scales, half grades, or star ratings.
- No grade is calculated from the notes or from New, and no bulk editing of the grade.
