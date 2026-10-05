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
- **Principles:** runs on your server, your data in one SQLite file, phone-friendly, no cloud required.
- **Showcase sections**, each with a short story, four points, and real screenshots: *Everything has a
  place* (Hierarchy), *Categories with fields that fit* (item details and custom fields), *See it,
  label it, scan it* (photos, QR labels, scanner), *Find it fast, check it off* (search, filters, and a
  checklist run on a phone), and *A dashboard for your stuff — and optional AI*. Every screenshot
  links to its full-size file.
- **Install:** four cards — GitHub Release, Docker, Proxmox VE, Node.js — each linking to the existing
  README or `docs/proxmox.md` instructions instead of repeating them, and a note that there are no
  user accounts, so the application belongs on a trusted network or VPN.
- **Final call to action** with Get Inventory Atlas Lite, View on GitHub, and the user guide
  (`docs/HOW-TO.md`), and a footer with the version and release links.
- **Try Demo** next to them opens the [public demo](public-demo.md), the real application running in
  the browser on an invented inventory. Get Inventory Atlas Lite stays the primary install path.
- **Look:** the navigation, the hero with the principles, the final call to action, and the footer
  are dark ink-blue bands; the hero has blue and violet glows under a dot-grid texture that fades
  out downwards. The showcase sections between them alternate two surfaces (white and a cool gray in
  light mode, the two Tabler dark surfaces in dark mode). Every section label has a small gradient
  icon (Organization, Items, Photos and QR, Find and check, Insights, Install).
- **Reveal on scroll:** the principles, both columns of every showcase section, the install heading
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
  GitHub, and install links, the Try Demo link to the demo built into the same site, the release text and link from the release
  history, the canonical, Open Graph, and favicon addresses under the base path, every screenshot
  loading from the base path with alt text and no failed request, and the section headings without
  sideways scrolling at 390, 820, 1366, and 1920 pixels, the dark bands in both system modes, and a
  section that is hidden until scrolled into view but shown at once with reduced motion.

## Notes and limitations

- The screenshots are captured in light mode and in English; they are not regenerated automatically.
- The published page shows the master branch copy with the latest *published* release, so a version
  that is committed but not yet released is never announced.
- The deployment needs Pages enabled with the GitHub Actions source, which a workflow token cannot do.
