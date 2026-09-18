# CODEX TASK — Redesign the Responsive Application UI

## Goal

Redesign the **Inventory Atlas Lite** user interface to make it clearer, denser, and easier to use on both desktop and mobile devices.

Use the two supplied reference images only as layout and visual-organization inspiration:

- the inventory-list reference suggests a persistent desktop sidebar, compact search/filter toolbar, dense inventory table, clear item count, and visible row actions;
- the item-detail reference suggests a strong page header, prominent photo area, and information grouped into clean cards.

Do not copy features, labels, or data concepts from the reference products. The redesigned UI must display only functionality and data that currently exist in Inventory Atlas Lite.

Continue using the existing **Bootstrap 5** design system and locally installed project dependencies. Do not use a CDN and do not replace Bootstrap with another component framework.

---

## Reference interpretation

### Use these ideas

- clear application shell;
- persistent navigation on desktop;
- compact mobile navigation;
- light neutral background;
- white content cards with subtle borders/shadows;
- restrained blue primary accent;
- clear active navigation state;
- search and filters grouped into one toolbar;
- item count near the list title;
- compact rows with thumbnail and primary information;
- visible View/Edit actions;
- a strong item title and action header;
- one prominent photo viewer;
- item data grouped into readable sections;
- responsive layouts rather than a scaled-down desktop page.

### Explicitly do not add these reference features

Do not add UI, fields, placeholder blocks, mock data, routes, or backend concepts for:

- dashboard analytics;
- SKU or asset ID unless already implemented in the current project;
- stock level or quantity;
- stock status;
- bulk selection checkboxes;
- floor maps;
- QR codes or barcode labels;
- scan or print functions;
- employee assignment;
- purchase, supplier, cost, warranty, or invoice management;
- retire-item workflow;
- user profile, notification center, or account management;
- any other feature visible in the references but absent from Inventory Atlas Lite.

The result must look intentional even with the smaller current feature set. Do not leave empty spaces reserved for future features.

---

## First inspect the current application

Before implementation:

1. inspect every current route, page, component, and global style;
2. inspect the current API responses and identify all fields actually available to the UI;
3. inspect whether nested items, custom-field autocomplete, database restore, and other previously planned features are already implemented in the current repository;
4. inspect the existing logo assets and use them if present;
5. run the application and capture or review the current desktop and mobile layouts;
6. identify all current loading, empty, error, confirmation, and destructive-action states;
7. read `AGENTS.md` and follow all existing documentation, task cleanup, commit, and push rules.

Treat the current codebase as the source of truth. Do not assume that a task document means its feature has been implemented.

---

## Functional constraints

This is a UI/UX redesign, not a product-scope expansion.

Preserve:

- all current routes and deep links;
- current create, read, update, and delete workflows;
- current search, category filter, sorting, direction, and pagination behaviour;
- photo upload, viewing, and deletion;
- categories and custom fields management;
- Data / Backup functionality;
- nested item/container behaviour if currently implemented;
- autocomplete if currently implemented;
- backup restore if currently implemented;
- all existing validation, error handling, and safety rules.

Do not change the database schema or API merely to imitate the reference designs. Backend changes are allowed only when strictly required to preserve an existing UI capability, and must not introduce new domain functionality.

---

## Application shell

Create one consistent responsive application shell used by every route.

### Desktop and large tablet

At desktop widths, use a left sidebar inspired by the first reference.

The sidebar should contain only existing top-level destinations, for example:

```text
Inventory Atlas Lite

Items
Categories & Fields
Data / Backup
```

If the project already contains the approved Inventory Atlas Lite SVG logo:

- use the horizontal logo or logo plus product name in the desktop sidebar;
- use the compact mark where horizontal space is limited;
- do not regenerate or visually reinterpret the logo as part of this task.

Sidebar requirements:

- visible at the large-screen Bootstrap breakpoint and above;
- stable width of approximately `230–260px`;
- full-height or viewport-sticky presentation;
- light background consistent with the content area;
- subtle right border;
- clear active-route state using the primary accent;
- readable text labels;
- no fake Dashboard, Settings, Floor Map, or future-feature entries;
- no horizontal overflow;
- main content must receive the remaining width and use it efficiently.

Do not add a redundant desktop top navbar if the sidebar already provides primary navigation. A small page header/breadcrumb area inside the content region is acceptable when it improves orientation.

### Mobile and narrow tablet

Below the desktop sidebar breakpoint:

- hide the fixed sidebar;
- show a compact top app bar on every route;
- place a hamburger button at the start of the bar;
- show the compact logo/product name;
- open the same navigation inside a Bootstrap 5 offcanvas panel;
- close the panel after navigation;
- support backdrop click and `Escape`;
- manage focus correctly;
- prevent the page behind the panel from scrolling while it is open;
- preserve the active-route highlight.

