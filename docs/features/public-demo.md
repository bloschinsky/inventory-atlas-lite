# Public demo

## Summary

The public demo is the real Inventory Atlas Lite interface running entirely in the visitor's
browser, published with the landing page on GitHub Pages at
<https://bloschinsky.github.io/inventory-atlas-lite/demo/>. It needs no Express server, no SQLite
file, no API key, and no cloud credential. It opens on a curated, invented inventory, lets visitors
try the everyday workflows, and forgets every change on reload. The demo and its inventory are in
English and Ukrainian. The self-hosted application is unchanged: its normal build never contains any
of the demo code.

## User-visible behaviour

- The landing page's hero shows **Try Demo** next to **Get Inventory Atlas Lite** (still the primary
  install path) and **View on GitHub**.
- The demo opens on the Dashboard. A compact strip above every page reads **Demo mode** with *Sample
  data in this browser tab. Changes are not saved and disappear on reload.*, a **Reset demo** button,
  and **Get Inventory Atlas Lite**, which opens the repository. On phones the strip wraps below the
  mobile header.
- Everything that works on the inventory works in the demo: the Dashboard, the Items list with search,
  filters, columns, sorting, cards, and selection (Move to…, Print Labels), item details with photos
  and QR codes, creating, editing, duplicating, and deleting items and photos, Hierarchy (tree and
  graph), Templates, Checklists with runs and container audits, Scan QR, Categories & Fields, Replace
  field value, the database name, the language, and the color mode.
- A **Guided tour** button in the lower-right corner starts an optional presentation in eight
  chapters on the real pages, one contextual action per scene or optional Auto Play; see [Guided tour of the public demo](demo-guided-tour.md).
- **Reset demo**, or simply reloading the page, starts again from the canonical inventory on the
  Dashboard. Changes never reach any server or any other visitor. Browser-local preferences such as
  the language, the color mode, and the Items columns are kept, as in the application.
- Features that need the self-hosted server explain themselves instead of failing: Data / Backup
  shows *Not available in the public demo* in place of Download Backup, Restore, and the Danger Zone
  (Replace field value stays), and so do **Settings → Cloud Backup** and **Settings → AI**. AI Add
  Item and the AI field suggestions are hidden because the demo reports AI as not configured, and
  About → Check for updates answers *Not available in the public demo.*
- Page addresses live in the URL hash (for example `…/demo/#/items`), so every demo page can be
  bookmarked, opened directly, and reloaded on GitHub Pages.

## Languages

- **Which language opens:** the `lang` query parameter of the demo address
  (`…/demo/?lang=uk#/dashboard`) first, then the language saved in this browser under
  `inventory-atlas.locale`, then English. An unsupported value (`?lang=fr`) is skipped. The
  landing page's **Try Demo** passes its own language this way, and it saves the visitor's choice
  under the same key, which the demo on the same site also reads.
- **The inventory is in the same language as the interface.** In Ukrainian the database is *Демо
  Inventory Atlas*, the locations are *Дім / Кабінет*, *Дім / Комора*, *Майстерня*, and *Туристичне
  спорядження*, the categories, field names, item names, descriptions, condition notes, natural-
  language field values, the template, and the checklists are Ukrainian, while product names
  (*Nikon F65*, *Nikkor*), standards (*USB-C*, *HDMI*), units (*mAh*, *W*, *TB*, *V*), serial numbers,
  dates, prices, and numbers stay as they are.
- **Changing the language** in **Settings → Interface** seeds the demo again in the new language and
  reloads the open page's data, so the interface and the sample data never mix two languages; the
  strip confirms *Demo data was reset in English.* / *Демо-дані оновлено українською мовою.* Changes
  made before the switch are discarded, as with Reset demo. The address's `lang` follows the
  choice, so a reload or a copied link opens the same language. An open guided tour closes, and
  starts afresh in the new language. Only the demo does this: in the self-hosted application a
  language change never touches the inventory.

## The canonical inventory

`client/src/demo/fixture.js` is the single definition of the demo data, for every language. Every
name, value, and serial number is invented.

- **One inventory, localized text.** Every category, field, location, item, template, and checklist
  has a stable semantic `key` (`photography`, `mount`, `home-office`, `camera-bag`, `film-roll`,
  `weekend-photo-walk`, …). Relations (category, `parent`, `location`, checklist items, field
  values) refer to keys, and the non-text values — UUIDs, dates, prices, serial numbers, numbers,
  booleans, Condition grades, photo files — are written once. A display text is either one string
  (a proper name, a standard, a value with a unit) or an object with one string per supported
  locale: `{ en: 'Camera Bag', uk: 'Сумка для камери' }`.
