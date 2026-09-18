# Application UI: Tabler shell, navigation, and colour modes

## Summary

Every route shares one application shell built on the [Tabler](https://tabler.io) design system:
a folded icon sidebar that expands on hover and on keyboard focus on desktops, an offcanvas
navigation drawer below the `lg` breakpoint, and a light/dark colour-mode switch. Inside the shell,
the items list, the item details page, the item form, the category manager, and the data page use
Tabler page headers, cards, tables, forms, badges, pagination, and empty states.

Tabler ships Bootstrap 5 itself, so Bootstrap is no longer a separate dependency and is present
exactly once in the bundle. No new data, routes, or item operations were introduced; this is a
presentation layer over the existing API, and no CDN or other runtime internet dependency was added.

## User-visible behaviour

### Desktop navigation

- From the Tabler `lg` breakpoint (`992px`) upwards the sidebar rests as a `4rem` icon rail showing
  the product mark and one Tabler icon per destination: **Items**, **Categories & Fields**, and
  **Data / Backup**.
- Hovering the rail expands it to `16rem` and reveals the labels and the product name. Tabler's own
  `:has(:focus-visible)` rule expands it for keyboard users too, so tabbing into the sidebar shows
  the same labels without any pointer.
- The expanded sidebar is fixed and overlays the page; only the folded width reserves space, so
  expanding never shifts the content sideways.
- The open destination is highlighted in both the folded and the expanded state and carries
  `aria-current="page"`. Every entry has an icon, a label, and a `title` tooltip for the folded rail.

### Mobile navigation

- Below `lg` the sidebar is replaced by a sticky top bar with a hamburger button, the product name,
  and the colour-mode buttons. Hover navigation is never used at this size.
- The hamburger opens the same navigation in an offcanvas drawer from the left, with a backdrop.
- The drawer closes on selection, on backdrop click, and with `Escape`. Opening it moves the focus to
  its close button and keeps the focus inside the drawer; closing it returns the focus to the
  hamburger button. The page behind it does not scroll, and nothing overflows horizontally.

### Light and dark mode

- Two buttons, **Light mode** and **Dark mode**, sit in the sidebar footer on desktops and in the top
  bar on narrow screens. The active one is pressed (`aria-pressed`).
- On a first visit the application follows the operating system's `prefers-color-scheme`.
- An explicit choice is stored in `localStorage` under `inventory-atlas-theme` and wins over the
  system preference on every later visit. It is client-side state only: no API call, no schema
  change.
- The inline script in `index.html` sets `data-bs-theme` on `<html>` before the bundle loads, so a
  stored dark mode never flashes light during startup.
- Tables, forms, alerts, badges, the drawer, photo frames and placeholders, borders, empty states,
  and the destructive actions all follow the mode, because the application stylesheet only uses
  Tabler custom properties.

### Items list

- A Tabler page header shows the title **Items**, the total item count as the page subtitle, and the
  primary **Add item** action.
- One card groups the labelled **Search**, **Category**, **Sort by**, and **Direction** controls.
  Search keeps its 250 ms debounce, and changing a filter resets to the first page.
- From `lg` upwards the results are a Tabler `card-table` with the Photo, Name, Category, Condition,
  Location, **Stored inside**, and Actions columns. Location and Stored inside become their own
  columns from `xl` (`1200px`); between `lg` and `xl` the same two values sit under the item name so
  the table stays readable. A long value is truncated with its full text in the `title` attribute,
  and the container is a link to its own page. Each row carries **View** and **Edit** links whose
  accessible names include the item name.
- Below `lg` each item is a card with a thumbnail, the name as the primary line, the category, the
  container when the item is stored inside another one, the condition and location when present, and
  full-width **View** and **Edit** buttons of at least `44px`.
- Pagination uses Tabler's pagination component with Previous/Next, their disabled states, and the
  `Page x of y` indicator.
- An empty inventory shows a Tabler empty state, *No items yet* with an **Add your first item**
  action; a search or filter with no result shows *No matching items* instead. Loading shows a
  spinner card, so the layout does not jump.

### Item details

- The page starts with a Tabler breadcrumb (**All items** / category), the item name as the only
  `h1`, and the **Edit** and **Delete** actions, with deletion keeping its confirmation.
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

The item form, **Categories & Fields**, and **Data / Backup** use the same page header, Tabler cards,
card titles, form controls, input groups, and badges. The category manager keeps its two-panel
desktop workflow and stacks the panels on phones; its row actions wrap instead of squeezing the
category name.

## Implementation overview

- `index.html` carries the pre-paint colour-mode script. `client/src/theme.js` holds the shared
  reactive value, writes `data-bs-theme`, and persists the choice; both use the same storage key.
- `client/src/App.vue` is the Tabler `.page` shell only. The mobile header lives inside
  `.page-wrapper`, because a horizontal navbar directly under `.page` makes Tabler hide the vertical
  sidebar.
- `client/src/components/AppSidebar.vue` is a plain Tabler
  `navbar navbar-vertical navbar-expand-lg navbar-folded-hover`; the folding, the hover and focus
  expansion, and the transition are Tabler's own CSS, not a custom implementation.
- `client/src/components/AppMobileNav.vue` owns the mobile header and the drawer, including the
  scroll lock, the `Escape` handler, the focus handling, and closing on route change. Bootstrap's
  offcanvas markup is driven by Vue state; no Bootstrap or Tabler JavaScript bundle is loaded.
- `client/src/navigation.js` is the single source of truth for the navigation entries, their icons,
  and the active-route rule. `RouterLink` alone would mark `/` active everywhere, so the match is
  explicit.
- `client/src/components/` also holds `AppNavigation.vue`, `AppBrand.vue`, `ThemeToggle.vue`,
  `PageHeader.vue`, `ItemThumbnail.vue`, `ItemResults.vue` (the table and the card list built from
  the same item data), and `ItemPhotoViewer.vue`.
- Icons come from `@tabler/icons-vue` as named imports, so only the used icons are bundled.
- `client/src/style.css` is small and defines every colour through a Tabler custom property. It keeps
  the brand mark, the thumbnail and photo frames, the truncating table cells, the mobile item cards,
  and the drawer navigation tokens that Tabler only defines inside its desktop vertical navbar.
- The thumbnail is a fixed frame with `overflow: hidden`, so a photo that fails to load cannot
  stretch a row.
- `vite.config.js` sets `esbuild.legalComments: 'inline'` so the MIT copyright banners of Tabler and
  Tabler Icons survive minification into the production bundles.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- `test/e2e/theme.spec.js` covers the system preference on a first visit with every script blocked
  (which is what proves there is no theme flash), an explicit choice overriding it, and the choice
  surviving a reload and a route change.
- `test/e2e/navigation.spec.js` covers reaching every page, `aria-current` on the active link, and
  the folded rail expanding on hover and on `Tab` focus without moving the page content.
- `test/e2e/responsive.spec.js` covers, at `390 × 844`: the offcanvas drawer opening, navigating,
  closing with `Escape`, and restoring focus; the card list replacing the table; the name appearing
  above the photo and the photo above the details; multi-photo navigation and photo deletion; and the
  no-photo state.
- Every route was rendered and inspected in Chromium in both colour modes at `1440`, `1024`, `768`,
  `390`, and `320` pixels. No page scrolls horizontally in any of those combinations, and the browser
  console stays free of errors and warnings.
- The built stylesheet contains one Bootstrap copy (a single Tabler banner and variable set) and
  references only `data:` URLs, so the application runs with network access disabled.

## Notes and limitations

- Tabler is the design system and all dependencies stay local; Tabler's own JavaScript bundle is not
  loaded, because the application uses no Bootstrap JavaScript component.
- Tabler's full stylesheet is bundled as shipped (about 80 kB gzipped); it is not subset per page.
- The repository still has no logo image, so the brand is an inline SVG mark drawn in `currentColor`
  next to the product name.
- The items API does not distinguish an empty inventory from an empty result, so the two empty states
  are told apart from the active search and category filter on the client.
- The `lg` breakpoint switches both the navigation and the results between their desktop and mobile
  forms; there is no intermediate simplified table.
- Colour mode offers Light and Dark only; there is no "follow the system from now on" reset in the
  interface once an explicit choice has been made.
