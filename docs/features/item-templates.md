# Item templates

User-defined, reusable presets for new items. A template stores a category and default values for
the item's base fields and the category's custom fields. Using it opens the regular Add Item form
prefilled; the item is created only when that form is saved. There are no built-in templates.

## Behavior

- **Templates** is a main navigation entry after **Items**. The page lists every template with its
  name, category, default item name, and modification time, ordered by name. A search box filters
  the loaded list by template name, category, or default item name. Each row offers **Use**, **Edit**,
  and **Delete** (after a browser confirmation); **Add template** opens an empty editor.
- The template editor (`/templates/new`, `/templates/:id/edit`) shows **Template name** and then the
  same fields as the item form, through the shared `ItemDraftFields.vue`: **Default item name**,
  **Category**, Condition, Location, Transferred To, Purchase Date, Purchase Price, Serial Number,
  Description, and the custom fields of the chosen category. The template name and the category are
  required; everything else may stay empty, and a Boolean field can stay **Not set**. A notice states
  that the values are defaults for future items, and the serial number carries a hint that unique
  values are usually best left blank. Changing the category loads that category's fields; values of
  the previous category's fields are not sent.
- **Use** links to `/items/new?template=<id>`. The item form loads the template's item draft, shows
  `Prefilled from the template “…”`, and behaves exactly like a blank create: every value can be
  changed, photos can be added, and **Save item** creates the item through the normal item API.
- On **Items**, **Add item** is a split button. The main part opens the blank form as before; the
  menu offers **Blank item**, **From template…**, and **AI Add Item** while AI features are on.
  **From template…** opens a dialog listing the templates, and choosing one opens the same prefilled
  form. The dialog also links to **Manage templates**.
- **Save as template** on the item page opens `/templates/new?fromItem=<id>`: the editor is prefilled
  with the item's category, base fields, and custom field values, and the item name becomes both the
  template name and the default item name. Nothing is saved until **Save template** is pressed, and
  no value is removed automatically. Photos, the container, the UUID, and the QR code are never part
  of a template.

## Independence and schema changes

- An item created from a template is an ordinary item with no reference to the template. Editing or
  deleting the template never changes it.
- Templates are not items: they are stored in their own tables, never appear in **Items**, and are
  not counted by the Dashboard.
- A stored value whose custom field was deleted, or that no longer fits its field, is ignored when
  the template is read. The editor and the prefilled item form then show `Some template fields no
  longer exist and were ignored.` Saving the template again drops the stale values for good.
- Deleting a category sets the category of its templates to empty (`ON DELETE SET NULL`). Such a
  template stays listed with a **Category missing** badge, its **Use** button is disabled, the use
  flow refuses it with `TEMPLATE_CATEGORY_MISSING`, and the editor asks for a category. No other
  category is ever chosen automatically.

## Storage and API

- `item_templates` holds the template name, a nullable `category_id`, the default item name, and the
  same base columns as `items` (description, condition, location, purchase date, purchase price
  amount and currency, serial number, transferred to) plus timestamps.
- `item_template_field_values` holds `(template_id, field_id, value)` rows. `template_id` cascades on
  template deletion; `field_id` deliberately has no foreign key, so the value of a deleted field is
  kept and can be reported as ignored. Empty values are not stored.
- The tables were added in schema version 2. Existing databases and older backups gain them through
  the usual additive `applySchema()` path; backups, restores, and resets include them, and the
  restore summary and reset impact count templates.
- `ItemTemplateRepository` owns the SQL, `ItemTemplateService` the rules, and
  `routes/itemTemplateRoutes.js` the endpoints:

  | Method and path | Result |
  | --- | --- |
  | `GET /api/item-templates` | List with `category_name` (`null` when the category was deleted). |
  | `GET /api/item-templates/:id` | The template with `purchase_price`, `field_values` (usable values only), and `ignored_field_count`. |
  | `GET /api/item-templates/:id/item-draft` | `{ templateName, categoryId, baseFields, dynamicFields, ignoredFieldCount }`, or `409 TEMPLATE_CATEGORY_MISSING`. |
  | `POST /api/item-templates` | Creates a template; `201`. |
  | `PUT /api/item-templates/:id` | Replaces the template and all its stored values. |
  | `DELETE /api/item-templates/:id` | `204`, or `404 TEMPLATE_NOT_FOUND`. |

- A request body uses the item field names plus `name` for the template name and `item_name` for
  the default item name. Validation reuses `shared/itemValidation.js`: `readItemDetails()` for the
  optional base fields and `readFieldValues()` for the custom fields are the same functions the item
  service applies, so templates and items refuse the same values with the same codes.

## Item drafts in the form

`client/src/itemDraft.js` is the one way the item form and the template editor are prefilled. A
draft has the shape `{ categoryId, baseFields, dynamicFields }` that the AI analysis and the
template draft endpoint return; `draftFromItem()` and `draftFromTemplate()` build the same shape
from an item or a template. `useItemDraftForm()` holds the shared form state, loads the categories
and the fields of the chosen category, applies a draft, and returns only the values of the current
category's fields. `ItemForm.vue` resolves its draft from the edited item, a pending AI draft,
`?template=`, or `?duplicate=` (see [Duplicate item](duplicate-item.md)), and `TemplateForm.vue` from the edited template or `?fromItem=`.

## Verification

- `test/services.test.js` covers creating, listing, editing, validating, and deleting templates, the
  item draft, item independence, a deleted custom field, and a deleted category that blocks use until
  the template is repaired.
- `test/e2e.test.js` exercises the HTTP API, persistence across a restart, the backup file contents,
  and the category deletion through the API.
- `test/restore.test.js` and `test/reset.test.js` check that templates are counted, restored, and
  reset with the rest of the database, and that an older backup gains the template tables.
- `test/e2e/templates.spec.js` covers the browser workflows: create, edit, use, and delete a
  template; the Add item menu and template picker; Save as template from an item; the blank form; and
  a template whose category was deleted.

## Out of scope

Template photos, built-in or shared templates, template inheritance or nesting, and creating several
items from one template at once are not implemented.