- `createDemoFixture(locale)` resolves that text for one language and returns the same keys and
  structure for every language; `byKey(list, key)` and `demoItemUuid(key)` find entities. It
  throws on a missing translation, so a new locale cannot ship a half-translated demo, and gives an
  unsupported locale the English inventory.
- The English inventory, described below, and the Ukrainian one are the same inventory: the same
  ids, UUIDs, relations, photos, and Dashboard figures.


- **Categories and custom fields:** Storage (Material, Labeled), Photography (Mount, Format, Last
  tested), Electronics (Capacity, Connector, Warranty until), Tools (Power source, Voltage), Travel &
  Outdoor (Weight (g), Waterproof), and Archive (Years covered, Digitized) — text, number, date, and
  yes/no fields.
- **Locations and containers:** Camera Bag and Electronics Drawer in *Home / Office*, Archive Box in
  *Home / Storage*, Tool Cabinet in *Workshop*, and Camping Box in *Travel gear*. Their items inherit
  the container's location.
- **Items:** 22 in total — Nikon F65, Nikkor 50mm lens, Speedlight flash, and film rolls in the Camera
  Bag; power bank, USB-C charger, and portable SSD in the Electronics Drawer; multimeter, cordless
  drill, and precision screwdriver set in the Tool Cabinet; handheld radio, compact flashlight, and
  first-aid pouch in the Camping Box; photo negatives, a magazine box, and a document folder in the
  Archive Box; and an HDMI/USB adapter that is deliberately not put away (Unplaced on the Dashboard).
  They cover New/Used, every Condition grade but Broken, Condition Notes, purchase dates and prices,
  serial numbers, and custom field values.
- **Photos:** ten items have a generated photo (see below).
- **Template:** *35mm film roll*. **Checklists:** *Weekend photo walk* (packing) and *Workshop check*
  (verification), which has one completed run, so its items show Last verified and the checklist
  history is not empty.
- Items have the fixed UUIDs `d3e00000-0000-4000-8000-000000000001` … `…000000000022` in fixture
  order, and the seed always creates the same numeric ids, so links, tests, and a guided tour can rely
  on them. Their creation dates are set relative to the visit (`addedDaysAgo`), so the Dashboard's
  30-day activity is never empty.

### Generated demo photos

`client/src/demo/photos/` holds the item photos: 256 × 256 WebP files generated for this project
(synthetic inventory-style photos on a light neutral background), never real or private photos and
never hotlinked images. The build copies them as separate static assets (`dist-landing/demo/assets/`).
The required files are `nikon-f65.webp`, `nikkor-50mm.webp`, `speedlight.webp`, `film-rolls.webp`,
`power-bank.webp`, `usb-c-charger.webp`, `portable-ssd.webp`, `multimeter.webp`,
`cordless-drill.webp`, and `handheld-radio.webp`; `test/demo.test.js` fails when one is missing, is
not WebP, is heavier than 200 KB, or when the folder holds a file the fixture does not use. The same
files can be reused for landing and documentation screenshots and for a guided tour.

## Implementation overview

The demo reuses the server code instead of imitating it:

- `vite build --mode demo` (`npm run demo:build`) builds the regular client from the same
  `index.html` with `__DEMO__` set to `true`, relative asset paths, and its output in
  `dist-landing/demo/`. In the normal build `__DEMO__` is `false`, so the demo branches and the
  dynamically imported demo backend are removed from the bundle.
- `client/src/api.js` is the only data boundary: in the demo, `api()` and `apiBlob()` hand every
  request to the in-browser backend instead of `fetch()`, and `photoUrl(id)` returns an object URL of
  the stored photo instead of `/api/photos/:id`. Components never check for the demo to load data.
- `client/src/demo/backend.js` composes the backend: it loads sql.js (SQLite compiled to
  WebAssembly) and the demo photos, builds the services, seeds the fixture, and dispatches each
  request to the real route tables from `server/src/routes/` (capabilities, categories, Dashboard,
  database metadata, fields, items, templates, checklists, photos). Errors are mapped by the server's
  own `errorResponse()`. Any other `/api` path answers `501 DEMO_UNAVAILABLE`.
- `client/src/demo/express.js` is the small part of Express those route tables use (`Router()` with
  `get`/`post`/`put`/`patch`/`delete`, and the response methods); the demo build aliases `express`
  to it. Photo uploads are read from the request's `FormData` with the same types and limits as the
  server.
- `client/src/demo/sqlite.js` adapts an in-memory sql.js database to the better-sqlite3 calls the
  repositories make (`prepare().run/get/all`, `exec`, `pragma`, nested `transaction` as savepoints,
  and the `SQLITE_CONSTRAINT_*` codes).
