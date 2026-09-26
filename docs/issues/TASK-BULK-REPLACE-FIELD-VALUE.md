# TASK: Bulk Replace Field Value

**Status:** Planned
**Priority:** Medium
**Type:** Data management / bulk edit
**Blocked by:** None

---

## Goal

Add a safe bulk operation for replacing one exact repeated field value with another across all matching items.

Primary example:

```text
Field: Location
Current value: Garage
New value: KP Garage
```

Only items whose saved `Location` is exactly `Garage` should be changed.

Do not modify values such as:

```text
TP Garage
Big Garage
KP Garage
```

This is a data-maintenance feature for fixing inconsistent naming without editing items one by one.

---

## Scope

### Supported fields

Initial version must support repeated text-like values where bulk replacement is useful:

- `Location`
- `Condition`
- `Transferred To`
- custom fields of type `text`

Do not include in the initial version:

- item `Name`
- `Description`
- `Serial Number`
- dates
- numbers
- booleans
- `Stored inside`
- `Category`

`Category` is a separate entity and must continue to be renamed through category management rather than by replacing item values.

### Matching rules

Replacement must use exact-value matching.

Required behavior:

- ignore surrounding whitespace when comparing;
- compare text case-insensitively;
- replace the entire stored value, never a substring;
- never use broad matching such as `LIKE '%value%'`.

Examples:

```text
"Garage"       -> match
" garage "     -> match
"GARAGE"       -> match
"TP Garage"    -> no match
"Big Garage"   -> no match
"KP Garage"    -> no match
```

The final stored replacement value should use the exact text entered by the user after normal input validation/trimming.

---

## UX

Add a **Bulk Replace Value** / **Replace Field Value** action in an appropriate data-management location.

Suggested flow:

1. Select field.
2. Select or enter current exact value.
3. Enter replacement value.
4. Preview affected records.
5. Confirm.
6. Apply the replacement atomically.

### Preview

Before any write, show:

- selected field;
- current value;
- replacement value;
- total number of affected items;
- a sample/list of affected items with item name and category;
- custom-field scope when relevant.

The user must explicitly confirm after seeing the preview.

If no items match, disable the final action and show a clear empty state.

### Existing-value warning

If the replacement value already exists elsewhere in the same field, this is allowed.

Show a non-blocking message such as:

```text
"KP Garage" is already used by 12 items.
17 additional items will be changed to this value.
```

Do not rewrite records that already contain the target value.

---

## Custom field behavior

Custom fields are category-specific and multiple categories may contain text fields with the same visible name.

The operation must never silently combine unrelated fields.

The UI/API must identify custom fields by stable field ID.

If a merged/custom-column style selector is used, the scope must be explicit before confirmation.

Prefer one of:

- select one concrete custom field/category; or
- explicitly select an "all matching fields with this name" mode.

Do not make cross-category replacement implicit.

---

## Backend

Keep the existing repository/service/route separation.

Add dedicated preview and apply operations instead of implementing writes in the client.

Suggested API shape:

```text
POST /api/items/bulk-replace/preview
POST /api/items/bulk-replace
```

Exact route naming may follow existing project conventions.

Request must identify:

```json
{
  "field": {
    "type": "core",
    "key": "location"
  },
  "from": "Garage",
  "to": "KP Garage"
}
```

or for custom fields:

```json
{
  "field": {
    "type": "custom",
    "fieldId": 42
  },
  "from": "Creative",
  "to": "Creative Labs"
}
```

Do not accept raw SQL column names from the client.

Use a server-side whitelist for supported core fields.

### Transaction safety

The apply operation must run inside one SQLite transaction.

Either every matching value is updated or none are.

Return at least:

```json
{
  "updated": 17
}
```

### Stale preview protection

The backend must re-evaluate matches when the final apply request runs.

Do not trust the preview count sent by the client.

If records changed between preview and confirmation, apply only to records that still match the exact original value and return the actual updated count.

---

## Location-specific rule

Operate on the item's **saved `location` value**, not `effective_location`.

Do not write inherited/effective locations into child items.

Existing effective-location inheritance must continue to work automatically.

Example:

```text
Box A
Location: Garage
└ Camera
```

After replacing:

```text
Garage -> KP Garage
```

only `Box A.location` is changed.

The camera should display `KP Garage` through the existing inheritance logic without rewriting the camera row.

---

## Autocomplete / value discovery

Where practical, reuse the existing autocomplete/value-suggestion patterns.

For a selected field, the UI should be able to show existing distinct values with usage counts.

Example:

```text
Garage (17)
KP Garage (12)
Home (41)
Office (8)
```

This is preferred over requiring the user to type the old value blindly.

Do not load excessive full item data merely to build suggestions.

---

## Validation

Reject:

- unsupported fields;
- missing source value;
- empty/invalid target value where the target field does not allow it;
- source and target values that normalize to the same exact value;
- unknown custom field IDs;
- non-text custom fields.

Use existing application error conventions.

---

## Tests

Add automated coverage for at least:

1. exact Location replacement;
2. case-insensitive matching;
3. surrounding-whitespace normalization;
4. substring values are not changed;
5. already-target-valued records are not rewritten;
6. replacement when target value already exists;
7. `Transferred To`;
8. `Condition`;
9. one text custom field;
10. custom fields with same visible name in different categories do not get mixed accidentally;
11. non-text custom field rejection;
12. preview does not write anything;
13. final apply re-checks current data;
14. transaction rollback on failure;
15. effective Location inheritance still works after replacing a container's saved Location.

Add/update E2E coverage for the preview + confirmation workflow.

---

## Acceptance Criteria

1. User can select a supported field and replace one exact value globally.
2. Partial text matches are never changed.
3. Preview shows affected count and records before writing.
4. Final operation requires explicit confirmation.
5. Replacement is atomic.
6. Core field selection is server-whitelisted.
7. Custom fields are addressed by stable field ID and do not silently cross category scope.
8. Saved `Location` is edited without altering inherited child locations directly.
9. Existing target values are preserved and can coexist safely.
10. Tests, docs, lint, and E2E pass.

---

## Out of Scope

Do not add in this task:

- regex replacement;
- substring find/replace;
- multi-field replacement in one operation;
- arbitrary SQL-like filters;
- undo history;
- bulk item renaming;
- category renaming;
- bulk parent/container changes.
