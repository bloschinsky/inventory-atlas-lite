# Public user guide

## Summary

The landing site has a second page, the public **User Guide** at
<https://bloschinsky.github.io/inventory-atlas-lite/guide/>. It is the repository's user guide —
[`docs/HOW-TO.md`](../HOW-TO.md) in English and its translation [`docs/HOW-TO.uk.md`](../HOW-TO.uk.md)
in Ukrainian — rendered at build time and laid out with the landing's look: a table of contents,
numbered sections, localized screenshots, small concept diagrams, and *Try this in Demo* links into
the [public demo](public-demo.md). The Markdown is the only source of the guide text; nothing of it is
copied into the landing sources, and a change to it reaches the page with the next landing build.

## User-visible behaviour

- **Entry points:** the landing navigation has a **Guide** link between Features and Install (wide
  screens), and the final call to action's **Read the user guide** opens the guide instead of the
  Markdown on GitHub. On the guide, the product mark leads back to the product page, **Features** and
  **Install** to its sections, and **Guide** is marked as the current page.
- **Title band:** the dark landing band with a *User guide* label, the document's own title
  (*Inventory Atlas Lite — Quick How-To* / *Inventory Atlas Lite — короткий посібник*) and introduction,
  **Try Demo** (when a demo is published), and **View source on GitHub**, which opens the Markdown of
  the page language (`docs/HOW-TO.md` or `docs/HOW-TO.uk.md`).
- **Sections:** the nine numbered sections of the guide, each with its number (*01*–*09*) above the
  heading, and their subsections. Every heading has a link icon (visible on hover and focus, always on
  touch screens) to its own anchor, named *Link to "…"*. Lists, links, code spans, bold text, tables,
  and code blocks render as in the Markdown, in Geist on Tabler's tokens, at a reading width of about
  70 characters. Tables and code blocks scroll sideways inside their own bordered box, which the
  keyboard can reach; the page itself never scrolls sideways. On phones the table columns narrow.
- **Table of contents:** on screens from 992 px a sticky sidebar, *On this page*, lists the numbered
  sections; the subsections of the section being read open under it. The heading being read is the
  current location (`aria-current="location"`, blue), its section is bold, and the list scrolls on
  its own when it is longer than the window. Below 992 px the sidebar is replaced by a compact sticky
  bar under the navigation: **On this page · <section being read>**, a 48 px disclosure button that
  opens the same list in a panel of at most 60 % of the screen; choosing an entry or Escape closes it.
- **Anchors:** the section ids come from the English headings without their numbers
  (`#core-concepts`, `#browse-the-storage-hierarchy`) and are the same in every language. A shared or
  reloaded address opens its section, with the heading just under the sticky bars and a numbered
  section's number in view. In-guide links of the Markdown (*see Change the interface language*) jump
  within the page; links to other repository documents open them on GitHub.
- **Presentation layer:** selected sections add, under their heading:
  - **Try this in Demo** — for workflows the static demo really performs: the Dashboard, categories
    and fields, Items (adding, searching, labels, Batch Add, Move to…), Templates, Checklists, the
    Hierarchy, and the Interface and Database settings. It opens that page of the demo in a new tab in
    the guide's language (`demo/?lang=uk#/hierarchy`), with an external-link icon and *(opens in a new
    tab)* for screen readers. Without a published demo the buttons are not rendered.
  - **Requires a self-hosted installation.** — a small note for Download backup, Cloud Backup,
    Restore, Reset, Check for updates, and both AI features, which the public demo cannot do. Their
    instructions stay complete.
  - a **screenshot** of the landing set of the page language, with its caption, that opens in the
    landing's screenshot viewer (Dashboard, Items, item details, item on a phone, checklist run on a
    phone, QR labels, search and filters, Hierarchy).
  - **diagrams** — *Where things are* (Location → Container → Item) and *What things are* (Category →
    Custom fields → Item values) under Core concepts, and *One file holds everything* (Inventory and
    photos → SQLite database → Download backup) under Backup and data safety. Each is a titled figure
    with an ordered list of steps, boxes joined by arrows across on wide screens and down on phones.
