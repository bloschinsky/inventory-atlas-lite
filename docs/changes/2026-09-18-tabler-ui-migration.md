# Tabler UI design system migration

- **Completed:** 2026-09-18
- **Version:** 0.7.0
- **Task file:** `docs/issues/TASK-tabler-ui-migration.md` (completed and removed)

## What was implemented

The client's presentation layer moved from direct Bootstrap 5 styling to the Tabler design system,
without any change to routes, workflows, the API, or the SQLite schema.

### Dependencies

- Added `@tabler/core@1.5.1` and `@tabler/icons-vue@3.46.0` as pinned dependencies and updated the
  lockfile.
- Removed the standalone `bootstrap` dependency and its CSS import. Tabler already ships Bootstrap,
  so the bundle now contains exactly one copy.
- Only `@tabler/core/dist/css/tabler.min.css` is imported. No Tabler JavaScript bundle is loaded,
  because the application uses no Bootstrap JavaScript component; nothing is fetched from a CDN.
- Icons are named imports from `@tabler/icons-vue`, so only the used icons are bundled.
- `vite.config.js` sets `esbuild.legalComments: 'inline'` so the MIT copyright banners of Tabler and
  Tabler Icons survive minification into the production bundles.

### Application shell

- `client/src/App.vue` is now only the Tabler `.page` shell. The mobile header sits inside
  `.page-wrapper`, because a horizontal navbar directly under `.page` makes Tabler hide the vertical
  sidebar.
- New `client/src/components/AppSidebar.vue` is a stock Tabler
  `navbar navbar-vertical navbar-expand-lg navbar-folded-hover`: a `4rem` icon rail that expands to
  `16rem` on hover and, through Tabler's `:has(:focus-visible)` rule, on keyboard focus. It is fixed,
  so expanding never shifts the page content.
- New `client/src/components/AppMobileNav.vue` owns the mobile header and the offcanvas drawer,
  keeping the existing scroll lock, `Escape` handling, focus trap, focus restore, and close-on-
  navigation behaviour.
- New `client/src/components/AppBrand.vue` renders an inline SVG mark in `currentColor` plus the
  product name; the repository has no logo image, and the mark stays readable in both colour modes
  and in the folded rail.
- `client/src/navigation.js` now also carries a Tabler icon per entry and remains the single source
  of truth for the navigation and the active-route rule.

### Light and dark modes

- New `client/src/theme.js` holds the shared reactive mode, writes `data-bs-theme` on `<html>`, and
  persists the choice in `localStorage` under `inventory-atlas-theme`.
- `index.html` gained an inline script that resolves the stored choice, or the operating system's
  `prefers-color-scheme` when there is none, and applies it before the bundle paints, so a stored
  dark mode never flashes light.
- New `client/src/components/ThemeToggle.vue` provides explicit **Light mode** and **Dark mode**
  buttons, stacked in the sidebar footer and side by side in the mobile header.

### Screens

- `PageHeader.vue` is a Tabler page header with `page-title` and `page-subtitle`.
- The items list uses a Tabler `card-table`, the Tabler pagination component, and a Tabler empty
  state; the item details page uses a Tabler breadcrumb; section headings use `card-title`; badges
  use `bg-blue-lt`; alerts carry `role="alert"`.
- `client/src/style.css` was reduced to application-specific surfaces only. Every colour now comes
  from a Tabler custom property, so both colour modes are correct. The Bootstrap-era design tokens,
  shell layout, and card/table overrides were deleted.

## Verification

- `npm run lint`, `npm test` (16 passed, 1 skipped), `npm run build`, and `npm run test:e2e`
  (**16 passed**) all succeed.
- New `test/e2e/theme.spec.js` covers the system preference on a first visit with every script
  blocked, an explicit choice overriding it, and that choice surviving a route change and a reload.
- `test/e2e/navigation.spec.js` gained a case asserting the folded rail, its expansion on hover and
  on `Tab` focus, and that the page content does not move while it expands.
- Every route was rendered in Chromium in both colour modes at 1440, 1024, 768, 390, and 320 pixels,
  plus the open mobile drawer. No horizontal page overflow in any combination, and the browser
  console stayed free of errors and warnings.
- The built stylesheet was inspected: one Tabler/Bootstrap banner and variable set, no `@import`, and
  only `data:` URLs, so the application runs with network access disabled.

## Documentation

- Replaced `docs/features/responsive-ui.md` with `docs/features/application-ui.md` describing the
  resulting shell, navigation, colour modes, and screens, and updated `docs/features/README.md`.
- Updated `docs/features/playwright-e2e-tests.md` with the new and extended specs.
- Updated `docs/HOW-TO.md` with the folded sidebar, the hover/keyboard behaviour, and the colour-mode
  switch.
- Updated `AGENTS.md` for the Tabler stack and the new client files.
- Updated `docs/ROADMAP.md`: the Tabler entry is gone and the Dashboard is no longer blocked.
- Removed the completed `docs/issues/TASK-tabler-ui-migration.md`.
