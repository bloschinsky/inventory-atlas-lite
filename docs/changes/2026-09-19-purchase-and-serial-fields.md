# Purchase and serial item fields

- **Completed:** 2026-09-19
- **Version:** 0.10.0

## Summary

Added optional Purchase Date, structured Purchase Price, and Serial Number base fields to every
item. Purchase prices keep the decimal amount and ISO 4217 currency code separate, serial numbers
preserve leading zeroes and manufacturer formatting, and item search now includes serial numbers.

Existing SQLite databases receive four nullable columns through additive startup migration. The
item API validates and persists the fields for create and update requests, returns the price as an
amount/currency object, and clears both price columns when the amount is empty. The add/edit form
uses a date control, exact decimal amount input, ISO currency selector, and serial text input; the
item page displays populated values in the Details card.

Updated the quick guide and permanent feature documentation, removed the completed task from the
roadmap, and advanced the project version from 0.9.0 to 0.10.0.

## Verification

- `npm run lint` passed.
- `npm test` passed with 13 tests passed and 10 platform-dependent tests skipped.
- `npm run build` passed.
- `npm run test:e2e` passed with all 19 Chromium tests.
- The API suite verifies migration from a legacy database while preserving its item ID, custom
  value, and photo; nullable columns; create/update/clear behavior; strict validation; exact serial
  preservation; zero and multi-currency prices; serial search; and SQLite backup contents.
- Playwright verifies the user workflow for creating, finding by serial number, viewing, and editing
  purchase and serial values.
