# Localized public addresses and static sharing metadata

- **Date:** 2026-10-19
- **Version:** 0.67.0
- **Task:** GitHub issue #40 (Social Preview Phase 2), on the images of #39

## Summary

- **Six public addresses.** The product page, the user guide, and the public demo are published in
  English at their original addresses (`/`, `/guide/`, `/demo/`) and in Ukrainian at `/uk/`,
  `/uk/guide/`, and `/uk/demo/`, all under `LANDING_SITE_URL` (a Pages project path or a domain
  root). Each is a static HTML file that GitHub Pages serves with status 200; nothing redirects.
- **Static sharing metadata.** `landing/publicPages.js` defines the pages, their address per locale,
  the Open Graph locales, and `pageHead()`: the localized title and description, canonical address,
  `hreflang` links to every translation with an English `x-default`, `og:type` (*article* for the
  guide), site name, title, description, URL, `og:locale` and its alternate, the page's own
  `og/<page>-<locale>.png` with its size, type, and a new alt text describing that card, and the
  matching X/Twitter large-image card. The copy is `meta.landing`, `meta.guide`, and the new
  `meta.demo` in `landing/src/locales/<locale>.json` (formerly `meta` and `guide.meta`).
- **Shells over one bundle.** `landing/publicPagesPlugin.js` writes the shell of every page and locale
  from the page Vite built: the landing build writes `index.html`, `uk/index.html`,
  `guide/index.html`, and `uk/guide/index.html` over the same bundles, and the demo build (the root
  `vite.config.js` loads the plugin only in `vite build --mode demo`, because the Docker build context
  has no `landing/`) writes `demo/index.html` and `uk/demo/index.html`, the latter loading the one
  bundle from `../../demo/assets/`. The source HTML pages keep only a `<title>` placeholder. In
  `npm run landing:dev`, `/uk/…` is served from the same source pages in Ukrainian. The client-side
  metadata switching (`followLocale()`) and the shared `og-image.png` are gone.
- **The address is the language.** The landing and the guide take their language from the shell's
  `<html lang>` and neither read nor write the saved `inventory-atlas.locale`; the language menu opens
  the same page in the other language with the address's fragment, and the guide passes the section
  being read (or `#top`). Links between the pages, Try Demo, and Try this in Demo stay in the page
  language. The demo takes `?lang=` (older links) and then the shell's language; after a `?lang=`
  link, on a language change in Settings, and on `popstate` (closing Settings goes back to an entry
  made before the change) it moves the address to the shell of the shown language with
  `history.replaceState()`, keeping the `#/route`, so Reset demo and reloads stay in it; without a
  same-origin shell (`npm run demo:dev`, the screenshot capture) it keeps writing `?lang=`. The
  self-hosted application is unchanged.
- **Build and publishing.** `LANDING_DEMO_URL` must be the English demo of the site (the build fails
  otherwise); the Pages workflow passes `LANDING_SITE_URL` to the demo build too and checks that all
  six pages are in the artifact. `capture-screenshots.mjs` no longer writes `og-image.png`.
- **Tests.** New `test/e2e/public-pages.spec.js`: the raw HTTP HTML of the six addresses (status,
  language, one title, description, canonical, Open Graph, X/Twitter, `og:locale`, bidirectional
  `hreflang` and `x-default`, alt text), each `og:image` loading from its absolute address under the
  `/pages-base-test/` base path as a 1200 × 630 PNG, both demo shells on one bundle with every page
  asset loading, each address opening in its own language over a stale saved choice of the other and
  after a reload without failed requests, and the Ukrainian demo through Reset demo and a language
  change. `test/landing.test.js` checks the address rules, every page and locale's head with escaped
  copy, and source pages without sharing tags. The landing, guide, and demo specs now expect the
  locale addresses, the language menu navigation with `#install` and guide sections kept both ways,
  the per-page images, the untouched saved preference, and older `?lang=` links normalized to the
  locale address.
- **Documentation:** `docs/features/landing-page.md` (addresses, sharing, implementation, manual
  preview checks on Telegram, Discord, WhatsApp, and others with their caches, adding a locale),
  `public-demo.md`, `public-user-guide.md`, `interface-localization.md`, `docs/features/README.md`,
  `docs/HOW-TO.md` and `docs/HOW-TO.uk.md`, `README.md`, and `AGENTS.md`.

## Verification

- `npm run lint` — passed.
- `npm test` — 403 passed, 2 failed: the two guide tests in `test/landing.test.js` that also fail on
  a clean `master` on Windows; the new address and shell tests pass.
- `npm run build` — passed; the self-hosted `dist/index.html` carries no sharing metadata.
  `npm run landing:build` and `npm run demo:build` produce all six shells, the Ukrainian demo shell
  loading `../../demo/assets/`. `npm run landing:dev` serves `/uk/` and `/uk/guide/` in Ukrainian.
- `APP_VERSION=0.67.0 npm run test:e2e` — 278 passed, 1 failed: `url-import.spec.js` *a new item is
  drafted from a product page, reviewed, and saved without the page price* timed out; it is unrelated
  to this change and passed when run again alone. All landing, guide, demo, tour, and public-page
  tests passed.

## Release fix

- The first `v0.67.0` Release run failed in *Publish Docker image*: Vite bundles `vite.config.js`
  before running it, so even the dynamic `import('./landing/…')` was resolved in the Docker build,
  whose context has no `landing/` (`Could not resolve "./landing/site.js"`). Nothing was published.
- `vite.config.js` now builds the address of each `landing/` module at run time with
  `new URL(…, import.meta.url)`, which the config bundler leaves alone; they are still loaded only by
  `vite build --mode demo`. `test/landing.test.js` fails on a literal `landing/` import in the config.
- Fixed directly on `master`, and the `v0.67.0` tag moved to the fix, as agreed for this case.
- Verified: `vite build` in a copy of the Docker build context (only the files the Dockerfile copies)
  passed, as did `vite build --mode demo` with both demo shells, `npm run lint`, and
  `test/landing.test.js` (apart from the two known Windows-only guide tests).
