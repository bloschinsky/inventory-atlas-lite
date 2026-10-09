# Color custom field

`Color` (`color`) is a fifth custom field type next to Text, Number, Date, and Boolean. Like every
custom field it is optional and belongs to one category; it is not a base item attribute. A value names
a semantic color group and the exact color:

```text
{"key":"brown","hex":"#795548"}    one of the twelve presets
{"key":"custom","hex":"#A08C75"}   any exact color the user chose
```

## The palette

| Order | Key | Label | Canonical HEX |
| ---: | --- | --- | --- |
| 1 | `black` | Black | `#171717` |
| 2 | `white` | White | `#FFFFFF` |
| 3 | `gray` | Gray | `#858585` |
| 4 | `brown` | Brown | `#795548` |
| 5 | `beige` | Beige | `#D8C5A3` |
| 6 | `red` | Red | `#DC3545` |
| 7 | `orange` | Orange | `#F07830` |
| 8 | `yellow` | Yellow | `#F5C542` |
| 9 | `green` | Green | `#2E9958` |
| 10 | `blue` | Blue | `#2878D0` |
| 11 | `purple` | Purple | `#8755BF` |
| 12 | `pink` | Pink | `#E886B2` |
| 13 | `custom` | Custom | any `#RRGGBB` |

The names are semantic groups: a preset's HEX is its representative swatch, not a claim about every
real shade in the group. Only the stable keys are stored; the labels are localized in English and
Ukrainian. A custom color is never moved into a preset, even when its HEX equals one.

## Behavior

- **Categories & Fields**, **Batch Add Fields**, and **AI Add Fields** offer `color` with the other
  types; existing fields and their types are unchanged.
- **Add/Edit Item**, the **template editor**, and the **Batch Add Items** preview use the shared
  `ColorPicker.vue`: a radio group named by the field, twelve round swatches with their names in a
  4-column grid (3 columns below 360 px, at most 28 rem wide), and a **Custom** option. The swatches
  are native radio inputs, so Tab enters the group and the arrow keys move inside it; the focused
  swatch gets a focus ring. The selected option has a primary ring, a checkmark in a contrasting color,
  and a bold name, so the selection never depends on color alone. Every swatch has an outline mixed
  from the body text color, which keeps White visible in light mode and Black in dark mode.
- **Custom** shows the native `<input type="color">`, an editable HEX box (`#RRGGBB`, the `#` may be
  omitted, letters are uppercased), and the custom swatch. Opening Custom alone stores nothing; the
  value is set only once a valid HEX is picked or typed, and an invalid HEX is flagged inline.
- A preview line under the picker reads *Selected: Brown #795548*, or *Not set*. **Clear** unsets the
  field. A new item or template starts unset: no color is ever chosen by default.
- **Item details** show the swatch, the localized name, and the HEX. The **Items** table and phone
  cards show the swatch and the name (a custom color carries its HEX in the tooltip). Raw JSON is
  never shown.
- **Sorting** a Color column (a merged column of same-name Color fields) runs on the server, in the
  palette order above, then Custom; inside a group colors order by HEX, so custom shades stay
  together; unset values are last in both directions, and the item id keeps the order stable across
  pages.
- **Filtering:** when the catalog has a Color column, the Items page shows a color select beside
  Condition, labelled with the field name (or **Color** when there are several Color columns, each in
  its own option group): All colors, one of the twelve groups, Custom (every custom shade), or Not set.
  The filter compares the stored `key`, never the HEX, so a custom shade equal to a preset still counts
  as Custom. Not set lists the items of the categories that have the field but no color in it. The
  filter is applied on the server with the search, category, Condition, and lifecycle filters, the
  total count, and pagination.
- A Color column is not searchable: the free-text search keeps matching text fields only.
- **Templates, Duplicate, Use template, and Start from item** carry the value as is.
- **Batch Add Items from JSON** accepts a color as its `{ "key", "hex" }` object or as that object
  serialized to a JSON string, or `null`; the generated template writes `null`. A contradictory or
  malformed color stays visible in the preview with an inline error and blocks the batch.
- **AI Add Item** tells the model the preset names and asks for a preset when the item's main color
  clearly belongs to one, a `#RRGGBB` only for a clearly established shade, and `null` otherwise. The
  server maps a preset name to its canonical value, keeps a valid HEX as Custom, accepts a valid full
  color value, and drops anything else, so free text or invalid JSON is never stored.
- **Public demo:** the *Travel & Outdoor* category has a Color field with a preset and a custom value.

## Data contract

