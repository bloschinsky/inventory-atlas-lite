# Specific location field with container inheritance

- Completed: 2026-10-18
- Version: 0.66.0 (released together with #41, the active database indicator)
- Task: GitHub issue #42

## Summary

Items gained an optional plain-text **Specific location** (*Точне місце*) for the exact spot within
the broad **Location**, inherited from the outermost container exactly like the location. **Stored
inside** and `parent_item_id` keep their meaning, and no Room, Shelf, or taxonomy entity was added.
See `docs/features/specific-location.md`.

- **Schema version 12:** nullable `items.location_detail`, `items.retired_location_detail_snapshot`,
  `item_templates.location_detail`, and `item_events.from_detail`/`to_detail`, added by idempotent
  additive migrations that the live database, restore validation, reset, and the sql.js demo share.
  Existing rows stay unset and no history is fabricated.
- **API:** items accept `location_detail` (trimmed, at most 255 characters, new codes
  `INVALID_LOCATION_DETAIL` and `LOCATION_DETAIL_TOO_LONG`); an update or template update that omits
  it keeps the saved value. Item, list, hierarchy, label, and checklist responses carry
  `effective_location_detail`, resolved from the same root as `effective_location`
  (`effective_location_source` names it) in the statements that already resolved the location.
  `retirement.last_location_detail` is the retirement snapshot, and Restore accepts
  `location_detail`.
- **List:** the `locationDetail` core column (hidden by default) sorts by the effective value, and the
  free-text search matches the effective value; only a search makes the count join the roots.
- **History:** `location_changed` is recorded when the effective location or specific location
  changed and carries both, so one save of both fields is one event in one operation and the contents
  of a moved container get theirs with *Moved together with …*. Retired and restored events carry the
  specific location too.
- **Interface:** the field next to Location in the shared item form (Add, Edit, Duplicate, template
  editor) with a hint, placeholder, and one inherited-values note; a Specific location row with an
  inherited note on item details and the location with its specific location on the Retirement card;
  secondary text under Location in the Items table and the joined Location line on phone cards while
  the column is hidden; the Items search placeholder now names the specific location; the *Where is
  this item now?* choice sets both fields from one pair; history, Restore, Batch Add Items (optional
  `locationDetail`), labels, checklists, and the Hierarchy item line show it. The demo's Tool Cabinet
  and Archive Box have a specific location in English and Ukrainian.
- **Copy and docs:** new and changed messages in `en.json` and `uk.json` (the unused
  `itemForm.ownLocation` became `itemForm.ownPlacement`), `docs/HOW-TO.md` and `docs/HOW-TO.uk.md`,
  the new feature document and its index entry, the related feature documents, `AGENTS.md`, and the
  0.66.0 release-history entry. The branch first claimed 0.67.0 while pull request #43 held 0.66.0;
  both features then shipped as one release, so #42 joined the 0.66.0 version and its single
  release-history entry.

## Verification

- `npm run lint` — passed.
- `npm test` — 395 passed, 2 failed, 1 skipped. The two failures are the guide tests in
  `test/landing.test.js` that fail the same way on clean `master` on this Windows machine. The new
  `test/location-detail.test.js` covers the migration and restore of a version 11 database, validation,
  the omitted-attribute rule, inheritance, the list sort and search, history, retirement and restore,
  templates, batch import, and the HTTP contract; existing tests were updated for schema version 12 and
  the new response fields.
- `npm run build` — passed.
- `APP_VERSION=0.67.0 npm run test:e2e` (before the joint release) — 256 passed, including the landing and guide build. The new
  `test/e2e/location-detail.spec.js` covers the form, details, list, search, column, detach choice,
  history, Ukrainian, and the phone card; `getByLabel('Location')` in the item, duplicate, and
  template specs became exact, since it now also matched **Specific location**, and the Items search
  placeholder changed in the specs that use it. An earlier full run had one failure in
  `condition-grading.spec.js` (the folded sidebar intercepted a click after the pointer was left at
  the page corner) that passed on its own and in the final full run.
- `npm run landing:screenshots` recaptured the item list, item details, search, hierarchy, and phone
  screenshots in both languages from the demo, which now shows specific locations;
  `test/landing.test.js` (apart from the two Windows guide failures above) and
  `test/e2e/landing.spec.js` with `test/e2e/guide.spec.js` (47 passed) accept them.

## Joint 0.66.0 release with #41

After #41 (the active database indicator) reached `master`, it was merged into this branch, the
version and the release-history entry were combined into one 0.66.0 release, and the landing
screenshots were recaptured with `npm run landing:screenshots` so they show both the indicator and
the Specific location.

- `npm run lint` — passed.
- `npm test` — 399 passed, 2 failed, 1 skipped; the two failures are the same Windows guide tests
  in `test/landing.test.js` described above.
- `npm run build` — passed.
- `APP_VERSION=0.66.0 npm run test:e2e` — 264 of 264 passed, including the landing and guide build.
