# Responsive application shell and page layout

## Summary

Every route shares one responsive shell: a persistent sidebar on large screens and a compact top bar
with an offcanvas menu below them. Inside the shell, the items list, the item details page, the item
form, the category manager, and the data page use the same Bootstrap 5 cards, spacing, typography,
and button hierarchy. The layout is designed for phones and desktops separately instead of scaling
one desktop page down.

No new data, routes, or item operations were introduced; this is a presentation layer over the
existing API.

## User-visible behaviour

### Navigation

- At the Bootstrap `lg` breakpoint (`992px`) and above, a sidebar of `244px` is pinned to the
  viewport. It shows the product name and the three existing destinations: **Items**,
  **Categories & Fields**, and **Data / Backup**. The open destination is highlighted and carries
  `aria-current="page"`.
- Below `lg`, the sidebar is replaced by a sticky top bar with a hamburger button and the product
  name. The button opens the same navigation in a Bootstrap offcanvas panel from the left.
- The panel closes on selection, on backdrop click, and with `Escape`. Opening it moves the focus to
  its close button and keeps the focus inside the panel; closing it returns the focus to the
  hamburger button. The page behind the panel does not scroll while it is open.

### Items list

- A page header shows the title **Items**, the total item count, and the primary **Add item** action.
- One toolbar card groups the labelled **Search**, **Category**, **Sort by**, and **Direction**
  controls. Search keeps its 250 ms debounce, and changing a filter resets to the first page.
- From `lg` upwards the results are a compact table with the Photo, Name, Category, Condition,
  Location, and Actions columns. A long location is truncated with its full value in the `title`
  attribute. Each row carries **View** and **Edit** links whose accessible names include the item
  name.
- Below `lg` each item is a card with a thumbnail, the name as the primary line, the category, the
  condition and location when present, and full-width **View** and **Edit** buttons of at least
  `44px`.
- Pagination keeps Previous/Next with disabled states and the `Page x of y` indicator.
- An empty inventory shows *No items yet* with an **Add your first item** action; a search or filter
  with no result shows *No matching items* instead. Loading shows a spinner card, so the layout does
  not jump.

### Item details

- The page starts with the breadcrumb (**All items** / category), the item name as the only `h1`,
  and the **Edit** and **Delete** actions, with deletion keeping its confirmation.
- From `lg` upwards the content is two columns: the photo viewer on the left (`5/12`) and the
  information cards on the right (`7/12`). On phones the order is strictly: name, actions, photo,
  details, custom fields, storage, record information.
- The photo viewer shows one contained image (`object-fit: contain`), **Previous**/**Next** and a
  `current / total` indicator when the item has more than one photo, the filename, and a separate
  **Delete photo** action. Items without photos get a placeholder frame of the same size.
- Information is grouped into **Details** (condition, location, description), a card with the
  category's custom fields, **Storage** (parent link and the direct contents), and
  **Record information** (UUID, created, updated). The custom-field and storage cards are omitted
  when the item has no custom fields and takes no part in nesting.

### Other pages

The item form, **Categories & Fields**, and **Data / Backup** use the same header, cards, and section
titles. The category manager keeps its two-panel desktop workflow and stacks the panels on phones;
its row actions wrap instead of squeezing the category name.

## Implementation overview

- `client/src/navigation.js` is the single source of truth for the navigation entries and for the
  active-route rule. `RouterLink` alone would mark `/` active everywhere, so the match is explicit.
- `client/src/App.vue` holds the shell: sidebar, mobile top bar, and the offcanvas state, including
  the scroll lock, the `Escape` handler, the focus handling, and closing on route change. Bootstrap's
  offcanvas markup is used with Vue state; Bootstrap's JavaScript bundle is not loaded.
- `client/src/components/` holds the shared pieces: `AppNavigation.vue`, `PageHeader.vue`,
  `ItemThumbnail.vue`, `ItemResults.vue` (the table and the card list built from the same item data),
  and `ItemPhotoViewer.vue`.
- `client/src/style.css` carries the design tokens (background, surface, border, muted text, radius,
  shadow, sidebar width) and the shell, thumbnail, and photo-frame rules. Page-specific styling stays
  in Bootstrap utility classes.
- The thumbnail is a fixed frame with `overflow: hidden`, so a photo that fails to load cannot
  stretch a row.
- `prefers-reduced-motion: reduce` shortens transitions and animations to a hair.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- `test/e2e/responsive.spec.js` covers, at `390 × 844`: the offcanvas menu opening, navigating,
  closing with `Escape`, and restoring focus; the card list replacing the table; the name appearing
  above the photo and the photo above the details; multi-photo navigation and photo deletion; and the
  no-photo state. `navigation.spec.js` additionally asserts `aria-current` on the active link.
- Every page was rendered and inspected in Chromium at `1440`, `1024`, `768`, `390`, and `360` pixels
  and at `200%` zoom, with a long item name, a long category and location, an empty description, many
  custom fields, no photo, several photos, and nested contents. No page scrolls horizontally.

## Notes and limitations

- Bootstrap 5 remains the design system and all dependencies stay local; no icon library, CSS
  framework, or CDN was added. The only icon is an inline hamburger SVG.
- There is no dark mode and no logo asset in the repository, so the sidebar and the mobile bar show
  the product name as text.
- The items API does not distinguish an empty inventory from an empty result, so the two empty states
  are told apart from the active search and category filter on the client.
- The `lg` breakpoint switches the results between the table and the cards; there is no intermediate
  simplified table.