- Values reuse `item_field_values.value` and `item_template_field_values.value` (`TEXT`); there is no
  new table or column. The stored text is canonical compact JSON with `key` first and an uppercase
  `hex`, and that text is what the API returns in `fields[].value`, `custom_values`, and template
  `field_values`.
- `readColor()` in `shared/colors.js` accepts the object or its JSON text with exactly `key` and `hex`;
  `key` must be a preset key or `custom`, `hex` a six-digit HEX (normalized to uppercase), and a preset
  must carry its own canonical HEX. Anything else — malformed JSON, extra or missing properties, an
  unknown group, a 3-digit or `#`-less HEX in the object, or `{"key":"red","hex":"#000000"}` — is
  refused by `validateFieldValue()` with `INVALID_CUSTOM_FIELD_COLOR` (`params.field`). Empty, `null`,
  or omitted is unset (`NULL`); a template simply has no value then.
- `GET /api/items` accepts `colorField=<Color column key>` with `color=<group key>` or `color=unset`.
  An unknown column, a column of another type, or an unknown group applies no color filter.

## Migration

Schema version 10 widens `custom_fields.type`'s `CHECK` to include `color`. SQLite cannot alter a
`CHECK`, so `applySchema()` rebuilds the table from its own stored definition with only the type
`CHECK` replaced: the columns, their order, and every other constraint stay as they were, every row
keeps its id (so item values, template values, and their links are untouched), and the
`AUTOINCREMENT` counter is carried over, so the id of a deleted field whose template values were kept
is never reused. Foreign keys are switched off around the migration transaction (SQLite only allows
that outside a transaction) and restored afterwards; otherwise dropping the old table would cascade
into the values. The touch triggers are recreated, and the rebuild does not move
`last_updated_at`. A table that never had a type `CHECK` (the oldest databases) already accepts every
type and is not rebuilt. The same migration runs on an older backup's staged restore copy. The fresh
schema and the demo's in-browser database build the `CHECK` from `FIELD_TYPES`.

## Implementation

- `shared/colors.js` — the palette, the Custom key, the sort order, `normalizeHex()`, `readColor()`,
  `encodeColor()`, `presetColor()`, and `customColor()`; the only place the presets are listed.
- `shared/fieldDefinitions.js` adds `color` to `FIELD_TYPES`; `shared/itemValidation.js` validates and
  normalizes colors; `shared/itemImport.js` reads color objects and strings into preview drafts.
- `server/src/schema.js` — `FIELD_TYPE_CHECK` from `FIELD_TYPES` and the version 10 rebuild.
- `server/src/repositories/itemRepository.js` — the `color` sort expression (a two-digit rank from
  `COLOR_KEYS` prefixed to the HEX, over `json_extract()` of valid JSON only) and the color filter
  (`EXISTS` on the stored key, `NOT EXISTS` within the column's categories for Not set);
  `server/src/services/itemService.js` resolves `colorField` against the column catalog.
- `server/src/services/aiItemAnalysisService.js` — the color instruction and `aiColorValue()`.
- Client: `client/src/colors.js` (label keys, reading a stored value, checkmark contrast),
  `ColorPicker.vue`, `ColorValue.vue` (the read-only swatch and name), and the color styles in
  `client/src/style.css`; `ItemDraftFields.vue`, `BatchAddItemsDialog.vue`, `ItemDetails.vue`,
  `ItemResults.vue`, `itemColumns.js`, and `ItemsList.vue` use them. Labels live under `colors.*` and
  `fieldTypes.color`.

## Verification

- `test/color-field.test.js`: the shared rules (all twelve presets, custom shades, normalization,
  contradictory and malformed values, other types unchanged), a fresh database, the version 9 → 10
  rebuild (ids, values, template values of a deleted field, the counter, triggers, metadata, the
  cascade, idempotence), restore of a version 9 backup, item and template CRUD with Clear, batch
  import of objects and strings with inline review and the atomic refusal, the merged column, semantic
  sorting in both directions across pages, the filter by group, Custom, and Not set combined with the
  category, search, count, and pagination, and the HTTP contract.
- `test/ai-providers.test.js`: AI Add Item maps a preset name, keeps a HEX as Custom, accepts a valid
  value, and drops free text, an invalid HEX, a contradictory value, and a boolean.
- `test/demo.test.js` seeds the demo with its Color field; the schema-version and field-type
  assertions of the other suites follow version 10 and the new type.
- Playwright `test/e2e/color-field.spec.js`: creating the field in Categories, presets, arrow-key
  navigation, Custom with an invalid and a valid HEX, Clear, details, the Items column, server-side
  sorting in both directions, the Custom, Not set, and preset filters, a template default used for a
  new item, swatch outlines and the checkmark in light and dark mode, and the phone picker and cards.
