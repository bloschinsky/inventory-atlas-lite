# Codex Task: Migrate the UI Design System to Tabler

## Status

- **Priority:** High
- **Type:** UI architecture and visual refactor
- **Dependencies:** None
- **Blocks:** `TASK-dashboard.md`

## Objective

Migrate Inventory Atlas Lite from direct Bootstrap 5 styling to the Tabler UI design system while preserving all current application behavior.

Use Tabler's **vertical Folded hover layout** as the desktop application shell and add a persistent light/dark theme switcher. The result must give the existing application a consistent dashboard-oriented visual foundation before the Dashboard feature is implemented.

This task is a visual and structural migration only. Do not add Dashboard metrics or other product features in this task.

## Project Context

Inventory Atlas Lite is a Vue 3 + Vite client with an Express + SQLite backend. It is designed to be self-hosted and usable without an internet connection. Bootstrap is currently installed locally and used directly by the client.

Tabler is based on Bootstrap 5 and includes Bootstrap styling in `@tabler/core`. The migration must therefore replace the direct Bootstrap presentation layer rather than load Tabler beside a second Bootstrap bundle.

## Required Implementation

### 1. Dependencies and asset loading

- Install `@tabler/core` as a pinned npm dependency.
- Install `@tabler/icons-vue` as a pinned npm dependency and use tree-shaken Vue icon imports.
- Import all required styles and scripts from local npm dependencies. Do not use a CDN or any other runtime internet dependency.
- Remove the standalone Bootstrap dependency and its CSS/JavaScript imports if it is no longer required directly.
- Ensure that Bootstrap CSS or JavaScript is not bundled twice through separate imports.
- Do not import Tabler demo plugins or large optional libraries unless an existing application feature requires them.
- Keep the lockfile updated.

### 2. Reusable application shell

Create or refactor reusable layout components so page-level views do not duplicate shell markup. At minimum, the structure should clearly separate:

- the application shell;
- the desktop sidebar;
- the mobile navigation drawer;
- the page header/title area;
- the main page content area;
- shared theme controls.

Use the existing Inventory Atlas Lite logo and product name. Ensure the logo remains clearly visible in both light and dark modes and in folded and expanded sidebar states.

### 3. Desktop navigation: Tabler Folded hover

Use the Tabler **Folded hover** vertical layout as the reference behavior.

Required behavior on desktop:

- The sidebar is shown as a narrow icon rail in its resting state.
- Hovering the rail expands it and reveals navigation labels.
- Keyboard focus within the sidebar must also reveal enough information to navigate without relying on pointer hover.
- Expansion must not cause an unexpected horizontal page jump or obscure essential content.
- The active route must be visually identifiable in both folded and expanded states.
- Every navigation entry must have a meaningful Tabler icon and a visible text label when expanded.
- Icon-only controls must have accessible names and, where useful, tooltips.
- Navigation must continue to expose all currently available sections and actions. Do not add a Dashboard entry until the Dashboard task is implemented.

Use Tabler's supported layout structure and CSS behavior where possible. Avoid recreating the entire folded sidebar with a large custom CSS implementation.

### 4. Mobile navigation

Do not use hover-dependent navigation on mobile.

- Replace the folded sidebar with a Tabler/Bootstrap offcanvas navigation drawer at the mobile breakpoint.
- Provide a clearly visible hamburger button on every page.
- Close the drawer after navigation.
- Keep the current route highlighted.
- Ensure the drawer, backdrop, close button, focus management, and keyboard behavior work correctly.
- The page must not horizontally overflow while the drawer is closed or open.

### 5. Light and dark modes

Add a theme switcher that uses Tabler's supported color-mode mechanism.

Required behavior:

- Provide explicit **Light** and **Dark** modes through an accessible header or sidebar control.
- On the first visit, use the operating-system preference when no application preference exists.
- Persist the user's explicit choice in `localStorage`.
- Apply the stored or system theme before the Vue application is visibly rendered to avoid a light-theme flash when dark mode is selected.
- Update the relevant `data-bs-theme` state on the document root.
- Ensure custom application styles use theme-aware variables instead of hard-coded light-only colors.
- Tables, forms, modals, offcanvas navigation, alerts, photos/placeholders, borders, empty states, and destructive actions must remain readable in both modes.
- Theme selection is client-side UI state and must not require a backend or database change.

