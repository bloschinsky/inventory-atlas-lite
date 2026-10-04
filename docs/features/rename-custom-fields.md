# Rename custom fields

## Summary

An existing custom field can be renamed from **Categories & Fields** without deleting and recreating
it. Custom values are linked to their field by its database id (`item_field_values.field_id` and
`item_template_field_values.field_id`), so a rename changes only `custom_fields.name` and every item
and template value stays exactly as stored. The field type and category cannot be changed.

## User-visible behaviour

- Every field in the *Fields for* list has a **Rename** button next to **Delete**. It asks for the new
  name, prefilled with the current one; cancelling, an empty answer, or the unchanged name does
  nothing.
- After a successful rename the field list reloads with the new name and any previous error is
  cleared. A refused rename shows the reason above the lists and leaves the field as it was.
- Item details, the item form, templates, value suggestions, and Bulk Replace Field Value show the
  new name with the values saved before the rename.
- The Items list keeps merging custom columns by the current name and type: renaming one of two merged
  `Manufacturer` (text) fields to `Brand` splits the column in two, and renaming `Brand` to
  `Manufacturer` merges it into the existing `Manufacturer` column. There are no aliases; a stored
  column preference that uses the old column key is dropped by the usual preference reconciliation.
- Batch Add Items reads custom fields by their current name. The generated template uses the new name
  at once, and a document that still uses the old name is refused as an unknown custom field. JSON
  files saved outside the application are not rewritten.
- AI Add Item and AI Add Fields read the current fields from the database, so they see the new name;
  AI-drafted fields still pass the duplicate-name review.

## Validation

- The field must exist (`404 FIELD_NOT_FOUND`).
- The name is trimmed and follows the same rules as Batch Add Fields: required
  (`FIELD_NAME_REQUIRED`), at most 60 characters (`FIELD_NAME_TOO_LONG`), and not a built-in item
  attribute such as `Location` (`FIELD_NAME_RESERVED`).
- The name must stay unique within the category without regard to case. A conflict answers
  `409 FIELD_ALREADY_EXISTS` with the requested name. The same name in another category is allowed,
  and changing only the case of the field's own name is a real rename.
- Renaming to the field's current name returns the field unchanged.
- Only `name` may be sent. Any other property, including `type` and `category_id`, is refused with
  `400 FIELD_UPDATE_UNSUPPORTED_PROPERTY` and nothing changes.

## Implementation overview

- `PATCH /api/fields/:id` with `{ "name": "..." }` answers the updated definition
  `{ id, category_id, name, type }`.
- `CustomFieldService.rename()` requires the field, validates the name with `fieldNameError()` from
  `shared/fieldDefinitions.js` (also used by the batch field review), compares it with the other
  fields of the category through `sameFieldName()`, and calls `CustomFieldRepository.updateName()`,
  a single `UPDATE` of `name` and `updated_at`. The `UNIQUE(category_id, name)` constraint
  (`COLLATE NOCASE`) remains the final authority: a conflicting write that slips past the comparison
  is translated to `FIELD_ALREADY_EXISTS` instead of the generic `DUPLICATE_NAME`.
- `CustomFieldRepository.findById()` returns `id`, `category_id`, `name`, and `type`, and
  `CustomFieldService.requireField()` is shared by the rename and value suggestions.
- `client/src/pages/Categories.vue` asks for the name with the same prompt pattern as a category
  rename and reloads the selected category's fields.

## Limitations

- Field types cannot be changed, fields cannot move to another category, and there is no old-name
  alias or rename history.
- Renaming is one field at a time; there is no bulk rename across categories.

## Verification

- `test/custom-field-rename.test.js` covers renames with and without values, unchanged item and
  template value rows (text, number, date, boolean, and empty values), the unchanged id, type, and
  category, trimming, every refusal, case-insensitive conflicts, the database-constraint fallback,
  the same name in another category, column split and merge, value suggestions, Batch Add with the
  new and old names, field create/delete after a rename, and the HTTP contract of `PATCH`.
- `test/ai-providers.test.js` checks that AI Add Fields and AI Add Item receive the renamed field with
  its unchanged id.
- `test/e2e/categories.spec.js` renames a field in the browser, sees a conflict refused, and finds the
  saved value under the new label on Item details and in the edit form.
