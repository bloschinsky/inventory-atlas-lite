# Public experience i18n: localized landing, demo data, guided tour, and screenshots

- **Completed:** 2026-10-06
- **Version:** 0.56.0
- **Issue:** #20

## Summary

The whole public experience — landing page → Try Demo → demo interface → demo data → guided tour →
landing screenshots — is now available in English (the default) and Ukrainian, in the same language
end to end.

- **Landing i18n:** `landing/` uses vue-i18n with its own messages in `landing/src/locales/en.json`
  and `uk.json`, over the application's locale rules in `client/src/i18n/core.js` (the same codes,
  language names, English fallback, and the `inventory-atlas.locale` storage key). `content.js` now
  holds only the language-neutral structure (ids, icons, screenshot names, links); every visible and
  accessible string, the lightbox controls, the page title, the description, and the Open Graph
  texts follow the chosen language, and `<html lang>` is updated. One canonical URL for all
  languages.
- **Language dropdown:** `landing/src/LanguageMenu.vue`, a menu button with `menuitemradio` items
  built from `SUPPORTED_LOCALES`, keyboard accessible, without flags or a Bootstrap script; on phones
  it shows only its icon (as does the GitHub button now, below 576 px).
- **Locale propagation:** Try Demo opens `demo/?lang=<locale>#/dashboard` in a new tab. The demo
  picks its language with the new `pickLocale()` — `?lang=`, then the saved preference, then
  English; an unsupported value is skipped — and keeps `?lang=` in its address in sync on a change.
- **Localized demo fixture:** `client/src/demo/fixture.js` is one structure with semantic keys for
  every category, field, location, item, template, and checklist; display text is a single string or
  a per-locale object. `createDemoFixture(locale)` resolves it (and throws on a missing
  translation); UUIDs, ids, relations, dates, prices, serial numbers, photos, and numbers are shared.
  `seedDemoInventory()` and the demo backend take the locale.
- **Runtime switching:** in the demo, a language change seeds the demo again in the new language and
  reloads the open page's data (`DemoBanner.vue`, with a short localized notice), and closes an open
  guided tour (`DemoTour.vue`). The self-hosted application never touches its data on a language
  change.
- **Guided tour:** chapters identify entities by semantic key, fixed UUID, row hook, or the tour
  item's serial number, never by English text; scene copy names fixture entities through
  placeholders filled from the fixture of the tour's language (`copyParams()`).
- **Screenshots:** one set per locale in `landing/src/assets/screenshots/<locale>/`, captured from the
  built public demo in each language by the rewritten `landing/scripts/capture-screenshots.mjs`
  (`npm run landing:screenshots`, or `-- --locale=uk`); the old sample inventory script was removed.
  The landing build fails when a locale misses a screenshot, publishes each set under
  `assets/screenshots/<locale>/`, and the page loads only the active set.
- Documentation: `docs/features/landing-page.md` (including how to add another locale),
  `public-demo.md`, `demo-guided-tour.md`, `interface-localization.md`, the features index,
  `docs/HOW-TO.md`, `README.md`, and `AGENTS.md`. No task file was created, as the issue requested.

## Verification

- `npm run lint` — passed.
- `npm test` — 286 passed, 1 skipped, 0 failed. New: locale parity and compilation of the landing
  messages, Ukrainian landing copy, both screenshot sets, `pickLocale()`, the same structure, ids,
  UUIDs, relations, values, and Dashboard figures in every demo locale, the Ukrainian demo texts with
  proper names, serials, standards, and units kept, the tour item in every locale, and no fixture name
  in the tour copy.
- `npm run build`, `npm run landing:build`, `npm run demo:build` — passed.
- `npm run landing:screenshots` — generated both sets (35–75 KB per image); reviewed visually.
- `APP_VERSION=0.56.0 npm run test:e2e` — 188 passed, 1 failed: `restore.spec.js` › *validates a
  backup…* timed out waiting for the validation result in the self-hosted Restore flow, which this
  change does not touch; it passed on an immediate re-run on its own. New browser coverage: the
  landing dropdown, Ukrainian copy and metadata, persistence and reload, blocked storage, only
  Ukrainian screenshots from the base path, the Ukrainian viewer, Try Demo's `?lang=` in both
  languages and the demo opening in Ukrainian in a new tab, the Ukrainian landing on phones; the
  demo's `?lang=` priority, the unsupported-locale fallback, and EN → UK → EN reseeding; the tour on
  the Ukrainian inventory (with Replay creating no duplicate) and a language change during a tour;
  and no data change on a language switch in the self-hosted application.
