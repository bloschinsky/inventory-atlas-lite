# Smart URL import, Phase 3: Refresh from Source, product variants, and pages built by JavaScript

- Completed: 2026-10-11
- Version: 0.65.0
- Task: GitHub issue #35 (builds on #33 and #34)

## Summary

Phase 3 extends the existing Smart URL import instead of adding a second importer, editor, or AI
pipeline: the same secure fetcher, extraction, field matching, review dialog, price opt-in, image
selection, and optional AI enhancement are reused. See `docs/features/smart-url-import.md`.

- **Refresh from Source (Feature A):** an item with a saved Source URL shows **Refresh from Source**
  on its page (`/items/:id/edit?import=refresh`) and in its Edit form beside Fill from URL.
  `UrlImportDialog.vue` gets the saved address as `refreshUrl`, shows it read-only, and reads it at
  once with the unchanged preview endpoint; **Read again** repeats the read. The review is the usual
  Current → Found comparison with per-field selection, conflicts unchecked, and the price opt-in off.
  A dead, refused, blocked, slow, or empty page shows its error with *The item was not changed.*
  Every preview now carries `fetchedAt`, shown in the review. Nothing is persisted for a refresh (no
  last-checked time, page copy, or price history), there is no background or scheduled read, and no
  migration was needed.
- **Product variants (Feature B):** `productExtraction.js` reads `ProductGroup` variants from
  `hasVariant` (including `@id` references) and `isVariantOf`, at most 30, each with only its own
  identity, attributes, offers, and images. Several variants with distinct labels (built from
  `variesBy` and the attributes that differ) are listed; until one is chosen, the page-level result
  keeps only what they share and drops the preselected variant's meta identifiers, image tags, and
  specification rows of varying attributes. Variants that cannot be told apart are not offered
  (`URL_IMPORT_WARNING_VARIANTS_AMBIGUOUS`). `selectVariant()` never mixes values of different
  variants or falls back to the group's identifiers, prices, or images. The new
  `POST /api/items/import-url/:token/variant` builds a variant's preview from the reading kept in
  the session (no second fetch) under a new token, so its images and AI facts are the variant's. The
  dialog's **Choose variant** select starts at *Not chosen* and lists labels with each variant's
  single current offer; choosing resets the rows, price choice, images, and AI suggestions.
- **Pages built by JavaScript (Feature C):** the optional headless-browser fallback was evaluated and
  not shipped, as the issue allows when robust isolation cannot be guaranteed. A renderer would make
  arbitrary subresource, frame, WebSocket, and redirect requests that would each need the fetcher's
  connection-time address checks or a verified default-deny network sandbox, plus process and
  resource isolation, and it would add a large browser runtime to the default container; Playwright
  is only a development dependency and no such isolation exists in the supported deployments.
  Instead, `htmlDocument.js` counts scripts and measures readable text, and a page without product
  data, with scripts, and under 500 readable characters is reported as built by JavaScript
  (`URL_IMPORT_WARNING_SCRIPT_RENDERED`, or `URL_IMPORT_SCRIPT_RENDERED` when nothing is left). No
  script is fetched or run. Consequently no browser SSRF regression suite applies.
- **Copy and docs:** `urlImport.refresh*`, `urlImport.fetchedAt`, `urlImport.variant.*`, and six new
  error and warning codes in English and Ukrainian; `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (entry
  point, read time, the new variant step, failure behavior, limitations), the feature document and
  its index entry, `AGENTS.md`, and the 0.65.0 release-history entry.

## Verification

- `npm run lint` — passed.
- `npm test` — 386 passed and 2 failed. The two failures are the guide tests in `test/landing.test.js`
  ("a translation that drifts from the canonical guide structure fails the guide build" and "the
  guide renders Markdown safely and sends repository links to GitHub"), which fail the same way on
  this Windows machine with the changes stashed. `test/url-import.test.js` adds the variant fixture
  `test/fixtures/url-import/product-variants.html` and covers variant extraction, ambiguous, single,
  and over-limit variants, the variant preview (no second fetch, new token, per-variant fields,
  offer, images, and AI facts, invalid indexes, expiry), pages built by scripts, and Refresh from
  Source of unreadable pages leaving items, field values, and history untouched.
- `npm run build` — passed.
- `APP_VERSION=0.65.0 npm run test:e2e` — 250 passed (including the landing and demo builds). `test/e2e/url-import.spec.js` adds
  Refresh from Source with selective apply and preserved identity, container, serial number, New, and
  Purchase Price; a dead source and a page built by scripts; and an explicit variant choice with its
  own values, offer, and images.
