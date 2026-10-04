# TASK: Replace Centered Desktop Container with a Fluid Application Workspace

## Goal

Make the main Inventory Atlas Lite content area use the full width available inside the application shell on desktop and large screens.

The application should behave like a data-oriented desktop/admin workspace rather than a centered website: Dashboard, Items, Categories, Templates, Hierarchy, Checklists, Settings, Backup, and other routed pages must be able to use the full horizontal space available beside the application sidebar.

Keep normal Tabler/Bootstrap horizontal gutters. Do **not** make content physically touch the sidebar or viewport edge.

Canonical task file: `TASK-FLUID-DESKTOP-WORKSPACE.md`

## Current Problem

The application shell currently wraps every routed page in:

```vue
<main class="page-body">
  <div class="container-xl">
    <RouterView />
  </div>
</main>
```

File:

```text
client/src/App.vue
```

Tabler/Bootstrap `.container-xl` has a breakpoint-based maximum width. On wide desktop screens, including Full HD, it stops expanding and is centered inside `.page-wrapper`.

As a result, a substantial part of the available workspace remains unused on both sides of the main content even when individual pages are already responsive.

The problem is global because the width constraint is applied around `RouterView`, so every route inherits it.

## Required Layout Change

Replace the global centered/max-width application content container with a fluid shell container.

Preferred structure:

```vue
<main class="page-body">
  <div class="container-fluid app-content-container">
    <RouterView />
  </div>
</main>
```

Equivalent naming is acceptable if it better matches the repository, but the behavior must be the same.

Requirements:

- main routed content uses the full width available inside `.page-wrapper`;
- no global `max-width` is applied to the routed application canvas;
- retain normal Tabler/Bootstrap responsive horizontal gutters;
- preserve the existing sidebar, mobile navigation, page-body spacing, and responsive shell behavior;
- do not introduce custom fixed widths for desktop breakpoints;
- avoid unnecessary custom CSS when `.container-fluid` and existing utilities already solve the problem.

## Width Policy

The application must follow this rule:

```text
Application canvas / routed page
    -> fluid, full available width

Data-heavy UI
    -> may use the full page width

Forms or deliberately narrow reading/editing surfaces
    -> may keep local max-width constraints
```

The global shell must not decide that every page should be narrow.

Existing local constraints such as:

```css
--app-form-width: 820px;
.form-card { max-width: var(--app-form-width); }
```

are intentional and should remain where they improve form usability.

Do not remove local width constraints merely to make every individual component stretch.

## Pages That Should Benefit from the Fluid Workspace

Audit at minimum:

- Dashboard
- Items
- Categories
- Templates
- Hierarchy tree
- Hierarchy graph
- Checklists
- Settings
- Data Backup
- Item Details
- Print Labels

Expected behavior includes:

### Dashboard

Existing responsive grids and charts should receive the additional available width.

Do not rewrite the Dashboard grid solely for this task unless the fluid shell exposes a real layout bug.

Charts must resize correctly and must not overflow their cards.

### Items

The list/table should gain useful horizontal room for visible columns.

Do not introduce an arbitrary new max-width around the table.

Existing responsive/mobile card behavior must remain unchanged.

### Hierarchy

The graph/tree should gain useful workspace width.

Do not create a new fixed graph width.

### Forms

Item, Template, Checklist, AI, and other form surfaces that already use `.form-card` or another intentional local max-width should remain readable rather than becoming excessively wide.

### Settings

This task changes the global application workspace only.

Any Settings-specific information architecture/navigation redesign is a separate task and must not be reimplemented here.

## Print Labels Regression

Current print CSS contains a selector that explicitly targets the global `.container-xl`:

```css
body:has(.label-sheets) .page-wrapper,
body:has(.label-sheets) .page-body,
body:has(.label-sheets) .container-xl {
  margin: 0 !important;
  padding: 0 !important;
  max-width: none !important;
}
```

When the shell container changes, update this print rule.

Prefer targeting the new application content wrapper/class rather than leaving a stale `.container-xl` dependency.

Printing QR label sheets must retain:

- zero application-shell margins/padding around the printable sheet;
- no max-width constraint;
- A4 layout behavior;
- one sheet per printed page;
- no regression in existing print tests.

## Responsive Requirements

The fluid layout must work across narrow and wide screens.