Use Bootstrap's existing offcanvas capability from the locally installed dependency or implement equivalent Vue state with correct Bootstrap markup. Do not add another navigation library.

The mobile header should remain easy to reach on all pages. It may be sticky if this does not create layout or keyboard issues.

Do not add a second mobile bottom-navigation system in addition to the offcanvas menu.

---

## Global visual direction

Use Bootstrap 5 as the foundation and add only a small project-level style layer.

Visual direction:

- light gray application background;
- white content surfaces;
- subtle neutral borders;
- restrained shadows;
- consistent card radius;
- Bootstrap primary blue for important actions and active states;
- dark neutral body text;
- secondary gray metadata;
- red only for destructive actions and errors;
- comfortable but compact desktop density;
- larger touch targets and spacing on mobile.

Use Bootstrap CSS variables or a small set of project CSS custom properties for repeated values. Avoid scattered arbitrary colors and spacing.

Do not:

- introduce gradients, glassmorphism, heavy animation, or decorative dashboards;
- use a CDN;
- add a large icon/UI dependency solely for this redesign;
- use icon-only controls without accessible names;
- make the interface resemble a different product at the cost of Inventory Atlas Lite's simplicity.

If icons are used, prefer existing project assets, Bootstrap-compatible local assets, or small inline SVGs. Text labels are acceptable and often preferable.

---

## Items list page

Redesign the main Items page around two primary surfaces:

1. search/filter/action toolbar;
2. inventory results card.

### Page header

Show:

- page title `Items` or `Inventory`;
- current total item count;
- primary `Add item` action.

The button must remain visually prominent without overwhelming the title.

### Search and filter toolbar

Group all current controls into one compact card or toolbar:

- text search;
- category filter;
- sort field;
- ascending/descending direction;
- `Add item` may live here instead of the page header if that creates a cleaner composition, but it must not be duplicated.

Requirements:

- search receives the most horizontal space;
- controls use real visible labels or accessible labels, not ambiguous unlabeled selects;
- filters remain usable by keyboard and touch;
- loading a filtered result must not cause major layout jumping;
- current debounce and filter-reset behaviour must remain correct;
- at mobile widths controls stack naturally and become full-width where useful;
- do not add filters for status, stock, SKU, map location, or other unavailable data.

### Desktop results table

At desktop widths, use a compact responsive table inspired by the first reference.

Display only current useful columns, such as:

| Column | Source |
| --- | --- |
| Photo | existing thumbnail |
| Name | item name and details link |
| Category | existing category |
| Condition | existing condition |
| Location | existing plain-text location |
| Stored inside | direct parent, only if nested items are implemented and already available |
| Actions | existing View and Edit routes |

Requirements:

- do not display a column when the underlying feature is not implemented;
- keep the thumbnail compact and consistently sized;
- use a clean placeholder when no photo exists;
- emphasize the item name as the primary row content;
- truncate unusually long secondary values without hiding them permanently; use wrapping or accessible title/help where appropriate;
- use subtle row hover state;
- provide visible View/Edit actions without adding new item operations;
- retain a clear link from the item name to its details page;
- do not add checkboxes, row numbers, stock progress bars, or status badges simply because they appear in the reference;
- avoid horizontal scrolling at normal desktop widths.

### Mobile results layout

Do not force the full desktop table onto a phone.

Below an appropriate breakpoint, render each item as a compact list row or card containing:

- thumbnail;
- item name as the primary line;
- category;
- condition and location when present;
- direct parent/container when implemented and present;
- clear View/Edit actions or one obvious details affordance plus Edit.

Requirements:

- the name must remain readable and not be squeezed by actions;
- empty secondary values should not produce rows of meaningless dashes;
- tap targets should be at least approximately `44px` where practical;
- the entire card may navigate to details only if embedded buttons do not create conflicting click behaviour;
- avoid nested horizontal scrolling;
- preserve search, filters, item count, loading, empty, error, and pagination states.

### Pagination

Keep the existing pagination behaviour.

Present:

- current page and total pages or current visible range;
- Previous/Next controls;
- proper disabled states;
- compact alignment at desktop;
- touch-friendly controls on mobile.

Do not invent page-size controls unless they already exist.

---

## Item details page

Reorganize the existing item details page using the second reference as composition inspiration, while removing all unrelated reference blocks.

### Header

At the top of the page show:

- category or breadcrumb as secondary context;
- item name as the main heading;
- existing `Edit` action;
- existing `Delete` action with destructive styling and the current safety confirmation;
- optional back-to-items navigation.

Do not add Print Label, Retire, Assign, QR, or other unavailable actions.

