# Task — Add Purchase Date, Purchase Price and Serial Number as Base Item Fields

## Status
Planned.

## Goal

Extend the set of built-in/base fields available for **all Inventory Atlas Lite items**, regardless of category.

Add the following new fields:

- `Purchase Date`
- `Purchase Price`
- `Serial Number`

These fields are global item fields, similar to the existing built-in fields such as:

- Condition
- Location
- Description
- other current common/base item fields

They must **not** be implemented as category-specific dynamic/custom fields.

All three new fields must be optional.

Existing items and databases must continue to work without requiring users to manually fill the new fields.

---

# 1. Purchase Date

Add a new optional base field:

```text
Purchase Date
```

## Data type

Store it as a real date value, not as arbitrary display text.

Preferred logical representation:

```text
YYYY-MM-DD
```

Example:

```text
2024-11-18
```

The implementation may use the database representation that best fits the current SQLite/schema conventions, but the stored value should remain unambiguous and independent of locale formatting.

Do not store localized strings such as:

```text
18.11.2024
November 18, 2024
18/11/24
```

as the canonical database value.

## UI

Use a date input/date picker that follows the current application UI.

The user should be able to:

- set a purchase date;
- edit it;
- clear it.

The display may use a friendly localized format, but persistence must use an unambiguous date representation.

Do not require a time component.

---

# 2. Purchase Price

Add a new optional base field:

```text
Purchase Price
```

Purchase price must support **multiple currencies**.

A single numeric database column is not sufficient.

Conceptually the value must contain:

```text
amount
currency
```

Example:

```text
Amount: 1200.00
Currency: UAH
```

or:

```text
Amount: 49.99
Currency: USD
```

or:

```text
Amount: 40
Currency: EUR
```

## Amount

The monetary amount must:

- support decimal values;
- support zero when valid;
- reject invalid non-numeric input;
- not assume a single currency;
- not encode the currency inside an arbitrary free-text amount field.

Use an appropriate SQLite representation consistent with the existing architecture.

Avoid floating-point precision problems where practical.

A preferred implementation is either:

```text
purchase_price_amount as integer minor units
```

for example:

```text
4999 = 49.99 USD
```

or another deliberate fixed-precision representation.

If the current project architecture makes a decimal representation simpler, it may be used, but do not rely blindly on JavaScript binary floating-point for monetary calculations.

This task does not require currency conversion or financial calculations.

## Currency

Store currency separately from the amount.

Preferred representation:

```text
ISO 4217 currency code
```

Examples:

```text
UAH
USD
EUR
GBP
PLN
CZK
```

Do not store only currency symbols such as:

```text
$
€
₴
```

because symbols may be ambiguous.

The UI may display the familiar symbol together with the code where useful.

Example:

```text
1,200.00 UAH
49.99 USD
40.00 EUR
```

## Currency selector

The Purchase Price input should include a currency selector.

A simple implementation is acceptable:

```text
[ Amount            ] [ UAH ▼ ]
```

Use a maintained list of standard ISO 4217 currencies or an appropriately scoped list if the project already has a utility for this.

At minimum ensure common currencies relevant to normal usage are available, including:

```text
UAH
USD
EUR
GBP
PLN
CZK
```

Do not hard-code the application to only one currency.

## Empty value behavior

Purchase Price is optional.

Valid states:

```text
no amount + no currency
```

means:

```text
Purchase Price not specified
```

Do not store meaningless partial values if avoidable.

If the user clears the amount, the application should treat the purchase price as empty.

---

# 3. Serial Number

Add a new optional base field:

```text
Serial Number
```

## Data type

Store it as text/string.

Do **not** use a numeric database type.

Serial numbers may contain:

- letters;
- numbers;
- hyphens;
- spaces;
- slashes;
- leading zeroes;
- other manufacturer-specific characters.

Valid examples:

```text
SN123456
00038192
ABC-1234-XYZ
C02ZQ0ABC123
12A/9382-B
```

The application must preserve the exact value entered by the user except for reasonable outer whitespace trimming.

Do not:

- convert it to a number;
- remove leading zeroes;
- force uppercase/lowercase;
- try to interpret it mathematically.

---

# 4. Database schema

Extend the item schema using fields appropriate to the current project architecture.

Conceptually the database needs values equivalent to:

```text
purchase_date
purchase_price_amount
purchase_price_currency
serial_number
```

Exact column names may follow the current database naming convention.

All new columns must be nullable/optional.

Existing records must remain valid.

Example conceptual migration:

```sql
ALTER TABLE items ADD COLUMN purchase_date TEXT NULL;
ALTER TABLE items ADD COLUMN purchase_price_amount ... NULL;
ALTER TABLE items ADD COLUMN purchase_price_currency TEXT NULL;
ALTER TABLE items ADD COLUMN serial_number TEXT NULL;
```

Do not blindly copy this SQL if the project already has a migration/schema mechanism that should be used instead.

Use the existing database initialization/migration approach.

---

# 5. Database migration

Implement a safe migration for existing Inventory Atlas Lite databases.

The migration must:

- add the new fields without deleting existing data;
- preserve all existing item IDs;
- preserve existing photos;
- preserve custom/category fields;
- preserve locations and containers;
- be safe when upgrading an existing installation.

Existing items should simply receive:

```text
Purchase Date: empty
Purchase Price: empty
Serial Number: empty
```

until the user edits them.

Do not require recreating the SQLite database.

---

# 6. API

Extend the existing item API so the fields are supported by:

- create item;
- get item;
- update item;
- list item responses where appropriate;
- export/import flows if they currently include base item fields.

Conceptual JSON:

