# New item flag

Every item has a core yes/no **New** attribute that records whether it is new (unused) or not. It is
separate from the [Condition grade and Condition Notes](condition-grading.md), which describe the
physical state:

```text
New: [ New ]         New: [ Used ]
Condition: Poor      Condition: Excellent
                     Condition Notes: Minor scratches on body
```

## Behavior

- **Add/Edit Item** shows a **New** switch above Condition. A blank item starts unchecked (`false`).
- **Read-only views** show the flag as a status badge instead of Yes/No: a green **New** badge for
  `true` and an amber **Used** badge for `false`. The words are localized (Ukrainian **Новий** and
  **Вживаний**) and always visible, so color is never the only carrier of meaning.
- **Item details** always show the badge under the **New** label, directly above Condition.
- **Items list**: **New** is a core column in the **Columns** picker (after Condition). It is hidden by
  default, shows the New/Used badge in the table and in the phone cards (without a label there,
  since the badge names itself), and sorts on the server like the other core columns: No before Yes
  ascending (Used before New), with the item id keeping equal values in a stable order across pages.
- **Duplicate** copies the source item's New value together with the other base values.
- **Templates** may set a New default: **Not set**, **No**, or **Yes**. Not set leaves items created from
  the template at the normal default (`false`). Existing templates have no New default.
- **Batch Add Items from JSON** accepts an optional boolean `new` per item. Omitted means `false`; any
  other value (`"yes"`, `1`, `null`, …) is refused with the same error in the preview and the API.
  The generated template includes `"new": false`, and every preview card has a New switch.
- **AI Add Item** may return `is_new`, but only an explicit `true` makes the draft new. The model is
  told to set it only when the user says the item is new or unused, or readable labeling or context
  states it, and never because of a box, clean packaging, a pristine look, or no visible wear.

Condition is never parsed to set the flag: old free-text values such as `New`, `Like new`, or
`Used once` stay exactly as they were (since schema version 7 as Condition Notes), and no lifecycle
state is inferred from them. The flag never sets a grade either.

## Implementation

- **Storage:** schema version 6 adds `items.is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1))`
  and the nullable `item_templates.is_new INTEGER CHECK (is_new IN (0, 1))`. `applySchema()` creates
  them for new databases and adds them in place to existing databases and to older backups on their
  staged restore copy, so every existing item reads as `false` and every existing template as unset.
  Both columns are part of `CURRENT_SCHEMA`, which restore validation checks.
- **API:** item requests and responses carry `is_new` as a JSON boolean. `validateIsNew()` in
  `shared/itemValidation.js` accepts only `true` or `false`, treats an omitted or `null` value as
  `false`, and refuses anything else with `INVALID_IS_NEW`; templates use `validateTemplateIsNew()`,
  which keeps `null` as unset. Item create, update, batch create, and the template item draft all go
  through these rules; the repositories store `0`/`1` (or `NULL` for a template) and the services
  return booleans.
- **List:** `isNew` is a `boolean` core column in `shared/itemColumns.js` and sorts by `i.is_new` in
  the server whitelist of `ItemRepository`; the list query returns `is_new` for every row.
- **Batch import:** `shared/itemImport.js` reads the `new` property structurally
  (`IMPORT_ITEM_BOOLEAN_EXPECTED`) and sends it as `is_new`. The document stays version 1: the
  property is optional, so earlier documents remain valid.
- **AI:** `aiItemAnalysisService.js` adds a required boolean `is_new` to the structured output schema and
  the conservative rule to the instructions; normalization reads a missing or `null` flag as `false`
  and rejects any non-boolean as `AI_INVALID_RESPONSE`.
- **Client:** `itemDraft.js` carries `is_new` in every draft (blank, edited item, AI, template,
  duplicate); `ItemDraftFields.vue` renders the item switch or the template tri-state select.
  `ItemNewStatusBadge.vue` is the only owner of the read-only mapping: it takes `is-new` and renders a
  Tabler `badge` with `bg-success-subtle text-success-emphasis` (New) or
  `bg-warning-subtle text-warning-emphasis` (Used). These Bootstrap subtle/emphasis pairs resolve
  through `light-dark()`, so both modes keep a contrast of at least 4.5:1. Item details and
  `ItemResults.vue` (table cell and card line) use it; the cell text in `itemColumns.js` returns the
  same New/Used words so the card emptiness check stays consistent. The badge is presentation only:
  forms, templates, the API, and sorting still work with the boolean.

## Verification

- `test/item-new-flag.test.js`: fresh schema, the version 5 → 6 migration (every item `false`, Condition
  untouched, templates unset, idempotent), restore validation of a version 5 backup, create/edit with
  `true`/`false`/omitted, strict refusal of non-booleans, list values and deterministic sorting, the
  column catalog entry, template `NULL`/`false`/`true` defaults and the items created from them, and
  batch `new` acceptance and refusal in both the preview reader and the API.
- `test/ai-providers.test.js`: the schema, input, and instructions offered to the model, and the
  conservative normalization.
- `test/e2e.test.js`: the flag over HTTP in create, details, list, and sort.
- Playwright: `test/e2e/item-new-status.spec.js` covers the New and Used badges and their styles in
  the Items table, boolean sorting of the New column, Item details, the phone cards, the unchanged
  form switch, the Ukrainian labels, and the text contrast in light and dark mode. Other specs cover
  toggling New on create and edit with the badge on Item details, the template default
  flowing into the item form, Duplicate, the Columns picker, and batch preview and refusal.

## Limitations

- New is a single yes/no attribute; **Used** is only its display for `false`. There is no
  Refurbished or other lifecycle state, and no automatic cleanup of old Condition Notes such as `New`.
- Bulk Replace Value and the Dashboard do not use the flag.