- **Language:** the same language dropdown, `inventory-atlas.locale` preference, and `<html lang>`
  handling as the product page. A change loads the other guide in place and keeps the section being
  read; the title, description, Open Graph texts, table of contents, screenshots and captions,
  diagrams, notes, and demo links follow it. The choice carries between the product page, the guide,
  and the demo.
- **Sharing:** a localized title (*User Guide — Inventory Atlas Lite*), description, and Open Graph
  title and description, the canonical address `…/guide/` for every language, and the product's Open
  Graph image. The static HTML carries the English metadata.
- **Accessibility:** a skip link to the article, one `main` and one `article`, one `h1` and `h2`/`h3`
  headings without level jumps, sections labelled by their headings, keyboard-reachable table of
  contents, scrollable tables and code, visible focus outlines, localized alt text and captions,
  diagrams as text, and new-tab links announced as such. With reduced motion, anchors jump instead of
  scrolling smoothly.

## Implementation overview

- **Pages:** `landing/vite.config.js` builds two inputs, `landing/index.html` and
  `landing/guide/index.html`, into `dist-landing/` and `dist-landing/guide/`, which GitHub Pages serves
  at `guide/` under the site's base path. `landing/src/guide.js` mounts `GuidePage.vue` with the same
  Tabler stylesheet, Geist, `landing.css`, and vue-i18n instance as the product page; `followLocale()`
  in `landing/src/i18n.js` keeps the document metadata of each page (`meta` or `guide.meta`) in the
  page language. The navigation, footer, captioned screenshot figure, and the viewer are shared
  components (`SiteNav.vue`, `SiteFooter.vue`, `ScreenshotFigure.vue`, `ScreenshotLightbox.vue` with
  `screenshotViewer.js`).
- **Source of truth:** `guideSourceFile(locale)` in `landing/site.js` names the Markdown of a locale —
  `docs/HOW-TO.md` for English, `docs/HOW-TO.<locale>.md` for every other one.
- **Rendering pipeline:** `landing/guideSource.js` parses the Markdown with
  [markdown-it](https://github.com/markdown-it/markdown-it) (a development dependency used only at
  build time; nothing of it is in the page bundle) with raw HTML disabled, so any HTML in the Markdown
  is shown as text. It splits the document at its `#`, `##`, and `###` headings into the title, the
  introduction, and sections with their subsections, and renders the body of each to HTML: tables are
  wrapped in a focusable `.guide-scroll` box, code blocks get `tabindex="0"`, `#anchor` links are
  mapped to section ids (a link to a missing heading fails the build), and relative links resolve to
  the document's neighbours on GitHub. `GuidePage.vue` renders the headings itself and the bodies with
  `v-html`.
- **Section ids and parity:** the ids are GitHub-style slugs of the English headings without their
  numbers, and must be unique. A translation must match the English document heading by heading — the
  same count, levels, order, section numbers, and number of tables and code blocks per section — and
  its headings take the English ids at the same place; in-page links in a translation may use either
  the id or GitHub's slug of the translated heading, so they also work on GitHub. Paragraph wording
  is free. Any drift throws an error naming the file and the section.
