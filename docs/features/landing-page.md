# Public landing page

## Summary

Inventory Atlas Lite has a public product page, built from `landing/` with Vue 3, Vite, and Tabler
and published to GitHub Pages at <https://bloschinsky.github.io/inventory-atlas-lite/>. It presents
the application as self-hosted software, shows its main workflows with real screenshots, and sends
visitors to the official releases and installation documentation. It is a separate static build: the
application, its build, and its release workflow are unchanged.

## User-visible behaviour

- **Hero:** the product name, the value proposition (*know what you own and where it is*, on your
  own server), a real Items list screenshot with an item page on a phone, and two calls to action:
  **Get Inventory Atlas Lite**, which opens the README's
  [Official releases](../../README.md#official-releases) section (GitHub Releases, Docker, and the
  Proxmox installer), and **View on GitHub**, which opens the repository. Below them, *Latest release
  vX.Y.Z · date* links to that GitHub Release.
- **Facts rail:** the dark hero band continues into a compact rail of six technical facts, each an
  uppercase term over one short line under a hairline with an accent tick: *Self-hosted* (runs on your
  own hardware), *SQLite* (items and photos in one file), *Docker* (ready-made container image),
  *Proxmox* (one-command LXC install), *No accounts* (made for a trusted LAN or VPN), and
  *Local-first* (AI and cloud backup are optional). It is one row of six on wide screens, three
  columns on tablets and laptops, and two on phones; it replaced the earlier four benefit cards.
- **Showcase sections**, each with a short story, four points, and real screenshots, told as a
  numbered product story. The section label reads *01 / Organize* — a two-digit step and one verb
  next to the section icon — above the existing title: *01 / Organize* — *Everything has a place*
  (Hierarchy), *02 / Describe* — *Categories with fields that fit* (item details and custom
  fields), *03 / Label* — *See it, label it, scan it* (photos, QR labels, scanner), *04 / Find* —
  *Find it fast, check it off* (search, filters, and a checklist run on a phone), and
  *05 / Understand* — *A dashboard for your stuff — and optional AI*. The text and the screenshots
  still alternate sides on wide screens.
- **Screenshot captions:** every showcase screenshot is a figure with a short secondary caption in
  the form *Page · what it shows* (*Hierarchy · Grouped by location*, *Items · Search and filters*,
  *Checklist run · Phone*, …); the alt text keeps the full description.
- **Screenshot viewer:** clicking any screenshot, including the two in the hero, opens it enlarged in
  an in-page viewer instead of leaving the page. The viewer is a light panel over a dimmed page,
  whatever the system mode, titled by the screenshot's caption; the image keeps its aspect ratio and
  fits the window without clipping, up to its full 1600-pixel capture. The screenshots of the same
  section (the hero's desktop and phone, the Find section's list and checklist run) form a gallery
  with **Previous** and **Next** buttons, the Left and Right arrow keys, and a *1 / 2* counter. It
  closes with **Close**, Escape, or a click on the dimmed backdrop, and focus returns to the
  screenshot that opened it. On phones the panel uses almost the whole screen with a small margin,
  its buttons are 44 pixels, and the caption wraps to two lines. The screenshots show only a zoom
  cursor and a slight lift on hover — no extra buttons. Each screenshot is still a link to its
  full-size file, so a modified click (new tab, new window) or a page without its script opens the
  image itself.
- **Install:** four cards — GitHub Release, Docker, Proxmox VE, Node.js — each linking to the existing
  README or `docs/proxmox.md` instructions instead of repeating them, and a note that there are no
  user accounts, so the application belongs on a trusted network or VPN.
- **Final call to action** with Get Inventory Atlas Lite, View on GitHub, and the user guide
  (`docs/HOW-TO.md`), and a footer with the version and release links.
- **Try Demo** in the hero opens the [public demo](public-demo.md), the real application running in
  the browser on an invented inventory, in a new tab (`target="_blank"`,
  `rel="noopener noreferrer"`), so the landing stays open behind it. An external-link icon after the
  label shows that, and screen readers hear *Try Demo (opens in a new tab)*. Get Inventory Atlas
  Lite stays the primary install path.