```json
{
  "purchaseDate": "2024-11-18",
  "purchasePrice": {
    "amount": 49.99,
    "currency": "USD"
  },
  "serialNumber": "ABC-1234-XYZ"
}
```

The exact external representation may differ if another shape integrates more naturally with the current API.

However, the API must preserve the semantic distinction between:

```text
price amount
```

and:

```text
currency
```

Do not expose Purchase Price only as a string such as:

```text
"$49.99"
```

as the canonical API representation.

---

# 7. Item create/edit form

Add all three fields to the standard Add Item / Edit Item form.

Suggested layout:

```text
Purchase Date
[ date picker ]

Purchase Price
[ amount ] [ currency ]

Serial Number
[ text input ]
```

Follow the current Tabler-based design and existing form conventions.

All fields are optional.

Validation messages should use the existing form validation style.

---

# 8. Item details

Display populated values on the item detail/card view where the other base item metadata is shown.

Example:

```text
Purchase Date
18 Nov 2024

Purchase Price
49.99 USD

Serial Number
ABC-1234-XYZ
```

Do not show visually noisy empty rows if the application currently hides unspecified optional fields.

Follow the existing behavior for other optional base fields.

---

# 9. Search

If the current global item search already searches textual base fields, include:

```text
Serial Number
```

in search.

A user should be able to find an item by entering its serial number.

Example:

```text
ABC-1234-XYZ
```

must find the item containing that serial number.

Purchase Date and Purchase Price do not need to be added to free-text search unless the current search architecture naturally supports them.

---

# 10. Filtering and sorting

Do not implement advanced purchase price/date filters unless they fit trivially into the current generic filtering system.

However, the data model should not prevent future functionality such as:

```text
Purchased after...
Purchased before...
Price > ...
Price < ...
Currency = ...
```

This task is primarily about adding the base fields correctly.

---

# 11. CSV / export / import compatibility

If Inventory Atlas Lite currently exports/imports base item fields, include the new fields.

Preferred conceptual columns:

```text
Purchase Date
Purchase Price Amount
Purchase Price Currency
Serial Number
```

Do not combine amount and currency into one ambiguous CSV column if structured base fields are otherwise exported separately.

Import must preserve:

- serial number leading zeroes;
- purchase date;
- amount;
- currency code.

If current CSV import/export does not include arbitrary base fields yet, do not expand the task unnecessarily; document the omission instead.

---

# 12. Backup compatibility

SQLite backup/restore must continue to work without special handling.

The new fields are part of the normal database schema and therefore must naturally be preserved in backups.

No separate backup format is required.

---

# 13. Validation

## Purchase Date

Accept:

```text
valid date
empty/null
```

Reject malformed persisted input.

## Purchase Price

Accept:

```text
valid decimal/fixed-precision amount + valid currency
empty/null
```

Do not accept:

```text
"50 dollars"
"$49.99 USD"
"around 100"
```

as the canonical monetary value.

## Serial Number

Accept arbitrary reasonable text within the application's normal field-size limits.

Preserve:

```text
letters
digits
leading zeroes
hyphens
slashes
spaces
```

---

# 14. Backwards compatibility

This task must not change the meaning or behavior of existing fields such as:

- Condition;
- Location;
- Description;
- Name;
- Brand;
- Model;
- category-specific custom fields.

Do not convert the three new fields into dynamic/category fields.

They are first-class base item properties.

---

# 15. Tests

Add/update tests covering at minimum:

### Database

- migration of an existing database;
- new nullable fields;
- persistence of all three new properties.

### API

Create item with:

```text
Purchase Date
Purchase Price
Serial Number
```

and verify they are returned correctly.

Update each field and verify persistence.

Clear each optional field and verify it becomes empty/null correctly.

### Serial number

Verify values such as:

```text
000123ABC-09
```

are preserved exactly.

### Purchase price

Verify different currencies:

```text
1000 UAH
49.99 USD
39.50 EUR
```

do not overwrite or reinterpret each other.

### Existing items

Verify old items without these fields still load normally.

---

# Out of scope

Do not implement in this task:

- currency conversion;
- exchange-rate APIs;
- automatic historical FX rates;
- purchase receipts;
- warranty tracking;
- seller/vendor management;
- purchase location/shop;
- tax/VAT calculations;
- depreciation;
- total inventory valuation dashboard;
- serial-number uniqueness enforcement;
- barcode lookup based on serial number.

These can be separate future features.

---

# Acceptance criteria

The task is complete when all of the following are true:

- [ ] `Purchase Date` exists as an optional base item field.
- [ ] `Purchase Price` exists as an optional base item field.
- [ ] `Purchase Price` stores amount and currency separately.
- [ ] Currency uses an unambiguous code, preferably ISO 4217.
- [ ] The UI provides a currency selector.
- [ ] `Serial Number` exists as an optional base item field.
- [ ] Serial Number is stored as text.
- [ ] Serial numbers containing letters are supported.
- [ ] Leading zeroes in serial numbers are preserved.
- [ ] Existing SQLite databases migrate without data loss.
- [ ] Existing items remain valid with the new fields empty.
- [ ] Add Item supports all three fields.
- [ ] Edit Item supports all three fields.
- [ ] Item details display populated values.
- [ ] Serial Number participates in global search when applicable.
- [ ] API create/read/update supports the new fields.
- [ ] Backup/restore preserves the new fields.
- [ ] Relevant automated tests are added or updated.
- [ ] Existing base and category-specific fields continue to work unchanged.

---

# Result

Every Inventory Atlas Lite item can now optionally store basic acquisition and identification metadata:

```text
Purchase Date
Purchase Price
  ├── Amount
  └── Currency
Serial Number
```

These properties are available globally for all categories and are implemented as proper structured base fields rather than category-specific custom metadata.