Verify at minimum:

- 360px phone
- 768px tablet
- 1366px desktop/laptop
- 1440px desktop
- 1920px Full HD
- 2560px wide desktop

### Desktop / wide screens

The main content surface should visibly expand with the viewport after accounting for the sidebar and normal gutters.

There must not be hundreds of pixels of artificial centered whitespace caused by a shell `max-width`.

### Mobile / tablet

Current behavior must remain effectively unchanged:

- content remains readable;
- mobile navigation still works;
- standard gutters remain;
- no new horizontal page overflow is introduced;
- responsive cards/tables/forms keep their current narrow-screen behavior.

## Overflow Rules

The page shell itself must not create horizontal scrolling.

If a specific component intentionally manages horizontal overflow internally, keep that behavior local.

Examples of acceptable local overflow include a wide data table or print-preview surface where the component already owns scrolling.

Do not solve overflow by restoring a global max-width.

## Tabler / Bootstrap Requirements

Use the existing installed Tabler design system.

- Prefer `.container-fluid` and existing spacing utilities.
- Do not install Bootstrap separately.
- Do not introduce another layout/UI framework.
- Do not add arbitrary custom breakpoints when Tabler/Bootstrap behavior is sufficient.
- New CSS, if required, must use the existing project conventions and remain compatible with light/dark modes.

## Accessibility

This task must not alter document semantics or keyboard navigation.

Ensure that:

- changing the shell container does not reorder content;
- focus behavior remains unchanged;
- no interactive surface is clipped by the new width behavior;
- browser zoom remains usable without shell-level horizontal overflow.

## Tests

Add or update automated coverage so the regression cannot silently return.

At minimum cover:

1. the application shell no longer uses `.container-xl` as the routed content wrapper;
2. the routed content wrapper is fluid;
3. at a desktop viewport such as 1920px, the main content container expands close to the available `.page-wrapper` width, allowing only normal horizontal gutters;
4. the desktop shell has no shell-level horizontal overflow;
5. a narrow/mobile viewport still renders without horizontal shell overflow;
6. Dashboard renders correctly at a wide viewport;
7. Items list renders correctly at a wide viewport;
8. Hierarchy renders correctly at a wide viewport;
9. existing locally constrained forms remain constrained/readable;
10. Print Labels print-mode behavior remains correct after removing the `.container-xl` dependency.

Prefer behavior-based Playwright assertions over brittle screenshots or exact pixel values.

Allow a small gutter tolerance rather than asserting one exact content width.

Existing lint, unit/integration tests, and E2E tests must remain green.

## Documentation / Change Log

Add an appropriate change entry under:

```text
docs/changes/
```

Describe that the global application workspace is now fluid on desktop and wide screens while local form width constraints remain intentional.

Do not rewrite unrelated documentation.

## Acceptance Criteria

- [ ] The global routed content wrapper no longer uses a centered `.container-xl` max-width.
- [ ] Main routed pages expand to the full width available beside the sidebar.
- [ ] Standard Tabler/Bootstrap horizontal gutters remain.
- [ ] Dashboard uses the additional width correctly.
- [ ] Items uses the additional width correctly.
- [ ] Hierarchy uses the additional width correctly.
- [ ] Other routed pages inherit the fluid workspace without per-page hacks.
- [ ] Existing `.form-card` and other intentional local width constraints remain intact where appropriate.
- [ ] No new shell-level horizontal overflow is introduced.
- [ ] Mobile and tablet layouts do not regress.
- [ ] Print Labels CSS no longer depends on the removed `.container-xl` shell and still prints correctly.
- [ ] Light and dark modes remain correct.
- [ ] Automated coverage protects the wide-screen layout behavior.
- [ ] Lint/tests/E2E pass.
- [ ] No new UI/layout dependency is introduced.

## Out of Scope

Do not include in this task:

- redesigning the application sidebar;
- redesigning the mobile navigation;
- reorganizing Settings navigation/content;
- redesigning individual Dashboard cards/charts unless required to fix a regression exposed by the fluid shell;
- changing table column behavior unrelated to available width;
- removing intentional local form max-width constraints;
- introducing a user-configurable compact/wide layout toggle;
- changing backend APIs or database schema;
- replacing Tabler or Bootstrap utilities.
