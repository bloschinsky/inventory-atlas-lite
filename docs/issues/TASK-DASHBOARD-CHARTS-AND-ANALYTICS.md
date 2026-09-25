# TASK: Dashboard Charts and Analytics Upgrade

## Goal

Upgrade the existing Inventory Atlas Lite Dashboard from mostly numeric/progress-bar presentation to a richer Tabler/ApexCharts dashboard while preserving the current data semantics, category filtering, responsive behavior, light/dark themes, and backend architecture.

Use the current Tabler-based UI and ApexCharts.

Do not replace the Dashboard with a separate analytics system.

---

## Current State

The existing `/dashboard` already contains six metric groups:

1. Total Items
2. Photo Coverage
3. Placement Status
4. Added in the Last 30 Days
5. Items by Category
6. Condition Breakdown

The current implementation uses:

- four KPI cards;
- a simple progress bar for photo coverage;
- text rows for placement;
- custom horizontal bars for category and condition distributions;
- one `GET /api/dashboard` response;
- optional `?categoryId=<id>` scope;
- `DashboardService` / `DashboardRepository`;
- existing loading, refresh, error, empty-state, i18n, responsive and dark-mode behavior.

Keep these behaviors unless this task explicitly replaces their presentation.

---

## Target Dashboard Layout

### Row 1 — KPI cards

Keep four responsive cards:

1. **Total Items**
   - keep as a large numeric KPI;
   - no chart is required;
   - preserve the current scope label.

2. **Photo Coverage**
   - replace the linear progress bar with a **radial bar / circular gauge**;
   - show the percentage prominently in the center;
   - retain textual counts for:
     - With photos
     - Without photos.

3. **Placement**
   - replace the three plain statistic rows with a **100% stacked horizontal bar**;
   - segments:
     - Inside container
     - Direct location
     - Unplaced;
   - retain numeric counts in a compact legend/text summary.

4. **Added in the Last 30 Days**
   - keep the large `addedLast30Days` KPI;
   - add a compact **area sparkline** showing daily item creation during the rolling last 30 days.

---

## Row 2 — Existing distributions

### Items by Category

Replace the current custom horizontal bars with an interactive **Treemap**.

Requirements:

- preserve the current category-distribution semantics;
- the distribution continues to represent the complete inventory even when a category filter is active;
- keep the six largest categories;
- keep `Other`;
- if the selected category is outside the leading categories, keep it visible as currently implemented;
- visually indicate the active category where practical;
- clicking a real category applies the existing `?categoryId=<id>` Dashboard filter;
- `Other` is not a filter target;
- preserve an equivalent keyboard-accessible way to select visible categories;
- do not rely on mouse-only chart interaction.

The existing category selector at the top of the Dashboard remains.

### Condition Breakdown

Replace the current custom horizontal bars with a **Donut chart**.

Requirements:

- use the current scoped condition data;
- preserve normalization of condition values;
- preserve `Not specified`;
- preserve top-five + `Other` grouping;
- show counts in the legend/tooltip;
- handle zero/empty data cleanly.

---

## Row 3 — New Dashboard analytics

Add two new metric groups.

### 1. Inventory Field Coverage

Add a **Radar chart** that shows how completely commonly useful item fields are populated.

This is a field-coverage visualization, NOT a single quality score.

Do not calculate or display an arbitrary combined `73/100` completeness score.

Use six axes:

- Photos
- Placement
- Condition
- Purchase Date
- Purchase Price
- Serial Number

For the currently selected Dashboard scope, calculate the percentage of items satisfying each axis.

Definitions:

#### Photos

Item has at least one photo.

#### Placement

Item is considered placed when either:

- it is inside a container; or
- it is not inside a container and has a non-empty saved Location.

Use the current Placement semantics.

#### Condition

Trimmed `condition` is non-empty.

#### Purchase Date

A valid stored purchase date is present.

#### Purchase Price