### Desktop layout

Use a responsive two-column content area on large screens:

- left column: prominent photo viewer;
- right column: current item information grouped into cards.

The exact column widths may be adjusted based on the real content, approximately `5/12 + 7/12` or `4/12 + 8/12`.

#### Photo viewer

The project already supports multiple photos, so preserve that capability without copying the crossed-out thumbnail strip from the reference.

Use:

- one large contained current image;
- Previous/Next controls when more than one photo exists;
- a small `current / total` indicator;
- filename only when useful;
- existing Delete photo action, kept clearly separate from item deletion;
- a clean empty-photo placeholder.

Do not add a mandatory thumbnail strip. Do not crop inventory photos destructively; use `object-fit: contain` for the large viewer.

#### Item information

Group only current fields into logical cards. A recommended structure is:

1. **Details**
   - condition;
   - plain-text location;
   - description;
   - current custom fields.
2. **Storage** — only when nested items are currently implemented
   - `Stored inside` parent link;
   - direct `Contents` list using existing data and routes.
3. **Record information**
   - UUID;
   - created time;
   - updated time.

Merge or hide empty sections rather than displaying large blank cards. Do not split dynamic custom fields into invented concepts such as warranty or purchase information.

If nested items are not implemented in the current repository, do not create a placeholder Storage card.

### Required mobile order

On phone widths, the item details page must appear in this exact high-level order:

1. category/breadcrumb and **item name**;
2. item actions where they remain easy to understand;
3. **photo viewer**;
4. core details and description;
5. custom fields;
6. parent/container and contents, if implemented;
7. record metadata.

The item name must appear before the photo. Do not allow CSS column order to place the photo above the title.

Mobile requirements:

- one-column layout;
- no horizontal overflow;
- long names and descriptions wrap safely;
- actions wrap or become full-width without squeezing the title;
- the photo fits the viewport and preserves aspect ratio;
- carousel controls remain reachable without covering important image content;
- destructive actions are visually separated from primary actions;
- metadata may be visually quieter but must remain available.

---

## Other existing pages

Apply the same application shell, spacing, typography, cards, button hierarchy, and responsive behaviour to all current routes.

### Add/Edit item

- keep all current fields and validation;
- keep category-driven custom fields;
- preserve photo upload/removal;
- preserve parent selection/autocomplete if currently implemented;
- use clear sections and responsive field grouping;
- keep Save as the primary action and Cancel secondary;
- ensure the mobile keyboard and file picker do not break the layout.

### Categories & Fields

- keep the existing two-panel desktop workflow when space allows;
- stack categories above fields on mobile;
- make the selected category obvious;
- keep Rename/Delete/Add actions usable without crowding;
- do not introduce new category capabilities.

### Data / Backup

- place existing backup and restore capabilities in clear cards;
- keep destructive restore visually distinct when implemented;
- do not add cloud sync, scheduled backup, or external storage integration;
- make long warnings readable on mobile.

All pages must remain reachable through the same desktop sidebar and mobile offcanvas navigation.

---

## Responsive behaviour

Use Bootstrap breakpoints consistently rather than arbitrary device detection.

Recommended behaviour:

| Width | Navigation | Items results | Item details |
| --- | --- | --- | --- |
| `lg` and above | fixed/sticky sidebar | table | two columns |
| `md` to below `lg` | mobile header + offcanvas | simplified table or cards based on real fit | one or two columns only when comfortable |
| below `md` | mobile header + offcanvas | list/cards | strict one-column ordered layout |

Test at minimum around:

- `1440px` desktop;
- `1024px` small desktop/landscape tablet;
- `768px` tablet;
- `390px` common phone;
- `360px` narrow phone.

Also test with:

- very long item name;
- long category and location names;
- no photo;
- multiple photos;
- many custom fields;
- empty description;
- nested contents when supported;
- browser zoom at `200%`.

---

## Accessibility and interaction

Requirements:

- semantic headings in logical order;
- proper labels for every form control;
- visible keyboard focus;
- sufficient color contrast;
- buttons and links distinguishable without relying only on color;
- accessible names for hamburger, photo navigation, View, Edit, and Delete controls;
- `aria-current` or router-equivalent indication for active navigation;
- correct focus behaviour for the offcanvas menu;
- decorative icons hidden from assistive technology;
- no hover-only actions;
- no essential information available only in tooltips;
- respect reduced-motion preferences;
- preserve native confirmation/safe deletion behaviour unless replacing it with an equally accessible Bootstrap modal.

Avoid unnecessary animation. If transitions are used, keep them short and subtle.

---

## Component and CSS organization

Refactor repeated layout into small reusable Vue components where it clearly reduces duplication, for example:

