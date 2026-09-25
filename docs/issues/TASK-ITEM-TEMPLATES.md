# TASK: User-Defined Item Templates

## Goal

Add user-created Item Templates to Inventory Atlas Lite.

Templates are reusable presets for creating new inventory items.

They must not be hardcoded into the application.

Examples:

- Nova Poshta cardboard box 5 kg
- Plastic storage box
- Seagate IronWolf 4 TB
- Frequently cataloged camera model
- Standard archive container

A template should prefill the normal Add Item form and allow the user to review/change values before saving the actual item.

---

## Core Principle

A template is NOT an inventory item.

Do not implement templates as:

```text
items.is_template
```

Use dedicated template persistence.

Templates must not:

- appear in Items
- count toward inventory/dashboard totals
- have QR codes
- participate in parent/child containment
- inherit locations
- behave as physical inventory objects

---

## Data Model

Create dedicated storage, conceptually:

```text
item_templates
item_template_field_values
```

Exact schema may vary.

A template should support:

### Base data

- template name
- target category
- default item name
- description
- condition
- location
- purchase date
- purchase price amount/currency
- serial number
- transferred to

### Dynamic data

- custom field values belonging to selected category

Use the same validation rules/types as regular items wherever possible.

Prefer reusing existing item validation/domain logic instead of maintaining duplicate validation.

---

## Template Management UI

Add a new main navigation area:

```text
Templates
```

Create a Templates page with:

- template name
- category
- modified date where useful
- actions:
  - Use
  - Edit
  - Delete

Add:

```text
Add Template
```

Support:

- create
- edit
- delete
- use template

Follow existing Tabler styling.

---

## Template Editor

The template editor should closely mirror the standard item form where appropriate.

Requirements:

- choose category
- load category custom fields
- set any reusable default values
- allow fields to remain empty
- validate values according to existing rules
- changing category updates available custom fields safely

Make it clear that values are defaults for future items.

---

## Use Template Flow

Using a template must NOT immediately create an item.

Required flow:

```text
Templates
  -> Use
  -> regular Add Item form opens prefilled
  -> user reviews/changes data
  -> Save
  -> real item is created
```

The prefilled form must still behave like a normal create flow.

The resulting item must not retain a runtime dependency on the template.

Changing/deleting the template later must not mutate already-created items.

---

## Add Item Integration

Make templates easily accessible from the regular Add Item flow.

Preferred UX:

```text
Add item ▾
  Blank item
  From template...
  AI Add Item
```

or an equivalent clean interaction consistent with current UI.

`Blank item` must preserve current behavior.

`From template...` should allow selecting a template and opening the regular prefilled ItemForm.

Do not create a separate parallel item creation form if existing `ItemForm.vue` can be reused.

---

## Save Existing Item as Template

Add an action on Item Details:

```text
Save as Template
```

Behavior:

1. Take current item as a starting point.
2. Open Template editor.
3. Prefill:
   - category
   - base fields
   - custom fields
4. User can remove item-specific values before saving.
5. Template is created only after explicit confirmation/save.

Do not silently create a template.

---

## Item-Specific Fields

Do not automatically strip data such as serial number, purchase date, purchase price, or location.

However, the template editor must allow the user to clear them before saving.

A helpful note may remind the user that unique values such as serial numbers are usually best left blank.

Do not enforce this as a hard rule.

---

## Category / Custom Field Changes

Templates must tolerate schema evolution safely.

### Deleted custom field

If a template references a custom field that no longer exists:

- do not crash
- ignore the missing value when using the template
- show a warning in editor/use flow where practical

Example:

```text
Some template fields no longer exist and were ignored.
```

### Changed category field structure

Load current field definitions and map only still-valid field values.

### Deleted category

If the template category no longer exists:

- template remains visible/manageable
- template cannot be used until repaired
- editing must allow choosing a valid category

Do not silently assign another category.

---

## API

Add dedicated template endpoints, for example:

```http
GET    /api/item-templates
GET    /api/item-templates/:id
POST   /api/item-templates
PUT    /api/item-templates/:id
DELETE /api/item-templates/:id
```

Exact route naming may vary, but keep it consistent.

Use service/repository separation matching current backend architecture.

Do not put template SQL directly in route handlers.

---

## Reuse ItemForm Prefill

Refactor item creation prefill logic cleanly.

The current form already supports AI-derived draft prefilling.

Avoid adding another unrelated one-off initialization path.

Create a reusable concept for item drafts/prefill sources so future flows can initialize Add Item consistently.

Potential sources:

```text
blank
AI draft
template draft
duplicate draft
```

Do not over-engineer, but avoid copying large assignment blocks.

---

## Photos

Template photos are OUT OF SCOPE for initial implementation.

Do not copy/store item photos in templates.

The resulting item may still add photos normally in ItemForm.

---

## Backup / Restore

Templates are application data.

Ensure existing database backup/restore naturally preserves them.

If backup validation/schema checks need updates because of new tables, add them.

---

## Search / Sorting

Template list should support at least useful default ordering.

Full Items-style custom column configuration is not required.

Simple search by template name/category may be added if consistent and low-cost.

---

## i18n Compatibility

If frontend i18n has already landed, all new UI strings must use translation keys and include English/Ukrainian values.

Do not translate user-created template names or values.

---

## Tests

Add/update tests for at least:

### Backend

- create template
- edit template
- delete template
- fetch/list templates
- base-field validation
- custom-field validation
- deleted custom field does not break template usage
- deleted category blocks use safely
- template persistence survives backup/restore

### Frontend / E2E

- create template
- edit template
- delete template
- use template
- normal ItemForm opens prefilled
- user can change values before save
- created item is independent from template
- Save as Template from an existing item
- custom field values prefill correctly
- current blank Add Item flow still works
- AI Add Item flow still works

---

## Acceptance Criteria

The task is complete when:

1. Templates are stored separately from inventory items.
2. User can create/edit/delete templates.
3. Templates may contain core and category custom-field values.
4. User can create a new item from a template.
5. Using a template prefills the normal Add Item form instead of immediately creating an item.
6. User can modify all prefilled values before save.
7. Existing item can be used as starting point for a new template.
8. Existing items remain independent from templates after creation.
9. Deleted/changed custom fields are handled safely.
10. Missing categories do not crash application.
11. Templates are preserved by backup/restore.
12. Template photos are not introduced.
13. Existing item creation flows continue to work.
14. Automated tests cover the new behavior.

---

## Out of Scope

Do not implement:

- built-in/hardcoded templates
- online template marketplace
- template sharing/download catalog
- template photos
- template inheritance
- nested templates
- automatic bulk item creation from one template
- item duplication

Item duplication is covered by:

`TASK-DUPLICATE-ITEM.md`
