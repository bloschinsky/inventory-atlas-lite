# Inventory Dashboard

## Summary

`/dashboard` is the default application landing page. It summarizes real records already stored in
SQLite in eight metric groups: Total items, Photo coverage, Placement status, Added in the last 30
days, Items by category, Condition breakdown, Field coverage, and Items by location. Seven of them
are drawn with ApexCharts in native Tabler cards; every chart has its values in visible text or in its
accessible name as well. No analytics tables, background jobs, CDN, or runtime service were added.

## User-visible behavior

The category selector defaults to **All categories**. Selecting a category writes its positive
integer ID to `?categoryId=…`, so refreshes and copied links preserve the scope; **Reset** removes the
query. The selected scope applies to every group except **Items by category**. A valid empty category
returns a normal zero-data Dashboard. Malformed and unknown IDs produce the standard API error state,
which offers **Retry**.

Row 1 — four responsive KPI cards:

- **Total items**: the number of all items in scope, including items used as containers, with the
  scope name. No chart.
- **Photo coverage**: a radial gauge with the percentage in its center, and the with-photos and
  without-photos counts as text below it.
- **Placement status**: a 100% stacked horizontal bar of Inside a container, Direct location, and
  Unplaced, with a legend that lists each count. The counts are mutually exclusive in that precedence
  order. An empty scope shows *No items in this scope.* instead of the bar.
- **Added in the last 30 days**: the count of the rolling window plus an area sparkline of the items
  added on each day of it; the tooltip shows the date and count of a day.

Row 2 — distributions:

- **Items by category** is a treemap of the complete inventory. It shows the six largest non-empty
  categories, combines the rest as **Other**, and keeps an active smaller or empty category visible.
  Without a filter every real category is drawn in the primary color; with a filter only the selected
  category keeps it and the others turn neutral. **Other** is always neutral. Clicking a real
  category tile applies it as the filter; **Other** is not a filter target. Below the treemap, a row
  of buttons with each name and count offers the same filter to the keyboard (`aria-pressed` marks the
  active one). An empty selected category has no tile but keeps its button. Legacy rows without a
  category appear as **Uncategorized**.
- **Condition breakdown** is a donut chart of the current scope with the scope total in its center and
  a legend listing every group with its count. Values are trimmed and grouped case-insensitively,
  blank values become **Not specified**, and deterministic title-case labels represent normalized
  keys. The five largest groups remain separate and the rest become **Other**. Named conditions take
  Tabler's primary, orange, teal, purple, and pink in that fixed order; **Not specified** and
  **Other** use two different neutral grays.

Row 3 — analytics:

- **Field coverage** is a radar chart with six axes, next to a list that shows each axis as
  `82% (164 / 200)`. It shows each field separately and is never combined into one score:
  - **Photos**: the item has at least one photo;
  - **Placement**: the item is inside a container, or is top-level with non-blank saved location
    text (the Placement status semantics);
  - **Condition**: the trimmed condition is not empty;
  - **Purchase date**: a real calendar date is stored (`date(purchase_date) = purchase_date` in
    SQLite, the same `YYYY-MM-DD` form the item validation writes);
  - **Purchase price**: both the amount and the currency are stored, which is the only complete form
    the item validation writes and the item pages display;
  - **Serial number**: the trimmed serial number is not empty.

  An empty scope shows *No items in this scope.* instead of the chart.
- **Items by location** is a horizontal distributed bar chart with each count printed after its bar.
  It groups items by their **effective location**, the same value the Items list shows: the saved
  location of the outermost container of the item's chain, or the item's own location when it is
  top-level. `Camera → Camera Box (Office)` counts under `Office` at any depth, and a contained item's
  own saved location never overrides the inherited one. Text is trimmed and grouped
  case-insensitively; the most frequent spelling names a group, with the lexically first spelling
  breaking a tie. The seven largest groups are shown in count order (ties by the lowercase text), the
  rest are summed into **Other**, and items without an effective location are counted as **Unknown**.
  **Other** and **Unknown** are drawn in neutral gray. Stored locations are never changed.

Placement status and Items by location intentionally answer different questions. Placement status
classifies each item by its own container link and saved location; Items by location uses the
inherited effective location. An item inside a box therefore counts as *Inside a container* in the
first and under the box's location in the second.

Loading replaces the metrics, while a category change keeps them visibly dimmed and announces
**Refreshing…**. Requests use `AbortController` plus a monotonically increasing request number, so a
slower earlier response cannot replace a newer selection; all charts update from the same response
together. Failure hides stale metrics and presents a retry action. Empty inventory and empty-category
states keep the zero KPI cards and the zero gauge and sparkline, show text empty states for the other
charts, and guide the user to **Add item**.

## Charts, theme, and accessibility

- ApexCharts 7.0.0 comes from the copy Tabler ships in `@tabler/core/dist/libs/apexcharts`; no
  separate package or CDN is used. `client/src/dashboardCharts.js` loads it with a dynamic
  `import()`, so it is a separate chunk only the Dashboard downloads, and `vite.config.js`
  pre-bundles that UMD file for the development server.
