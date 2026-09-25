# TASK: Add Additional UI Languages

## Depends On

`TASK-I18N-FRONTEND-LOCALIZATION.md`

Implement this only after the base frontend i18n infrastructure with English and Ukrainian exists.

---

## Goal

Expand Inventory Atlas Lite localization with additional supported UI languages.

Existing locales:

- English — `en`
- Українська — `uk`

Add:

- Polski — `pl`
- Deutsch — `de`
- Español — `es`
- Français — `fr`
- Português (Brasil) — `pt-BR`

Russian must NOT be added.

Final supported locale set:

```text
en
uk
pl
de
es
fr
pt-BR
```

---

## Requirements

### 1. Add locale files

Create locale resources for:

```text
pl
de
es
fr
pt-BR
```

Translate the full existing frontend UI covered by the i18n system.

Do not leave partial locale files intentionally.

English remains the fallback locale.

### 2. Language registry

Do not hardcode language options independently in multiple components.

Create or extend a central locale registry/configuration.

Each locale should contain at least:

```js
{
  code,
  label
}
```

Use native language names for the visible labels:

```text
English
Українська
Polski
Deutsch
Español
Français
Português (Brasil)
```

The Settings language selector must be generated from this registry.

### 3. Locale identifiers

Use exactly:

```text
en
uk
pl
de
es
fr
pt-BR
```

Do not split Spanish into regional variants in this task.

Use Brazilian Portuguese specifically rather than generic Portuguese.

### 4. Locale-aware formatting

Ensure the new locales work with the existing locale-aware formatting layer for:

- dates
- numbers
- currencies
- pluralization

Do not create custom manual formatting rules where `Intl` or vue-i18n already supports the locale.

For `pt-BR`, use the full locale identifier.

### 5. Preserve user data

Translate only application UI.

Never translate or modify user-created content, including:

- item names
- category names
- template names
- custom field names
- descriptions
- locations
- brands/models
- imported data

### 6. Fallback behavior

English remains the fallback locale.

Missing translation keys must:

- fall back to English
- never render blank UI
- not break the application

Prefer development-time warnings for missing keys.

### 7. Translation completeness validation

Add a lightweight automated check that compares locale keys against the English source locale.

The check should detect:

- missing keys
- unexpected structural mismatches where practical

It should cover:

```text
uk
pl
de
es
fr
pt-BR
```

Do not require every translated string to differ textually from English.

The validation should run as part of normal test/lint workflow or be covered by automated tests.

### 8. Settings UI

Update the existing Language selector to include all supported languages.

Suggested order:

```text
English
Українська
Polski
Deutsch
Español
Français
Português (Brasil)
```

Changing language must retain existing behavior:

- apply immediately
- persist via the existing locale preference storage
- survive reload

Do not change the persistence mechanism introduced by the base i18n task.

### 9. Development guidance

Update the existing i18n development rule if needed so future UI changes must keep all supported locale files synchronized.

New user-facing translation keys must be added to:

```text
en
uk
pl
de
es
fr
pt-BR
```

Do not add Russian localization.

---

## Translation Quality

Translations should be natural UI language, not literal word-for-word translations.

Keep terminology consistent across:

- Items
- Categories
- Templates
- Settings
- Backup
- AI
- QR
- Dashboard
- dialogs
- common actions

Technical terms that are commonly used untranslated in the target language may remain in their established form.

Avoid machine-generated-looking phrasing.

---

## Tests

Add/update tests for at least:

- every supported locale can be activated
- Settings lists all supported locales
- locale preference persists
- representative UI renders in each locale
- date/number formatting works with each locale
- English fallback still works
- locale-key completeness validation passes
- user-created data is not translated
- existing i18n tests continue to pass

---

## Acceptance Criteria

The task is complete when:

1. `pl`, `de`, `es`, `fr`, and `pt-BR` are added.
2. Final supported set is `en`, `uk`, `pl`, `de`, `es`, `fr`, `pt-BR`.
3. Russian is not included.
4. Settings shows language names in their native form.
5. Language options come from a central registry.
6. All current UI translation keys exist in every supported locale.
7. English remains fallback.
8. Locale-aware formatting works for all supported locales.
9. Translation completeness is checked automatically.
10. Existing functionality and i18n behavior remain unchanged.
11. Lint/tests/E2E pass.

---

## Out of Scope

Do not add in this task:

- Russian
- Czech
- Italian
- Dutch
- additional regional Spanish variants
- European Portuguese
- automatic runtime translation
- translation of user-created inventory data