A purchase price is considered present only when the stored purchase-price data is sufficiently complete to be meaningfully displayed by the existing application.

Reuse current purchase-price field semantics/validation rather than inventing a second interpretation.

#### Serial Number

Trimmed serial number is non-empty.

Return both count and percentage for each field so tooltips/text can show values such as:

```text
Photos: 82% (164 / 200)
Serial Number: 37% (74 / 200)
```

If the scope contains zero items, render a normal empty/zero state instead of a broken radar chart.

---

### 2. Items by Location

Add an **Items by Location** card using a horizontal distributed bar chart.

This chart must use **effective location**, not only the item's raw saved `location`.

Follow the application's existing effective-location inheritance behavior.

Examples:

```text
Camera -> stored inside Camera Box -> Camera Box location = Office
```

The Camera counts under `Office`.

For deeper nesting, inherit through the container chain according to the existing application rules.

Requirements:

- current Dashboard category scope applies;
- trim location text;
- group location values case-insensitively;
- preserve a stable human-readable label;
- group leading locations and avoid producing an unbounded chart;
- show up to 7 leading concrete locations;
- combine remaining concrete locations into `Other`;
- items with no effective location become `Unknown` / localized equivalent;
- order concrete locations by count descending with deterministic tie-breaking;
- show numeric counts in tooltip and/or labels.

Do not change the stored item location while calculating this metric.

Do not change the existing Placement metric semantics. Placement continues to classify by the current saved-parent/saved-location logic; the new Location chart is the metric that uses effective inherited location.

---

## Added-in-Last-30-Days Time Series

Extend the Dashboard response with a daily series for the same rolling 30-day period used by `addedLast30Days`.

Conceptual response:

```json
{
  "addedLast30Days": 37,
  "recentActivity": [
    { "date": "2026-08-27", "count": 0 },
    { "date": "2026-08-28", "count": 3 }
  ]
}
```

Requirements:

- return one bucket per calendar day;
- include zero-count days;
- use a stable chronological order;
- keep time semantics consistent with the existing Dashboard/SQLite UTC behavior;
- the sum of the returned daily buckets must equal `addedLast30Days` for the same scope and rolling window.

Do not introduce historical inventory snapshots or background aggregation jobs.

---

## Dashboard API

Continue using the existing endpoint:

```http
GET /api/dashboard
GET /api/dashboard?categoryId=<id>
```

Do not create separate requests for every chart.

Extend the existing response with data needed for:

```text
recentActivity
fieldCoverage
locationDistribution
```

Exact response shape may differ if there is a cleaner structure, but keep it explicit and stable.

Existing response fields should remain compatible unless there is a strong implementation reason to change them.

The category filter must continue to scope:

- Total Items
- Photo Coverage
- Placement
- Added Last 30 Days
- Recent Activity
- Condition Breakdown
- Inventory Field Coverage
- Items by Location

`Items by Category` keeps its current global-inventory behavior and only reflects/highlights the selected category.

---

## Backend Architecture

Keep the existing architecture:

```text
route
  -> DashboardService
    -> DashboardRepository
```

Relevant files currently include:

```text
server/src/services/dashboardService.js
server/src/repositories/dashboardRepository.js
client/src/pages/Dashboard.vue
```

Requirements:

- SQL remains in repository-level code;
- service code performs presentation/domain grouping where appropriate;
- route handlers must not accumulate chart-specific SQL;
- follow current OOP/SOLID project rules;
- avoid N+1 queries;
- use a small fixed number of aggregate queries;
- parameterize category scope safely.

For effective-location aggregation, reuse the same location inheritance rules already implemented elsewhere in the application.

If a recursive SQL CTE is the cleanest way to aggregate nested effective locations, it is acceptable.

Do not duplicate conflicting effective-location semantics in multiple places.

---

## ApexCharts / Tabler Integration

Use ApexCharts with the current Tabler UI.

Requirements:

