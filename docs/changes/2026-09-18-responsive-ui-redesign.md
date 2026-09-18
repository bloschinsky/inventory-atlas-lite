# Responsive UI redesign

- **Completed:** 2026-09-18
- **Version:** 0.6.0

## Summary

The whole client was reorganised around one responsive application shell, replacing the single dark
top navbar. The desktop layout now uses a pinned `244px` sidebar with the three existing
destinations; below the Bootstrap `lg` breakpoint the sidebar is replaced by a sticky top bar and a
Bootstrap offcanvas menu driven by Vue state, with a scroll lock, `Escape`, backdrop click, focus
handling, and `aria-current` on the active entry.

The items page received a page header with the item count, one labelled search/filter toolbar, a
compact desktop table with Photo, Name, Category, Condition, Location, and View/Edit actions, and a
card list for narrow screens with `44px` touch targets. Empty inventory and empty search result are
now distinguished, and loading uses a spinner card instead of loose text.

The item details page was regrouped into a header, a photo viewer with Previous/Next and a
`current / total` indicator, and Details, custom fields, Storage, and Record information cards.
On phones the order is name, actions, photo, details, custom fields, storage, metadata. The item
form, the category manager, and the data page were brought onto the same header, card, and section
styling.

Repeated markup moved into `client/src/components/` (`AppNavigation`, `PageHeader`, `ItemThumbnail`,
`ItemResults`, `ItemPhotoViewer`), the navigation entries and the active-route rule into
`client/src/navigation.js`, and `client/src/style.css` was rewritten as design tokens plus shell,
thumbnail, and photo rules. No route, API, schema, or item capability changed.

## Verification

- `npm run lint`, `npm test` (16 passed, 1 skipped), and `npm run build` pass.
- `npm run test:e2e`: 12 Playwright tests passed in Chromium, including the new
  `test/e2e/responsive.spec.js` phone-viewport coverage of the offcanvas menu, the mobile item cards,
  the name-before-photo detail order, multi-photo navigation and deletion, and the no-photo state.
  `items.spec.js` and `navigation.spec.js` were updated for the new labels, empty-state wording, the
  per-row action names, and `aria-current`.
- Visual QA in Chromium at `1440`, `1024`, `768`, `390`, and `360` pixels and at `200%` zoom, over
  the items list, item details with and without photos, the item form, the categories page, and the
  data page, seeded with a long item name, long category and location values, a long description,
  four custom fields, several photos, and nested contents. No page scrolls horizontally.

## Documentation

- Added `docs/features/responsive-ui.md` and its entry in `docs/features/README.md`.
- Updated `docs/HOW-TO.md` for the new navigation, the two empty states, the toolbar labels, the
  desktop table and mobile cards, the photo viewer, and the Storage card.
- Updated `docs/features/playwright-e2e-tests.md` with the new spec.
- Removed the completed `docs/issues/TASK-responsive-ui-redesign.md`.
