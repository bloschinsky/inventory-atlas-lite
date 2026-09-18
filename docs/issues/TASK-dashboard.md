# Codex Task: Implement the Inventory Dashboard

## Status

- **Priority:** High
- **Type:** Full-stack feature
- **Dependency:** `TASK-tabler-ui-migration.md` must be completed first
- **Blocked until:** The Tabler migration, Folded hover application shell, responsive navigation, and light/dark modes satisfy their acceptance criteria

## Objective

Add a concise, useful Dashboard to Inventory Atlas Lite using only real information already available in the current SQLite database.

The Dashboard must answer three practical questions without becoming an analytics product:

1. How large is the inventory?
2. How completely is it documented?
3. How well is it physically organized?

Use no more than six metric groups. Reuse the completed Tabler design system and application shell from the prerequisite task.

## Dashboard Metrics

Implement exactly these six metric groups:

### 1. Total items

Show the number of items in the currently selected dashboard scope.

- With no category selected, count all items.
- With a category selected, count only items in that category.
- Containers are normal items and are included in the count.

### 2. Photo coverage

Show inventory documentation coverage as:

- number of scoped items with at least one photo;
- percentage of scoped items with at least one photo;
- number of scoped items without a photo.

Count items, not individual photos. An item with multiple photos contributes `1` to the covered-item count.

If the scope contains no items, return and display `0%`, not `NaN` or an error.

### 3. Placement status

Show a mutually exclusive breakdown of scoped items using this precedence:

1. **Inside a container:** `parent_item_id IS NOT NULL`.
2. **Direct location:** no parent item and a non-empty trimmed `location` value.
3. **Unplaced:** no parent item and no non-empty location value.

The three counts must always add up to Total items. An item inside a container belongs only to **Inside a container**, even if its own legacy `location` field contains text.

### 4. Added in the last 30 days

Show the number of scoped items whose `created_at` value falls within the rolling last 30 days.

- Use a consistent server-side time calculation.
- Document the timestamp/UTC assumption used by the existing application.
- Do not create historical snapshot tables or event tracking for this metric.

### 5. Items by category

Show a compact horizontal distribution of item counts by category.

- This distribution remains based on the complete inventory even when a category filter is selected, so it continues to provide context.
- Clearly label it as an all-inventory distribution when the rest of the Dashboard is filtered.
- Visually highlight the selected category.
- Show the six largest categories and combine the remaining non-zero categories into **Other**.
- If the selected category is outside the largest six, also show it explicitly rather than hiding it inside **Other**.
- Include a sensible **Uncategorized** group when items have no category.
- Clicking a visible category applies that category as the Dashboard filter.
- Do not display empty categories unless one is the active selected filter.

### 6. Condition breakdown

Show a compact horizontal distribution of condition values within the current scope.

- Trim surrounding whitespace.
- Group values case-insensitively so, for example, `Good`, `good`, and ` GOOD ` do not become separate groups.
- Use a stable human-readable label for each normalized group.
- Group blank or null values under **Not specified**.
- Show the five largest conditions and combine the rest into **Other**.

## Filtering

Add one global **Category** filter and a **Reset** action.

- The default value is **All categories**.
- The selected category applies to Total items, Photo coverage, Placement status, Added in the last 30 days, and Condition breakdown.
- Items by category remains an all-inventory comparison as defined above and highlights the current selection.
- Represent filter state in the URL query string, for example `/dashboard?categoryId=12`, so reloads and copied links preserve the view.
- Validate the filter server-side. Follow existing API error conventions for malformed or unknown category IDs.
- A valid category with zero items must produce a normal zero-data Dashboard, not an error.

Do not add text search, item sorting, sort direction, location filtering, date pickers, or custom-field filters in this first Dashboard version. Those controls are useful for an item list but would make the initial Dashboard unnecessarily complex.

## Backend API

Create a dedicated aggregate endpoint:

```http
GET /api/dashboard
GET /api/dashboard?categoryId=12
```

Calculate aggregates directly in SQLite with efficient aggregate queries. Do not fetch every item or reuse the paginated item-list response and calculate metrics in Vue.

Return one response containing all Dashboard data so the page does not require a separate request for every card. A recommended response shape is:

```json
{
  "scope": {
    "categoryId": 12,
    "categoryName": "Cameras"
  },
  "totalItems": 24,
  "photoCoverage": {
    "withPhotos": 18,
    "withoutPhotos": 6,
    "percentage": 75
  },
  "placement": {
    "insideContainer": 10,
    "directLocation": 9,
    "unplaced": 5
  },
  "addedLast30Days": 4,
  "categoryDistribution": [
    {
      "categoryId": 12,
      "label": "Cameras",
      "count": 24,
      "selected": true
    }
  ],
  "conditionDistribution": [
    {
      "key": "good",
      "label": "Good",
      "count": 14
    }
  ]
}
```

The exact internal implementation may follow existing server conventions, but the semantics above must remain stable and be covered by tests.

Requirements:

- Use parameterized SQL for all filter values.
- Avoid double-counting items when joining photos or custom field tables.
- Add an index only when query-plan inspection or a realistic test dataset demonstrates that the existing indexes are insufficient.
- Do not introduce a new analytics table or scheduled aggregation process.