- `client/src/demo/services.js` builds the inventory repositories and services over that database
  after applying the real schema from `server/src/schema.js`, which `server/src/db.js` now imports
  as well. `client/src/demo/seed.js` loads the fixture through those services, so it always passes
  the current validation rules; only the fixed UUIDs and the creation dates are written directly.
- `startDemoBackend(locale)` seeds the fixture in the interface language and also returns
  `reset(locale)`, which seeds a fresh in-memory database without a reload; `resetDemoData()` in
  `client/src/api.js` calls it in the active language for the guided tour and a language change and
  advances `dataRevision`, the key `App.vue` gives the page so it loads the fresh data.
  `seedDemoInventory(services, photos, locale)` in `seed.js` maps category and field keys to the ids
  it creates.
- `client/src/i18n/index.js` picks the demo's first language with `pickLocale()` from
  `client/src/i18n/core.js` (`?lang=`, then the saved preference, then English), and in the demo
  `setLocale()` also writes `lang` into the address with `history.replaceState()`, which leaves the
  hash route alone. `DemoBanner.vue` watches the locale, calls `resetDemoData()`, and shows the
  notice; `DemoTour.vue` closes an open tour on the same change.
- `client/src/main.js` uses hash routing in the demo; `client/src/components/DemoBanner.vue` is the
  strip, and `DemoUnavailable.vue` stands in for the server-only Data cards and the Settings sections
  marked `serverOnly` in `client/src/settingsSections.js`.
- `.github/workflows/pages.yml` builds the landing page with `LANDING_DEMO_URL` set to the Pages
  address plus `demo/`, then the demo into `dist-landing/demo/`, checks that the demo is there, and
  deploys both as one artifact, so Try Demo never points to a demo that was not deployed with it. The
  workflow also runs on changes to the client, the server source, the shared rules, and the Vite
  configuration.

### Running the demo locally

```bash
npm run demo:dev      # the demo with hot reload, http://localhost:5173/#/dashboard
npm run demo:build    # dist-landing/demo/ (run after npm run landing:build, which empties dist-landing/)
npm run landing:preview  # serves the landing page and the built demo at …/inventory-atlas-lite/demo/
```

## Static demo versus self-hosted mode

| | Self-hosted application | Public demo |
| --- | --- | --- |
| Backend | Express on Node.js | the same route tables and services in the browser |
| Database | `data/inventory.sqlite` (better-sqlite3) | an in-memory SQLite database (sql.js) per page load |
| Persistence | permanent | none; reload or Reset demo restores the fixture |
| Routing | `/items`, served by Express | `#/items`, static files only |
| Backup, restore, reset, cloud backup, updates, AI | available | not available, explained in place |

## Verification

- `test/demo.test.js` runs the demo data layer in Node: deterministic seeding (two seeds are
  identical, fixed UUIDs and ids), the same keys, ids, UUIDs, relations, photos, values, and
  Dashboard figures in every language, the Ukrainian names, locations, fields, template, checklist,
  and database name with proper names, serials, standards, and units kept, English for an
  unsupported locale, the categories, locations, containers, fields, and photos, search,
  the category filter, the Dashboard, a completed checklist with Last verified, changes that stay in
  one demo database while a new one starts from the fixture, the sql.js adapter (bindings,
  constraint codes, savepoints, foreign keys), and the photo and private-data checks above.
- `test/e2e/demo.spec.js` runs the built demo under the Pages-style `/pages-base-test/demo/` path:
  the strip and its links, the Dashboard and search on the fixture with no request leaving the static
  site and none to `/api`, item details with a loaded photo, every photo served from the demo assets,
  creating and editing items and Reset demo restoring the fixture, a reloaded deep link, the
  not-available explanations, a scan of the built files for API keys and credentials, and the phone
  layout and menu. In every language it checks that `?lang=uk` opens the Ukrainian interface and
  inventory over a saved English choice and survives a reload of a deep link, that `?lang=fr` falls
  back to English, and that a language change in Settings seeds the demo again (the visitor's item
  is gone, the database name and items are Ukrainian, the notice shows, and the address and the
  saved preference follow) and back to English.
- `test/e2e/landing.spec.js` checks that Try Demo points to the demo in the landing language next
  to the install link, and that the Ukrainian landing opens the Ukrainian demo in a new tab.
- `test/e2e/tour.spec.js` covers the guided tour; see [its document](demo-guided-tour.md#verification).

## Notes and limitations

- The first load downloads the SQLite WebAssembly module (about 320 KB compressed) once.
- Templates and checklists created in the demo vanish on reload like everything else.
