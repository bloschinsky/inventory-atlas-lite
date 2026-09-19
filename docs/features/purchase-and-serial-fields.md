# Purchase and serial item fields

## Summary

Every item has three optional base properties independent of its category: **Purchase Date**,
**Purchase Price**, and **Serial Number**. They are available in the add and edit form and appear in
the Details card when populated. Existing items remain valid with all three properties empty.

## Data and API

- `purchase_date` is stored as an ISO `YYYY-MM-DD` text value after strict calendar-date validation.
- Purchase price is stored in separate nullable `purchase_price_amount` and
  `purchase_price_currency` columns. The amount is a validated fixed-point decimal string with up
  to four decimal places, avoiding JavaScript floating-point conversion. Currency is an uppercase
  ISO 4217 code. The API exposes the pair as `purchase_price: { amount, currency }`, or `null` when
  no amount is set.
- `serial_number` is nullable text limited to 255 characters. Outer whitespace is trimmed, while
  case, separators, spaces inside the value, and leading zeroes are preserved.
- The server rejects malformed dates, negative or non-decimal amounts, unsupported currency codes,
  and overlong serial numbers with the normal `{ "error": "..." }` response.

The item list response carries the same values. Free-text item search matches serial numbers in
addition to names and descriptions. Purchase dates and prices do not add new filters or sort modes.

## User interface

The common section of the item form includes a native date input, a decimal amount with an ISO
currency selector, and a serial-number text input. The selector uses the browser's maintained ISO
currency list and defaults to UAH for a new item. A currency selection without an amount is treated
as an empty purchase price, so partial price data is not stored.

The item Details card shows populated purchase and serial values. The purchase date is formatted in
the browser's locale, and the price shows its exact stored amount followed by the currency code.

## Migration, backup, and boundaries

At startup, the database initializer checks the `items` table and adds each missing nullable column
with `ALTER TABLE`. The migration is additive, so item IDs, nesting, custom fields, values, photos,
and all existing base fields stay in place. SQLite backups include the new columns automatically.

The application has no CSV import/export flow, so no CSV format was added. Currency conversion,
exchange rates, receipts, warranty data, vendors, tax calculations, depreciation, valuation, and
serial-number uniqueness remain outside this feature.

## Verification

The API acceptance suite starts from a legacy SQLite schema, verifies that old item, custom-field,
and photo data survives migration, and covers create, read, update, clear, validation, serial-number
search, three currencies, restart-safe storage, and backup contents. Playwright covers the primary
browser workflow for creating, finding, viewing, and editing the new values.
