# Cross-platform Location autocomplete (#94)

- **Completed:** 2026-11-11
- **Version:** 0.74.7
- **Branch:** `feature/94-location-autocomplete`, started from `bugfix/93-batch-add-fields-mobile-review`
  (#93, 0.74.6, not merged yet) because both change the version, the release history, and the guide;
  the two are meant to reach `master` together.

## Summary

Location in the shared item form was a plain input. Desktop browsers sometimes offered their own
form history, iPhone Safari did not, so Atlas now provides its own suggestions.

- New read-only endpoint `GET /api/items/location-suggestions?search=&limit=` (`inventory:read`,
  added to `routePolicy.js` and the access matrix). `ItemRepository.listRootLocations()` counts each
  trimmed Location of active top-level items; `ItemService.locationSuggestions` groups the spellings
  case-insensitively with Unicode case folding (SQLite folds ASCII only), filters by prefix, sorts by
  usage and then alphabetically, and caps the limit at 20. Nested items' hidden own locations and
  retired items are left out, and a container counts once.
- `ItemDraftFields.vue` renders Location with `FieldAutocomplete.vue` (same id, model, and
  placeholder), so Add, Edit, Duplicate, AI drafts, and templates all get it.
- `FieldAutocomplete.vue`, shared with Transferred To and text custom fields:
  - suggestions are chosen on `click` instead of `mousedown`; only `mousedown` is prevented, so the
    mouse keeps the focus and touch scrolling stays native, and a press on the list keeps it open
    while a phone moves the focus away before the click;
  - a press or focus outside the component closes the list;
  - typing or focusing clears the keyboard highlight, and a response no longer resets it. Mobile
    WebKit showed the old reset losing an arrow key pressed just before a duplicate response arrived;
  - the list is placed against the visual viewport and the sticky top bar, opens above the field when
    the keyboard leaves less than 160 px below it, never grows taller than the visible room, and has
    44 px options on touch screens;
  - a `null` model value no longer breaks it.
- Documentation: new `docs/features/location-autocomplete.md`, updated
  `custom-field-autocomplete.md`, `authentication-and-access.md`, the features index, and the user
  guide in English and Ukrainian.

No schema change, no new interface string, and Location stays free text. The Batch Add Items dialog
has its own Location input and is unchanged.

## Verification

- `test/services.test.js`: a new test for grouping, Cyrillic, ordering, nested and retired items, a
  box taken out of its container, wildcards and quotes, and the limit bounds. `test/e2e.test.js`
  calls the endpoint over HTTP.
- `test/e2e/location-autocomplete.spec.js` (new, 4 tests): the desktop keyboard and mouse flow with
  a new value saved and suggested, a failing endpoint, and with touch emulation at 390 px a tap
  selection without a submit, a tap outside, 44 px options, and the list opening above the field.
- Locally, with a temporary config in Playwright's WebKit (`iPhone 15 Pro` and `Desktop Safari`), the
  new spec and `suggestions.spec.js` passed in both, and `bulk-replace.spec.js` on iPhone. CI keeps
  running Chromium only.
- `npm run lint` — clean.
- `npm test` — 443 of 446 passed (one skipped). The two failures are the known Windows-only CRLF
  guide tests in `test/landing.test.js`, which pass on CI.
- `npm run build` — succeeded.
- `APP_VERSION=0.74.7 npm run test:e2e` — 336 passed (Windows, alternate e2e ports), including the
  landing and guide build checks for the updated English and Ukrainian guide.

## Real iPhone Safari smoke test

Run on the device after the release, in portrait:

1. Open **Add Item** and tap **Location**: the keyboard opens and the locations in use appear, above
   the field if the keyboard leaves no room below; nothing is hidden behind the keyboard or the top
   bar.
2. Type the first letters of a location (also a Cyrillic one in lowercase): the list narrows.
3. Scroll a long list with a finger: nothing is chosen. Tap a suggestion: Location holds exactly that
   value and the item is not saved.
4. Type a brand new location, tap elsewhere, and save: it is saved as typed and suggested next time.
5. Repeat step 3 in **Edit Item**, a template, **Transferred To**, and a text custom field.