- no CDN;
- no runtime dependency on an external chart service;
- prefer the ApexCharts assets/integration already available through the installed Tabler stack;
- if Vite requires a direct `apexcharts` package import, add a compatible pinned dependency rather than loading it remotely;
- do not switch to Chart.js or another charting library in this task.

Use Tabler theme/chart tokens where possible.

Prefer current Tabler chart variables such as the theme-aware chart palette rather than maintaining a separate application palette.

Charts must work correctly in:

- light mode;
- dark mode;
- live theme switching.

Avoid hardcoded light-only backgrounds, grid colors or text colors.

---

## Frontend Chart Lifecycle

Do not place large imperative ApexCharts setup blocks directly throughout `Dashboard.vue`.

Create a small reusable frontend abstraction where practical, for example:

```text
DashboardChart.vue
```

or an equivalent composable/component.

It should handle:

- chart creation;
- chart update when Dashboard data changes;
- resize behavior;
- theme changes;
- destroy/cleanup on component unmount;
- avoiding duplicate chart instances after category refreshes.

Keep chart-specific options near the chart component/configuration instead of scattering them across unrelated code.

Do not over-engineer a generic chart framework for the entire application.

---

## Responsive Behavior

The Dashboard must remain usable at the existing supported widths, including narrow phones.

Desktop target:

```text
Row 1:
[ Total ] [ Photo ] [ Placement ] [ Recent + Sparkline ]

Row 2:
[        Category Treemap        ] [ Condition Donut ]

Row 3:
[        Field Coverage Radar    ] [ Locations Bar  ]
```

On smaller widths:

- cards stack naturally;
- charts resize to available width;
- legends must not force horizontal page scrolling;
- long category/location labels must truncate/wrap safely;
- chart minimum heights must remain readable;
- no horizontal viewport overflow.

Do not require horizontal scrolling to understand the Dashboard.

---

## Accessibility

Charts are supplemental visualization, not the only source of information.

Requirements:

- preserve visible numeric summaries where appropriate;
- tooltips are not the only place where critical values exist;
- interactive category filtering must have a keyboard-accessible equivalent;
- chart containers need useful accessible names;
- empty chart states must be represented as normal text;
- do not hide all values inside inaccessible SVG/canvas output.

---

## Loading, Refresh and Empty States

Preserve the current behavior:

- initial loading state;
- refresh dimming when changing category;
- request cancellation/stale-response protection;
- retry on failure;
- valid empty category;
- completely empty inventory state.

Charts must not flash stale data after a newer category request completes.

When refreshing, update charts together with the rest of the Dashboard response.

When a chart has no meaningful data, show a clean localized empty state rather than an empty chart frame with broken axes/legend.

---

## i18n

All newly introduced visible UI strings must use the existing localization system.

Add English and Ukrainian strings for at least:

- chart titles where new;
- Field Coverage labels;
- Location Distribution labels;
- Unknown;
- Other where not already reusable;
- chart accessible names;
- empty states;
- legend/helper text if introduced.

Do not translate user-entered:

- category names;
- condition values;
- location values.

Use existing locale-aware number formatting.

---

## Styling

The result should look like a native Tabler Dashboard, not a custom analytics product embedded inside Tabler.

Prefer:

- Tabler cards;
- Tabler spacing;
- existing card headers;
- Tabler CSS custom properties;
- theme-aware chart colors;
- compact chart legends;
- restrained visual hierarchy.

Avoid:

- gradients added only for decoration;
- excessive animation;
- 3D charts;
- gauge needles;
- large decorative icons;
- unrelated custom color palettes;
- every chart using a completely different visual language.

The Dashboard should feel more professional without becoming visually noisy.

---

## Performance

The Dashboard must remain practical with thousands of items.

Requirements:

- no N+1 queries;
- no request per chart;
- no fetching all item records into the browser to calculate metrics;
- aggregation happens on the server/database side;
- location inheritance aggregation must be bounded by the existing valid containment model;
- do not add persistent analytics tables or background workers.