## Client Route and Navigation

- Add a `/dashboard` route.
- Add **Dashboard** as the first main navigation item with an appropriate Tabler icon.
- Make Dashboard the default application landing page. Redirect `/` to `/dashboard` while preserving all existing item routes and deep links.
- Reuse the application shell, Folded hover sidebar, mobile offcanvas navigation, page-header conventions, and theme behavior created by the prerequisite task.
- Add an **Add item** primary action in the Dashboard page header if this matches the existing route/action conventions.

## Dashboard Layout

Use a restrained Tabler layout:

### Header and toolbar

- Page title: **Dashboard**.
- Short description explaining that the page summarizes the inventory.
- Category filter and Reset action.
- Optional existing Add item action.

### Primary metrics

Use four responsive KPI cards:

1. Total items.
2. Photo coverage.
3. Placement status.
4. Added in the last 30 days.

Photo coverage and Placement status may use compact progress bars or segmented values inside their cards. Every visual encoding must also include readable numeric values.

### Distributions

Below the KPI cards, use two wider cards:

1. Items by category.
2. Condition breakdown.

Use Tabler cards, progress bars, badges, and CSS-based horizontal bars. Do not add ApexCharts or another chart library for this version.

### Responsive behavior

- Use a multi-column layout on desktop.
- Collapse cards into a clear single-column reading order on phones.
- Keep filter controls usable at 320 px width.
- Do not introduce horizontal page scrolling.
- Preserve the same information hierarchy and all values in light and dark modes.

## States and Interaction

Implement intentional states for:

- initial loading;
- filter changes;
- empty database;
- selected category with zero items;
- API failure;
- retry after failure.

Requirements:

- Do not show stale metrics under a newly selected filter while a request is in progress unless the UI clearly indicates that it is refreshing.
- Prevent slower earlier requests from overwriting the result of a newer filter selection.
- Empty states should guide the user toward adding the first item where appropriate.
- Category bars and interactive cards must work with keyboard input and expose meaningful accessible labels.

## Documentation and Repository Workflow

- Update the project How-To/current-state documentation with Dashboard usage and category filtering.
- Update the implemented-features documentation and its index according to repository rules.
- If required by `AGENTS.md`, remove this completed task file after implementation and record the completed work in the appropriate implemented-feature document.
- Do not remove or rewrite documentation for the Tabler migration.

## Non-Goals

- No time-series charts or historical inventory snapshots.
- No total database-size metric.
- No raw total-photo count as a primary metric.
- No custom-field count or average-field-completeness score.
- No separate container-count KPI.
- No backup-health metric.
- No activity feed.
- No monetary value, stock-level, assignment, warranty, QR/barcode, user, or notification metrics.
- No charting library.
- No changes to the meaning of existing item data.

## Automated Tests

Add server/API tests covering at least:

- an empty database;
- all items without photos;
- items with one and multiple photos without double-counting;
- all three mutually exclusive placement states;
- recent and older items around the 30-day boundary;
- category-filtered totals;
- a valid empty category;
- malformed and unknown category IDs;
- uncategorized items;
- case and whitespace normalization for condition values;
- top-category/top-condition truncation and **Other** grouping;
- the invariant that placement counts equal Total items.

Add client tests where the current project test setup supports them, covering at least:

- successful rendering;
- category-filter URL synchronization;
- Reset behavior;
- loading, empty, and error states;
- protection from out-of-order filter responses.

Extend the existing acceptance test to verify the Dashboard endpoint and page without weakening existing item, photo, nested-container, backup, or restore checks.

## Verification

The agent must:

1. Run the full existing and new automated test suite.
2. Run the production build successfully.
3. Run the project acceptance flow against the live server.
4. Verify representative populated, empty, and filtered Dashboard states.
5. Verify the page in light and dark modes.
6. Verify desktop Folded hover navigation and mobile offcanvas navigation.
7. Verify the page at approximately 1440 px, 768 px, 390 px, and 320 px widths.
8. Confirm that no runtime CDN or internet dependency was added.
9. Check the browser console and server logs for new warnings or errors.

## Acceptance Criteria

- The prerequisite Tabler migration is complete before Dashboard work begins.
- `/dashboard` exists, is the default landing page, and appears first in navigation.
- The Dashboard shows exactly the six defined metric groups using real SQLite data.
- The global category filter has the documented scope and is reflected in the URL.
- All scoped counts are calculated server-side through a dedicated aggregate endpoint.
- Photo coverage counts items rather than photo rows.
- Placement groups are mutually exclusive and always sum to Total items.
- Category and condition distributions use the defined normalization and grouping behavior.
- Empty, loading, error, retry, and zero-result states are usable.
- The Dashboard uses the established Tabler shell and works in light and dark modes.
- The layout is readable and free of horizontal overflow on required desktop and mobile widths.
- No charting dependency or unrelated product feature is introduced.
- Existing application behavior remains intact.
- Automated tests, production build, and acceptance flow pass.
- Relevant project documentation is updated.