- **Look:** the navigation, the hero with the facts rail, the final call to action, and the footer
  are dark ink-blue bands; the hero has blue and violet glows under a dot-grid texture that fades
  out downwards. The showcase sections between them alternate two surfaces (white and a cool gray in
  light mode, the two Tabler dark surfaces in dark mode). Every section label has a small gradient
  icon.
- **Typography:** the landing alone uses Geist, a variable sans-serif, over Tabler's system font
  stack as the fallback; the application keeps Tabler's fonts. The hero title is weight 720 with
  −0.03em tracking and about 34–36 pixels on phones (up to 56 on desktops), section titles are weight
  680 with −0.02em tracking, and body text is 17–18 pixels with lines kept to about 60–65
  characters; labels, facts, captions, and release text stay small and compact.
- **Gutters:** every band shares one side gutter: 24 pixels on phones and 32 pixels from tablets up.
  On phones the hero spacing between the label, title, lead, buttons, and release line is tuned, the
  buttons are full width, and below 400 pixels the navigation's GitHub button shows only its icon so
  the bar stays on one row.
- **Reveal on scroll:** the facts rail, both columns of every showcase section, the install heading
  and cards, and the final call to action fade and slide in once as they enter the viewport, with a
  short stagger. With *reduce motion* set in the system, or without the page script, everything is
  shown at once.
- The page follows the visitor's light or dark system mode, works from phones to wide desktop
  screens without sideways scrolling, stacks the sections on narrow screens with full-width buttons,
  and has a skip link, semantic headings, visible focus outlines, and descriptive alt text on every
  screenshot. It contains no analytics or tracking.
- Sharing metadata: a title, a description, a canonical URL, Open Graph and Twitter card tags with a
  1200 × 630 Dashboard image, and an SVG favicon of the product mark.

## Implementation overview

- `landing/index.html`, `landing/src/main.js`, `App.vue`, and `FeatureSection.vue` are the page;
  `landing/src/content.js` holds its English copy, screenshot imports, and alt text, and
  `landing/src/landing.css` a small layer on Tabler. The dark bands carry `data-bs-theme="dark"`, so
  Tabler's own dark colors style their text and buttons in either system mode; `App.vue` runs one
  `IntersectionObserver` that marks `.landing-reveal` elements visible. The page is
  English-only public copy, so the vue-i18n rules of the application do not apply to it.
- `content.js` also holds the facts (`facts`), each section's story verb (`verb`; `App.vue` passes
  its position as `number`), and every screenshot's `caption`; the hero screenshots are a list like a
  section's `media`.
- `landing/src/ScreenshotLightbox.vue` is the viewer: one native modal `<dialog>` for the whole page,
  which gives the top layer, an inert page behind it, focus containment, and Escape without a
  gallery library or Bootstrap's script (the landing loads Tabler's CSS only). The component adds the
  gallery, the arrow keys, the backdrop click, the scroll lock (`landing-viewer-open` on `<html>`),
  and the focus return. `App.vue` provides `openScreenshot(gallery, index, event)` to the hero and
  to `FeatureSection.vue`; it leaves modified clicks to the plain link.
- The font is `@fontsource-variable/geist` (SIL Open Font License 1.1), a development dependency
  imported in `landing/src/main.js`; Vite bundles its WOFF2 files (Latin, Latin Extended, Cyrillic,
  and Vietnamese subsets, loaded by `unicode-range` only when needed) into `dist-landing/assets/`
  under the base path, so the page makes no font request to another host. `landing.css` sets
  `--tblr-body-font-family` to `'Geist Variable'` before Tabler's system stack. The application in
  `client/` never imports it.
- The gutter is `--landing-gutter` in `landing.css`; it sets Tabler's `--tblr-gutter-x` on every
  `.container-xl`, so the rows' negative margins and their columns' padding keep the content on the
  same line without nested padding.
- `landing/site.js` holds the build-time facts shared by the build and the tests: the repository
  URL, the documentation links, the default Pages address, and `landingRelease()`.
- `landing/vite.config.js` is the separate build (`npm run landing:build`, output `dist-landing/`):
  - `LANDING_SITE_URL` is the Pages address; its path is the Vite `base`, so every asset and the
    favicon load from the repository path, and the address is written into the canonical and Open
    Graph tags. The default is the repository's GitHub Pages address.
  - `LANDING_RELEASE_TAG` is the latest published GitHub Release. Its entry in
    `shared/release-history.json` provides the version and date; a tag without an entry fails the
    build. Without a tag (a local build) the newest history entry is used. Nothing on the page is
    edited for a release.
  - `LANDING_DEMO_URL` is the address of the public demo; without it the Try Demo button is not
    rendered. The Pages workflow sets it to the Pages address plus `demo/`.
