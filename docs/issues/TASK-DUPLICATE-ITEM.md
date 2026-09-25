# TASK: Duplicate Existing Item

## Depends On

`TASK-ITEM-TEMPLATES.md`

This task should reuse the shared ItemForm prefill/draft mechanism introduced for templates.

---

## Goal

Add a fast `Duplicate` action for existing inventory items.

Duplication is a one-time prefill operation for cataloging multiple similar physical items without requiring a permanent template.

Example:

```text
Box #1
-> Duplicate
-> change Name to Box #2
-> Save
```

---

## Required UX

Add a `Duplicate` action to the item UI.

Preferred locations:

- Item Details actions
- optionally Items row/card action menu if it fits cleanly

Flow:

```text
Existing item
  -> Duplicate
  -> Add Item form
  -> fields are prefilled
  -> user edits values
  -> Save
  -> separate new item is created
```

Do not create the duplicate immediately.

---

## Prefilled Data

Prefill the new item from source item:

- category
- name
- description
- condition
- location
- purchase date
- purchase price
- serial number
- transferred to
- custom field values

The user must be able to edit/clear everything before save.

---

## Fields That Must NOT Be Copied as Identity

Never preserve:

- database ID
- UUID
- created_at
- updated_at
- QR identity
- photo IDs
- child relationships

The new item must receive its normal new UUID when saved.

---

## Stored Inside / Parent

Default behavior:

Do NOT copy the parent/containment relationship.

Open the duplicate draft with:

```text
parent_item_id = null
```

This prevents accidentally creating the new physical item inside the same container without explicit user choice.

The user may choose a parent manually before save.

---

## Photos

Do not copy photos in initial duplication feature.

New Add Item form should have an empty new-photo selection.

Existing item photos remain attached only to source item.

---

## Serial Number

The source serial number may be prefilled because duplication is defined as a full field copy into an editable draft.

Provide a clear non-blocking hint that serial numbers are often unique.

Do not silently clear user data.

---

## Implementation

Reuse the common ItemForm prefill/draft mechanism created by:

`TASK-ITEM-TEMPLATES.md`

Do not build a duplicate-only form.

Conceptually supported draft sources should now include:

```text
AI
Template
Duplicate
```

Keep resulting save request identical to normal item creation.

---

## Safety / Independence

After save:

- source item is unchanged
- duplicate is a normal independent item
- editing/deleting either item does not affect the other
- no persistent source/clone relationship is required

---

## i18n Compatibility

If frontend i18n exists, add translation keys for all new UI text in both English and Ukrainian.

---

## Tests

Add/update tests for:

- Duplicate opens Add Item form
- expected base fields are prefilled
- custom fields are prefilled
- IDs/UUID are not reused
- photos are not copied
- parent relationship is not copied
- user can edit values before save
- source item remains unchanged
- saved duplicate is a normal independent item
- existing Add Item / AI / Template flows remain unaffected

---

## Acceptance Criteria

The task is complete when:

1. Existing item exposes a Duplicate action.
2. Duplicate opens the regular Add Item form.
3. Item and custom-field values are prefilled.
4. User can edit everything before save.
5. Saving creates a new independent item.
6. IDs, UUID, photos, timestamps, children, and QR identity are not copied.
7. Parent containment is not copied by default.
8. Existing source item remains unchanged.
9. Shared form-prefill architecture is reused.
10. Automated tests cover the behavior.

---

## Out of Scope

Do not add:

- bulk duplication
- automatic name incrementing
- automatic serial-number generation
- photo copying
- child-item cloning
- recursive container cloning
- persistent clone/source relationships
