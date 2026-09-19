# Inventory Dashboard

## Summary

`/dashboard` is the default application landing page. It summarizes real records already stored in
SQLite and contains exactly six metric groups: Total items, Photo coverage, Placement status, Added
in the last 30 days, Items by category, and Condition breakdown. No analytics tables, background
jobs, chart library, CDN, or runtime service were added.

## User-visible behavior

The category selector defaults to **All categories**. Selecting a category writes its positive
integer ID to `?categoryId=…`, so refreshes and copied links preserve the scope; **Reset** removes the
query. The selected scope applies to totals, photo coverage, placement, recent items, and conditions.
A valid empty category returns a normal zero-data Dashboard. Malformed and unknown IDs produce the
standard API error state, which offers **Retry**.

Four responsive KPI cards report:

- all items in scope, including items used as containers;
- items with one or more photos, the percentage they represent, and items without photos;
- mutually exclusive placement counts, in the precedence order Inside a container, Direct location,
  then Unplaced;
- records created in the rolling last 30 days.

The category card always uses the complete inventory. It shows the six largest non-empty categories,
combines the remaining count as **Other**, highlights the current filter, and keeps an active smaller
or empty category visible. A visible real category is a keyboard-accessible filter button. Legacy
rows without a category appear as **Uncategorized**.

The condition card uses the current scope. Values are trimmed and grouped case-insensitively, blank
values become **Not specified**, and deterministic title-case labels represent normalized keys. The
five largest groups remain separate and the rest become **Other**.

Loading replaces the metrics, while a category change keeps them visibly dimmed and announces
**Refreshing…**. Requests use `AbortController` plus a monotonically increasing request number, so a
slower earlier response cannot replace a newer selection. Failure hides stale metrics and presents a
retry action. Empty inventory and empty-category states preserve all zero metrics and guide the user
to **Add item**.

## API and time semantics

`GET /api/dashboard` and `GET /api/dashboard?categoryId=<id>` return the scope, category options, and
all six groups in one response. Parameterized aggregate queries calculate the scoped metrics in
SQLite. Photo coverage uses `EXISTS`, so multiple photo rows never multiply an item. The placement
`CASE` expressions are mutually exclusive and always sum to Total items.

Item timestamps are written by SQLite `CURRENT_TIMESTAMP`, whose value is UTC in the existing
application. Recent items are therefore compared on the server with
`created_at >= datetime('now', '-30 days')`; the boundary is inclusive and uses one consistent UTC
clock without historical snapshots.

Existing indexes cover category filtering and photo existence checks. The implementation introduced
no additional index because the aggregate query plans use `idx_items_category` and
`idx_photos_item` where applicable.

## Verification

API coverage exercises empty and populated databases, one and multiple photos, all placement states,
the inclusive rolling-date boundary, filtered and empty categories, bad IDs, uncategorized legacy
rows, normalized conditions, both truncation rules, and the placement-total invariant. Playwright
covers rendering, URL synchronization, Reset, loading, empty, error and retry states, stale-response
protection, keyboard-operable category bars, light and dark modes, and horizontal overflow at 1440,
768, 390, and 320 pixels.