- `.github/workflows/pages.yml` builds and deploys the page: on pushes to `master` that touch the
  landing or the release history, after every successful **Release** workflow run, and on demand.
  It reads the Pages address with `actions/configure-pages`, looks up the latest published release
  with `gh release view`, installs with `npm ci --ignore-scripts` (the install scripts only fetch the
  server's background-removal model), builds the page and then the [public demo](public-demo.md) into
  `dist-landing/demo/`, checks that the demo is there, and deploys with `actions/upload-pages-artifact` and
  `actions/deploy-pages`. Each step is named, so a failure points at the address, the release, the
  install, the build, or the deployment.
- **Screenshots** live in `landing/src/assets/screenshots/` (WebP, 30–60 KB each) and the Open Graph
  image in `landing/public/og-image.png`. `npm run landing:screenshots` builds the application, starts
  the production server on a temporary data directory, fills it through the API with the fictional
  household inventory of `landing/scripts/sampleInventory.mjs`, and captures the pages in Chromium at
  1200 × 780 (desktop) and 390 × 844 (phone) with `landing/scripts/capture-screenshots.mjs`. Item
  photos are flat illustrations drawn as SVG in that file and rasterized locally, so no private
  inventory or photo can appear on the public page. Re-run it after a visible interface change.

### Local development

```bash
npm run landing:dev        # http://localhost:5174/inventory-atlas-lite/
npm run landing:build      # dist-landing/
npm run landing:preview    # serves dist-landing/ at http://localhost:4174/inventory-atlas-lite/
npm run landing:screenshots
```

### GitHub Pages setup

Pages must be enabled once in the repository: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. Until then the *Read the GitHub Pages address* step fails with *Get Pages site
failed*. The `github-pages` environment that the deployment uses is created by GitHub automatically.

### The demo button

The *Build the landing page* step of `pages.yml` sets `LANDING_DEMO_URL` to the demo that the next
step builds into the same artifact, so the hero shows **Try Demo** only with a deployed demo. A
local build without the variable renders no Try Demo button.

## Verification

- `test/landing.test.js` checks the release resolution (newest entry, a published tag, a tag without
  an entry, an empty history), that no landing source repeats the current version, the site address
  normalization, and that every README anchor and document the page links to exists.
- `test/e2e/landing.spec.js` runs against a production build served under the `/pages-base-test/`
  base path (an extra web server in `playwright.config.js` that also builds the demo into it): the Get Inventory Atlas Lite, View on
  GitHub, and install links, the Try Demo link to the demo built into the same site with its new-tab
  attributes and external-link icon, the release text and link from the release
  history, the canonical, Open Graph, and favicon addresses under the base path, every screenshot
  loading from the base path with alt text and no failed request, and the section headings without
  sideways scrolling at 360, 390, 430, 768, 1366, and 1920 pixels, the dark bands in both system modes, and a
  section that is hidden until scrolled into view but shown at once with reduced motion. It also
  checks the 24-pixel gutter, the hero title size, the one-row navigation, and the full-width buttons
  at 360, 390, and 430 pixels; Geist on the landing, loaded only from its own assets with no
  request to another host, and its absence from the application; the facts rail, the numbered story
  markers, and the captions of each figure; and the viewer — opening in place, the enlarged image,
  Close, Escape, the backdrop, focus return, Previous/Next and the arrow keys, the hero gallery, and
  a phone screen without sideways scrolling where even the tall phone screenshot fits whole.

## Notes and limitations

- The screenshots are captured in light mode and in English; they are not regenerated automatically.
  This is also why the viewer's surface is always light.
- The viewer has no zoom control of its own: on a phone, the browser's pinch zoom enlarges the
  fitted screenshot further.
- The published page shows the master branch copy with the latest *published* release, so a version
  that is committed but not yet released is never announced.
- The deployment needs Pages enabled with the GitHub Actions source, which a workflow token cannot do.
