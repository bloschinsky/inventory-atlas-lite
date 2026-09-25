# Dashboard charts and analytics

- **Completed:** 2026-09-25
- **Version:** 0.36.0

## Summary

- The Dashboard is drawn with ApexCharts 7.0.0 from the copy Tabler already ships in
  `@tabler/core/dist/libs/apexcharts`. It is loaded with a dynamic `import()` as a separate chunk;
  `vite.config.js` pre-bundles the UMD file for the development server. No dependency or CDN was
  added.
- Row 1 keeps the four KPI cards: Total items stays numeric, Photo coverage becomes a radial gauge
  with the text counts, Placement status becomes a 100% stacked bar with a counted legend, and Added
  in the last 30 days gains a daily area sparkline.
- Row 2: Items by category becomes a treemap of the whole inventory in which a click on a real
  category applies `?categoryId=`; a row of keyboard-operable category buttons with counts replaces
  the old bars, and the selected category keeps the primary color while the others turn neutral.
  Condition breakdown becomes a donut with the scope total and a counted legend.
- Row 3 adds two metric groups: Field coverage (a radar chart plus a `82% (164 / 200)` list for
  Photos, Placement, Condition, Purchase date, Purchase price, and Serial number, with no combined
  score) and Items by location (a horizontal distributed bar chart of the inherited effective
  location, seven leading groups, Other, and Unknown).
- `GET /api/dashboard` keeps its existing fields and adds `recentActivity`, `fieldCoverage`, and
  `locationDistribution`. The service reads the clock once per request, so the 31 daily buckets of
  the rolling window (the partial first UTC day through today) always add up to `addedLast30Days`.
- `DashboardRepository` computes the new counts in the existing aggregate statement plus two new
  grouped statements; the location query reuses `ROOTS_CTE`, now exported by `ItemRepository`, so the
  Dashboard and the Items list share one effective-location rule. `DashboardService` builds the
  buckets and groups locations case-insensitively.
- New client pieces: `client/src/dashboardCharts.js` (loading, Tabler color resolution for the active
  mode, per-chart options) and `client/src/components/DashboardChart.vue` (one chart instance per
  component: create, update in place, destroy). Charts are redrawn on a live theme switch, every chart
  is a named `role="img"` that includes its values, and chart cards clip a drawing while a resize
  settles so the page never scrolls sideways.
- English and Ukrainian strings were added for the new titles, field names, Unknown, empty states,
  and chart names.
- Documentation: `docs/features/dashboard.md` rewritten for the eight groups, the chart presentation,
  the field-coverage and effective-location semantics, the recent-activity time semantics, and the
  Placement versus Location difference; updates to `docs/HOW-TO.md`, `docs/features/README.md`,
  `docs/features/effective-location-inheritance.md`, `AGENTS.md`, `docs/ROADMAP.md`, and the release
  history. The completed task file was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 143 tests: 142 passed, 1 skipped (shellcheck is not installed locally), including the new
  service tests for the rolling window, field coverage, and effective-location distribution, and the
  extended HTTP checks in `test/dashboard.test.js`.
- `npm run build` — passed; ApexCharts is emitted as its own chunk.
- `npm run test:e2e` — 90 passed, including the extended `test/e2e/dashboard.spec.js` (all eight groups and seven
  charts, scoped chart values, treemap and keyboard filtering, empty states, error and retry, stale
  responses, a live theme switch, and overflow at 1440, 768, 390, and 320 pixels).
- Manual check against a seeded temporary database of 104 items in a production build at 1440, 390,
  and 320 pixels, in light and dark mode, after a live theme switch, with a category filter, and in
  Ukrainian: no console errors and no horizontal overflow.