---

## Tests

Add/update automated tests.

### Backend

Cover at least:

- existing Dashboard metrics remain correct;
- category filter still scopes existing metrics;
- recent activity returns 30 ordered buckets;
- zero-count days are included;
- recent-activity sum matches `addedLast30Days`;
- field coverage counts and percentages;
- zero-item field coverage;
- location distribution from direct locations;
- inherited effective location;
- multi-level nested effective location;
- child saved location does not incorrectly override inherited container location;
- unknown effective location;
- case-insensitive/trimmed location grouping;
- leading locations + `Other`;
- category-scoped location distribution;
- existing category distribution remains global;
- existing Placement totals still sum to Total Items.

### Frontend / E2E

Cover at least:

- all eight Dashboard metric groups render;
- Photo Coverage radial chart renders;
- Placement stacked visualization renders;
- Recent Activity sparkline renders;
- Category Treemap renders;
- category selection still updates `?categoryId=`;
- keyboard-accessible category filtering works;
- Condition Donut renders;
- Field Coverage Radar renders;
- Items by Location chart renders;
- category filter refreshes all scoped charts;
- empty inventory;
- empty category;
- API error/retry;
- stale response protection;
- light mode;
- dark mode;
- theme switching does not break chart readability;
- no horizontal overflow at existing responsive test widths.

Run existing lint, unit and E2E suites.

---

## Documentation

Update the existing Dashboard documentation.

At minimum update:

```text
docs/features/dashboard.md
```

It must no longer describe the Dashboard as exactly six metric groups with no chart library.

Document:

- the eight resulting metric groups;
- chart presentation;
- field-coverage semantics;
- effective-location distribution;
- recent-activity time semantics;
- category-filter behavior;
- the intentional difference between Placement semantics and effective Location Distribution semantics.

Follow the project's existing documentation/change-log conventions when completing the task.

---

## Acceptance Criteria

The task is complete when:

1. The existing Dashboard is upgraded using Tabler + ApexCharts.
2. Total Items remains a clear numeric KPI.
3. Photo Coverage uses a radial percentage chart with textual counts.
4. Placement uses a 100% stacked visualization while preserving current placement semantics.
5. Added Last 30 Days includes a daily 30-day area sparkline.
6. Items by Category uses an interactive Treemap and preserves the existing category-filter behavior.
7. Condition Breakdown uses a Donut chart and preserves current grouping semantics.
8. A new Field Coverage Radar shows Photos, Placement, Condition, Purchase Date, Purchase Price and Serial Number coverage.
9. Field Coverage is not collapsed into an arbitrary overall score.
10. A new Items by Location chart groups items by effective inherited location.
11. Location aggregation correctly handles nested containers and unknown locations.
12. The current category scope applies to every scoped metric and chart.
13. Category Distribution remains based on the complete inventory as before.
14. The Dashboard continues to use one aggregate API request.
15. No N+1 aggregation or client-side full-inventory analytics are introduced.
16. Charts work in light and dark modes and after live theme switching.
17. Charts remain responsive on desktop, tablet and narrow phones.
18. Critical values remain accessible outside chart-only interaction.
19. Existing loading, refresh, empty, retry and stale-response behavior is preserved.
20. English/Ukrainian localization is complete.
21. Existing Dashboard behavior remains covered and the new analytics receive automated test coverage.
22. Dashboard documentation is updated to match the implementation.

---

## Out of Scope

Do not add in this task:

- total inventory monetary value;
- currency conversion;
- purchase-value charts;
- historical inventory snapshots;
- month-over-month/year-over-year historical analytics;
- user-configurable Dashboard widgets;
- drag-and-drop Dashboard layout;
- Dashboard layout persistence;
- new Dashboard filters beyond the existing category scope;
- external analytics services;
- chart CDN dependencies;
- background analytics jobs;
- Chart.js migration;
- export-to-PDF/reporting features.