- **Virtual modules:** a plugin in `landing/vite.config.js` serves `virtual:guide` (a loader per
  supported locale) and `virtual:guide/<locale>` (that locale's built guide as JSON), so the page
  downloads only the guide of the language it shows. The plugin checks the presentation metadata at
  build start, watches the Markdown, and reloads the guide page in development when it changes.
- **Presentation metadata:** `landing/guidePresentation.js` maps section ids to `screenshot` (+
  `phone`), `diagrams`, `demo` (a demo hash route), or `selfHosted`; it never holds guide text.
  `presentationProblems()` rejects an unknown section, screenshot, or diagram, a demo route that is not
  a page of the application, a route the demo cannot show, and a section that is both. The demo's
  pages are read by `readDemoRoutes()` from the application route table (`client/src/main.js`) and the
  Settings sections (`client/src/settingsSections.js`); `/data`, `/items/ai`, and every `serverOnly`
  Settings section are the unavailable ones.
- **Screenshots:** the landing sets of `landing/src/assets/screenshots/<locale>/` through
  `screenshotUrl(locale, name)`; no guide-only capture exists. `screenshotSizes` in
  `landing/screenshots.js` gives every image its pixel size, so the browser reserves its space before a
  lazy image loads and an anchor does not move.
- **Diagrams:** `GuideDiagram.vue` renders `guide.diagrams.<name>` — a title and a list of `{ term,
  text }` steps — as a `figure` labelled by its caption with an ordered list; the arrows are CSS
  pseudo-elements with empty alternative text.
- **Demo links:** `demoLink(locale, route)` in `landing/src/content.js` builds `?lang=<locale>` and
  `#<route>` on `LANDING_DEMO_URL` (the hero's Try Demo uses `/dashboard`).
- **Reading position:** `GuidePage.vue` tracks the heading being read on scroll (the last heading whose
  top has passed the sticky bars). The first load scrolls to the address's anchor once the guide and
  the typeface are ready; a language change scrolls back to the heading being read. The anchor offset
  is the headings' `scroll-margin-top` (5.5 rem, 8 rem below 992 px, plus room for a section number),
  not the page's scroll padding, because Chrome scrolls the page when focus enters a sticky navigation
  inside the scroll padding; for the same reason the language menu and the On this page button move
  focus with `preventScroll`.
- `.github/workflows/pages.yml` also deploys the site when `docs/HOW-TO.md` or a translation changes.

## Updating the guide

1. Change `docs/HOW-TO.md` as usual (see `AGENTS.md`, *User guide maintenance*).
2. Make the same change in `docs/HOW-TO.uk.md`: translate new or changed sections naturally, keep the
   headings, their levels, order, and numbers, and the tables and code blocks of every section.
3. Renaming an English heading changes its public anchor: update the id in
   `landing/guidePresentation.js` and any in-page link to it. A new section that the demo can show,
   or that needs a real installation, can get an entry there.
4. Run `npm test` (or `npm run landing:build`); a drift error names the section to fix.

## Adding another locale

Next to the steps in [Public landing page](landing-page.md#adding-another-language), add
`docs/HOW-TO.<locale>.md`, structurally identical to `docs/HOW-TO.md`, and the `guide.*` messages to
`landing/src/locales/<locale>.json`. The build, the virtual modules, the source link, and the tests
pick the locale up from `SUPPORTED_LOCALES`.

## Verification

- `test/landing.test.js`: the English guide is built from `docs/HOW-TO.md` and the Ukrainian one from
  `docs/HOW-TO.uk.md` (titles, sections, subsections); every language has the same unique section ids
  and numbers; a removed section, a changed heading level or number, a missing table or code block,
  and an in-page link to a missing heading each fail the build; raw HTML stays text; repository links
  open on GitHub and in-page links use the canonical ids; the presentation metadata is valid and its
  checks catch each kind of mistake; the demo routes and the unavailable ones; the self-hosted
  sections offer no demo; the source links exist; every screenshot has its real size; and no sentence
  of either guide appears in a landing source.
- `test/e2e/guide.spec.js` against the production build under `/pages-base-test/`: the landing's
  Guide and Read the user guide links, View source, and the way back; the title, canonical, Open Graph
  tags, no failed request, Geist, and the dark band; the English sections; the skip link, one `main`
  and `article`, unique ids, no heading jumps, and the heading links; a deep link and a reload; the
  desktop table of contents (links, the current location, keyboard use of a subsection, staying in
  view); the phone On this page panel (size, choice, the current section, Escape and focus); the
  localized screenshot and the viewer; the diagrams in both languages; the table and code block that
  scroll inside their box on a 360 px phone; Try this in Demo in both languages and the demo opening
  in Ukrainian on the Hierarchy, and the self-hosted notes without demo links; the language change
  that keeps the section and translates title, metadata, table of contents, captions, source link, and
  screenshots, through a reload; the language from the landing to the guide and back; no sideways
  scrolling at 360, 390, 430, 768, 1366, and 1920 px with the sidebar only from 992 px; and the 24 px
  gutter on phones.

## Notes and limitations

- The guide is rendered in the browser from the built JSON; crawlers that do not run scripts see the
  title band's static metadata only. There is one canonical address for every language.
- The screenshots are the landing's light-mode captures; no section has a guide-only screenshot.
- The release notes, technical documents such as `docs/proxmox.md` and `docs/features/`, and the
  links to them stay in English on GitHub.