- `client/src/dashboardCharts.js` also holds the option builder of each chart and resolves Tabler's
  CSS custom properties (`--tblr-primary`, `--tblr-body-color`, `--tblr-bg-surface`, …) to hex on a
  1×1 canvas, because Tabler defines them with `light-dark()` and `color-mix()`, which ApexCharts
  cannot read. The Dashboard resolves them again whenever `theme.js` changes the color mode, so a live
  switch redraws every chart in the new palette. Toolbars, zooming, and animations are off.
- `client/src/components/DashboardChart.vue` owns one ApexCharts instance: it creates it on mount,
  applies new options (data, language, or theme) to the same instance, and destroys it on unmount, so
  a category refresh never stacks charts. ApexCharts follows the container width itself; while a
  resize settles, the chart cards clip the old drawing so the page never scrolls sideways.
- Every chart container is `role="img"` with an accessible name that includes its values, for
  example *Bar chart of items by location. Office: 4, Garage: 1, Unknown: 3*. The KPI numbers,
  placement and condition legends, the field-coverage list, and the category buttons keep the
  critical values visible as text.
- Category, condition, and location values are user data and are never translated; the server's
  English bucket names (`Other`, `Not specified`, `Unknown`, `Uncategorized`) are recognized by their
  keys and shown in the active language. Numbers use the locale formatters.

## API and time semantics

`GET /api/dashboard` and `GET /api/dashboard?categoryId=<id>` return everything in one response. The
existing fields are unchanged; the response adds:

```json
{
  "recentActivity": [{ "date": "2026-08-26", "count": 0 }, { "date": "2026-08-27", "count": 3 }],
  "fieldCoverage": [{ "key": "photos", "count": 164, "percentage": 82 }],
  "locationDistribution": [
    { "key": "office", "label": "Office", "count": 4 },
    { "key": "__other__", "label": "Other", "count": 2 },
    { "key": "__unknown__", "label": "Unknown", "count": 3 }
  ]
}
```

`fieldCoverage` always lists `photos`, `placement`, `condition`, `purchaseDate`, `purchasePrice`, and
`serialNumber` in that order; its percentages use `totalItems` and are `0` for an empty scope.

Item timestamps are written by SQLite `CURRENT_TIMESTAMP`, which is UTC. `DashboardService` reads the
clock once per request and passes it to the repository as a UTC `YYYY-MM-DD HH:MM:SS` value, so the
KPI and the daily series share one window: `created_at >= datetime(@now, '-30 days')`, inclusive.
That rolling window starts at the same time of day 30 days ago and therefore touches 31 UTC calendar
days: `recentActivity` has one bucket for each of them, oldest first, from the partial first day to
today, with zero-count days included. Its counts always add up to `addedLast30Days`; a timestamp
ahead of the server clock is counted in today's bucket. There are no historical snapshots.

## Implementation overview

- `DashboardRepository` holds all SQL. `itemMetrics()` computes the KPI, placement, and field-coverage
  counts in one aggregate statement; `countsByCreatedDay()`, `countsByCategory()`,
  `countsByCondition()`, and `countsByEffectiveLocation()` are the other aggregates. A response runs a
  fixed number of statements at any inventory size, with the category bound as a parameter.
- `countsByEffectiveLocation()` reuses `ROOTS_CTE` exported by `ItemRepository`, the recursive CTE
  that labels every item with its root container for the Items list, and the same
  root-or-own-location expression, so both pages share one definition of the effective location. It
  returns counts per exact trimmed text; items in a (never API-creatable) containment cycle are not
  reached by the CTE and fall back to their own location, as in the list.
- `DashboardService` builds the 31 daily buckets, the field-coverage entries, and the location groups
  (case-insensitive merge, the seven leading groups, Other, and Unknown). Its clock is injectable for
  tests.
- Photo coverage uses `EXISTS`, so multiple photo rows never multiply an item. The placement `CASE`
  expressions are mutually exclusive and always sum to Total items. Existing indexes cover category
  filtering and photo existence checks; no index was added.

## Verification

- `test/services.test.js` covers the rolling window on a fixed clock (31 ordered buckets, the
  inclusive boundary, zero days, the sum equal to `addedLast30Days`, and category scope), field
  coverage counts and percentages including incomplete legacy date and price values and an empty
  scope, direct, inherited, and multi-level effective locations, a child's own location not overriding
  the inherited one, Unknown, case-insensitive trimmed grouping, seven leading locations plus Other
  with stable tie-breaking, category-scoped locations with a global category distribution, and the
  placement-total invariant.
- `test/dashboard.test.js` covers the same API over HTTP, including empty and populated databases,
  one and multiple photos, the inclusive rolling-date boundary, filtered and empty categories, bad
  IDs, uncategorized legacy rows, normalized conditions, and both truncation rules.
- `test/e2e/dashboard.spec.js` covers all eight groups and seven charts, scoped chart values after a
  category change, one chart instance per chart after refreshes, treemap tile selection and the
  non-selectable Other tile, keyboard filtering with the category buttons, URL synchronization and
  Reset, loading, empty inventory and empty category, error and retry, stale-response protection,
  light and dark modes, a live theme switch that recolors chart text, and horizontal overflow at 1440,
  768, 390, and 320 pixels.