### 6. Migrate existing screens and components

Apply the new Tabler presentation consistently to every currently implemented screen, including as applicable:

- items list;
- item details;
- create/edit item forms;
- categories and custom fields;
- nested-item/container presentation;
- data and backup/restore screens;
- search, filters, sorting, pagination, validation, confirmation dialogs, alerts, loading states, and empty states.

Prefer native Tabler patterns for:

- page headers;
- cards;
- data tables;
- forms and input groups;
- buttons and action groups;
- badges and status indicators;
- breadcrumbs;
- pagination;
- modals and offcanvas panels;
- empty, loading, and error states.

Preserve all existing route behavior, form validation, API calls, data operations, and user-visible functionality. This refactor must not alter the database schema or server API.

### 7. Responsive behavior

Verify the complete application at representative widths, including approximately:

- 1440 px desktop;
- 1024 px small desktop/tablet landscape;
- 768 px tablet;
- 390 px phone;
- 320 px narrow phone.

Requirements:

- No accidental horizontal page scrolling.
- Tables must use an intentional mobile strategy such as responsive scrolling or a compact responsive representation.
- Primary actions must remain discoverable and tappable.
- On an item-details page, keep the existing mobile content priority: item name first, photo second, then the remaining item information and actions.

### 8. CSS cleanup

- Remove obsolete Bootstrap-era overrides and duplicated layout styles.
- Retain custom CSS only where it expresses application-specific behavior or branding that Tabler does not provide.
- Centralize application theme overrides using a small, documented set of CSS custom properties where practical.
- Do not copy entire stylesheets from Tabler examples into the repository.

### 9. Documentation and repository workflow

- Update the project How-To/current-state documentation to describe the new navigation and theme switcher.
- Update the implemented-features documentation and its index according to the repository's existing documentation rules.
- If required by `AGENTS.md`, remove this completed task file after implementation and record the completed work in the appropriate implemented-feature document.
- Preserve the Tabler and Tabler Icons license/copyright notices as required by their licenses.

## Non-Goals

- Do not implement the Dashboard or its API.
- Do not add QR/barcode functionality.
- Do not add authentication, user profiles, notifications, maps, stock management, or other features shown in Tabler demos.
- Do not change the SQLite schema or existing API contracts.
- Do not introduce a separate Vue component framework on top of Tabler.
- Do not add a charting library.
- Do not redesign application workflows solely to imitate a demo page.

## Verification

The agent must:

1. Run the existing automated test suite and fix any regression caused by the migration.
2. Run the production client build successfully.
3. Exercise the existing acceptance flow against the running application.
4. Manually verify every current route in light and dark mode.
5. Manually verify folded/hover/focus behavior on desktop and offcanvas navigation on mobile.
6. Confirm that the application still works with network access disabled after dependencies have been installed and the project has been built.
7. Inspect the production bundle or dependency graph sufficiently to confirm that Bootstrap is not included twice.
8. Check browser console output and leave no new warnings or runtime errors.

## Acceptance Criteria

- `@tabler/core` and `@tabler/icons-vue` are installed locally with pinned versions.
- No CDN or runtime internet dependency is introduced.
- A single Tabler/Bootstrap styling and JavaScript path is used; Bootstrap is not duplicated.
- Desktop navigation follows the Tabler Folded hover pattern and works with both pointer and keyboard input.
- Mobile navigation uses a reliable offcanvas drawer available from every page.
- The active route remains clear in all navigation states.
- Light and dark modes are usable across every existing screen.
- The selected theme persists across reloads and does not visibly flash the wrong theme during startup.
- Existing CRUD, search, filters, nested items, photos, categories/custom fields, and backup/restore behavior continue to work.
- The database schema and backend API are unchanged.
- The UI is usable without horizontal overflow at the required viewport widths.
- Existing tests, the production build, and the acceptance flow pass.
- Relevant project documentation is updated.

## Handoff to the Next Task

Only after this task satisfies all acceptance criteria should `CODEX-TASK-dashboard.md` be started. The Dashboard must reuse this task's application shell, Tabler components, responsive conventions, theme handling, and navigation patterns rather than creating a separate visual system.
