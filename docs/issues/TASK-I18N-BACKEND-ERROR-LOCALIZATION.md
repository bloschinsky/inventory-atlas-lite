# TASK: Localize Backend Errors via Stable Error Codes

## Depends On

Frontend localization, now implemented; see
[`../features/interface-localization.md`](../features/interface-localization.md).

## Goal

Replace English backend error text as the frontend localization source with stable machine-readable error codes and structured parameters.

Backend remains locale-agnostic. Frontend translates errors using the active locale.

## Requirements

### 1. Add stable error codes

Extend the HTTP error mechanism so application errors include a stable code.

Example concept:

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "params": {}
  }
}
```

Error codes must be stable identifiers, not English text.

Examples:

```text
ITEM_NOT_FOUND
CATEGORY_REQUIRED
PARENT_ITEM_NOT_FOUND
ITEM_CANNOT_CONTAIN_ITSELF
ITEM_PARENT_CYCLE
ITEM_HAS_CHILDREN
INVALID_PURCHASE_DATE
INVALID_PURCHASE_PRICE
INVALID_SERIAL_NUMBER
INVALID_CUSTOM_FIELD
```

Use clear domain-specific names.

### 2. Parameterized errors

Errors containing dynamic values must expose parameters separately.

Instead of:

```text
This item contains 4 item(s). Move or delete them first.
```

return conceptually:

```json
{
  "code": "ITEM_HAS_CHILDREN",
  "params": {
    "count": 4
  }
}
```

The frontend performs interpolation/pluralization.

Do not make frontend parse English strings.

### 3. Frontend translation mapping

Add translation keys for application error codes in both locales.

Example:

```text
errors.ITEM_NOT_FOUND
errors.ITEM_HAS_CHILDREN
```

API/client error handling should:

1. read backend error code
2. translate through current locale
3. interpolate supplied parameters
4. safely fall back if code is unknown

Unknown errors may fall back to a generic localized message.

Do not expose internal stack traces.

### 4. Keep backend locale-agnostic

Do not pass UI language through every service.

Backend responsibilities:

- error code
- structured parameters
- HTTP status

Frontend responsibilities:

- localized human-readable message

### 5. Convert existing application/domain errors

Migrate user-visible backend errors across major current features, including at minimum:

- items
- nested items
- categories
- custom fields
- batch item creation
- batch custom-field creation
- photos where relevant
- backup/restore validation
- AI settings/integration validation where application-defined
- QR-related application errors where relevant

Do not unnecessarily translate third-party/provider messages. Wrap them in an app-level code where reasonable while preserving useful diagnostic context.

### 6. Preserve HTTP semantics

Do not change intended status codes.

Examples:

```text
400 validation/input error
404 not found
409 conflict
500 unexpected server error
```

Localization must not alter API behavior.

### 7. Compatibility

If needed during migration, temporarily support the existing string `message` field in addition to structured errors.

Frontend must prefer the error code.

Remove compatibility code if all application errors can be safely migrated within this task.

## Tests

Add/update tests for:

- stable error code responses
- HTTP status remains unchanged
- parameterized errors
- English translation
- Ukrainian translation
- pluralized parameterized errors
- unknown-code fallback
- unexpected server failures do not expose stack traces
- existing error handling still works

## Acceptance Criteria

The task is complete when:

1. Application/domain backend errors expose stable codes.
2. Dynamic error data is returned as structured parameters.
3. Frontend displays application errors through i18n.
4. English and Ukrainian error translations exist.
5. Backend does not need to know the active UI language.
6. HTTP statuses remain unchanged.
7. Unknown errors fail safely.
8. Existing tests pass and new behavior is covered.

## Out of Scope

Do not add:

- backend-rendered localized strings
- Accept-Language based backend translation
- user-data translation
- arbitrary translation of third-party API responses
