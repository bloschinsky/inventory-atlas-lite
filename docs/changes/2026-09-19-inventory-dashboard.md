# Inventory Dashboard

- **Completion date:** 2026-09-19
- **Resulting project version:** 0.11.0

Added `/dashboard` as the default landing page and the first shared navigation destination. Its
single aggregate API response supplies exactly six metric groups from SQLite: scoped item totals,
item-level photo coverage, mutually exclusive placement status, records added during the rolling
last 30 days, an all-inventory category distribution, and a scoped normalized condition breakdown.
The category filter is preserved in the URL, category bars can apply it directly, and valid empty
categories produce normal zero values.

The responsive Tabler page includes intentional loading, refreshing, empty, error, and retry states.
An abort signal and request sequence prevent an older response from overwriting a newer filter. The
CSS-only bars expose their values as text and real category bars are accessible buttons. No charting
dependency, external runtime service, new table, or new index was added.

Updated the application navigation and item-list return links for the new `/items` route. Added the
permanent Dashboard feature document, updated the feature index, application UI documentation,
How-To, and roadmap, and removed the completed task file. The project version advanced from 0.10.0
to 0.11.0.

Verification completed successfully:

- `npm run lint`
- `npm test` — 25 tests: 15 passed and 10 platform-specific shell tests skipped
- `npm run build`
- `npm run test:e2e` — 23 Chromium tests passed

The API tests cover empty data, photo de-duplication, placement precedence and its total invariant,
the UTC 30-day boundary, category filtering and validation, an empty category, a legacy
uncategorized row, normalization, and both `Other` truncation rules. Browser tests cover rendering,
filter URL synchronization, Reset, loading, empty, error, retry, out-of-order responses, keyboard
category actions, the default route, light and dark themes, browser-console errors, navigation at
desktop and mobile sizes, and horizontal overflow at 1440, 768, 390, and 320 pixels. The existing
production-server acceptance flow also checks the Dashboard endpoint without weakening item, photo,
nesting, persistence, backup, or restore-adjacent coverage.
