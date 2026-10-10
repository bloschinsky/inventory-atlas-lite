# Settings as a route-driven dialog

- Completed: 2026-10-10
- Version: 0.63.0
- Task: GitHub issue #28

## Summary

Settings no longer replaces the page it is opened from. Every `/settings/<section>` address now opens
the Settings center as a Tabler dialog over the page the user was on, which stays rendered and
unchanged underneath; see `docs/features/settings-center.md`.

- **Routing:** the routes are unchanged (`/settings` and unknown sections still redirect to
  `/settings/interface`). The new `client/src/settingsOverlay.js` records the route a Settings address
  was entered from as the background, clears it on any other route, and gives the page area the
  background route — or `/dashboard` for a directly loaded address — through `usePageRoute()`.
  `App.vue` renders the page area through the new `components/PageView.vue`, which passes that route
  to its `<RouterView>` and provides it to `useRoute()`, so the covered page keeps its own address,
  state, and scroll position and is never created again. A second `<RouterView>` renders the dialog
  only on a Settings address, outside the `inert`, `aria-hidden` page.
- **Navigation:** sections replace the address (no extra history entries). Close, `Escape`, and the
  backdrop go Back when the covered page is the previous entry, otherwise to that page; a directly
  loaded address is replaced by `/dashboard`. Back and Forward close and reopen the dialog over the
  right page. The Cloud Backup OAuth return addresses and their notices are unchanged and open over
  the Dashboard.
- **Dialog:** `pages/Settings.vue` is now the dialog — up to 920px wide and `88dvh` high on desktops
  and tablets with the grouped section list and an independently scrolling section pane, full screen
  with the Section selector on phones. It locks the page scroll, moves the focus in, wraps `Tab`,
  restores the focus, and yields `Escape` and the focus to About, Version History, and What's New,
  which now stack above it and keep the scroll lock when they close over it.
- **Unsaved changes:** `useUnsavedChanges()` lets the AI form, the cloud backup schedule, the cloud app
  credentials, and the database name report edits that differ from the last loaded or saved values;
  a router guard asks *Discard the unsaved changes in Settings?* before closing, switching sections,
  Back, or any other navigation, and never on a query-only change.
- **Copy:** new `settings.close` and `settings.discardChanges` keys in English and Ukrainian replace
  the unused page subtitle.
- **Documentation:** `docs/features/settings-center.md`, its index entry, the *Find a setting* section
  of `docs/HOW-TO.md` and `docs/HOW-TO.uk.md`, `AGENTS.md`, and the 0.63.0 release-history entry.

## Verification

- `npm run lint` — passed.
- `npm test` — 349 of 351 passed. The two failures are the guide tests in `test/landing.test.js`
  ("a translation that drifts from the canonical guide structure fails the guide build" and "the guide
  renders Markdown safely and sends repository links to GitHub"), which fail the same way on a clean
  `master` on this Windows machine (checked with `git stash`).
- `npm run build` — passed.
- `APP_VERSION=0.63.0 npm run test:e2e` — 239 of 240 passed. The failure was
  `demo.spec.js` "a language change seeds the demo again…", which still expected the demo banner while
  Settings covered it; after closing the dialog in that step, `demo.spec.js` and
  `settings-navigation.spec.js` passed (17/18, then `demo.spec.js` 22/22 with `--repeat-each=2`; the
  one failure in between, "every generated photo is served from the static demo assets", does not
  touch Settings and passed on the repeat).
- New and updated Playwright coverage: `settings-navigation.spec.js` (redirects and direct addresses
  over the Dashboard, opening over Items with the search, scroll, and page instance kept, dialog size
  and semantics, sections without history entries, pane scrolling, focus trap and restoration,
  `Escape`/Back/Forward, the Data / Backup link, the unsaved-changes prompt, the full-screen phone
  dialog from the drawer, dark mode in Ukrainian), plus `navigation`, `ai-visibility`, `i18n`,
  `fluid-workspace`, `demo`, and `tour` specs adjusted to close the dialog.