- application sidebar/offcanvas navigation;
- mobile header;
- page header;
- item thumbnail/empty-photo placeholder;
- responsive item row/card;
- item photo viewer.

Do not create a large generic component framework.

Requirements:

- keep route/page responsibilities clear;
- keep repeated navigation definitions in one source of truth;
- avoid duplicated desktop and mobile business logic even if their markup differs;
- use the same item data and actions for table rows and mobile cards;
- keep global CSS focused on shell/layout/design tokens;
- keep page-specific styling scoped or clearly named;
- remove obsolete styles after the redesign;
- do not use inline style attributes for repeated visual rules.

---

## Loading, empty, and error states

Redesign all existing states together with the normal content.

Requirements:

- loading state must fit the new layout and not appear as unstyled loose text;
- empty inventory state should clearly explain that there are no items and offer the existing `Add item` action;
- zero search results should distinguish `No matching items` from a completely empty inventory where the API allows it;
- errors should remain visible and actionable;
- photo loading/failure should not collapse the detail layout;
- disabled buttons must look disabled;
- filters must retain their visible selected values during loading.

Do not add fake skeleton data that looks like real inventory unless implemented accessibly and simply.

---

## Documentation updates

Follow the repository's current documentation lifecycle.

At minimum:

- update `docs/HOW-TO.md` when navigation labels, page organization, or workflows change;
- create or update the permanent implemented-feature/UI document as required by `AGENTS.md`;
- update `docs/features/README.md` or the repository's equivalent feature index when required;
- update screenshots only if the repository already maintains them;
- remove this task file only after the redesign is implemented, verified, and documented according to `AGENTS.md`.

Do not document reference-only features that were intentionally excluded.

---

## Tests and verification

### Automated verification

Run all existing tests and the production build:

```bash
npm test
npm run build
```

Add or update frontend tests where the project supports them, covering at least:

1. all existing routes remain reachable;
2. active navigation is correct;
3. mobile menu opens, closes, and navigates;
4. search/filter/sort/pagination behaviour is unchanged;
5. View and Edit actions use the correct routes;
6. item details preserve all current fields and actions;
7. multiple-photo navigation works;
8. no-photo state renders correctly;
9. mobile detail DOM/visual order places the name before the photo and fields;
10. destructive actions retain confirmation;
11. no unsupported reference feature appears in the UI.

### Visual verification

Perform browser-based visual QA at the required widths.

Verify:

- desktop sidebar alignment and content width;
- mobile offcanvas behaviour on every route;
- no clipped controls or unintended horizontal page scrolling;
- table-to-card transition;
- title/photo/details order on mobile;
- photo containment and navigation;
- long content wrapping;
- consistent cards, spacing, typography, and action hierarchy;
- focus and keyboard navigation;
- empty/loading/error states.

If browser automation is available, capture screenshots at representative desktop and mobile widths. Inspect them rather than treating screenshot creation itself as validation.

Do not claim responsive QA was completed if the UI was not rendered and inspected.

---

## Non-goals

Do not add:

- dashboard;
- analytics;
- new database fields;
- SKU/asset numbering;
- stock or quantity tracking;
- statuses not already implemented;
- bulk actions;
- QR/barcode generation or scanning;
- printable labels;
- floor maps;
- employees, assignments, profiles, or notifications;
- purchase, warranty, supplier, invoice, or cost tracking;
- authentication;
- new backup/cloud functionality;
- a new CSS framework or component library;
- CDN dependencies;
- dark mode;
- speculative placeholders for future modules.

---

## Acceptance criteria

The redesign is complete when:

1. every route uses one consistent responsive application shell;
2. desktop navigation uses a clear left sidebar containing only existing destinations;
3. mobile navigation is available on every page through an accessible hamburger/offcanvas menu;
4. the desktop Items page has a compact toolbar and readable results table using only real item data;
5. the mobile Items page uses touch-friendly rows/cards without horizontal table scrolling;
6. the item details page has a clear header, prominent photo viewer, and logically grouped current data;
7. on mobile, the item name appears before the photo, and the photo appears before descriptive fields;
8. all current features and routes continue to work;
9. none of the unsupported reference features appear as UI or placeholder content;
10. Bootstrap 5 remains the design-system foundation and all dependencies remain local;
11. common desktop, tablet, and phone widths have been rendered and inspected;
12. accessibility basics and long-content cases work;
13. existing tests pass and the production build succeeds;
14. HOW-TO and permanent feature documentation are updated according to project rules.

## Main priority

Make Inventory Atlas Lite feel like a coherent, practical inventory application while preserving its lightweight scope. Improve hierarchy, navigation, density, and mobile usability without pretending the product already contains the larger Inventory Atlas feature set.
