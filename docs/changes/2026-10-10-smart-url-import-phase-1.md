# Smart URL import, Phase 1

- Completed: 2026-10-10
- Version: 0.64.0, released together with Phase 2 (#34, see
  `2026-10-10-smart-url-import-ai-enrichment.md`) under one tag
- Task: GitHub issue #33

## Summary

A public product page address can now draft a new item or selectively enrich an existing one, with
no AI provider; see `docs/features/smart-url-import.md`.

- **Server:** `POST /api/items/import-url/preview` and `GET /api/items/import-url/:token/images/:index`
  (`routes/urlImportRoutes.js`, `services/urlImportService.js`). Extraction reads schema.org
  Product/ProductGroup JSON-LD, then Open Graph and product meta tags, then the title, heading, and
  specification tables (`urlImport/htmlDocument.js`, `urlImport/productExtraction.js`), with
  provenance, warnings, and price candidates (offer, sale, regular, range) that are never chosen when
  ambiguous. Image candidates stay server-side behind a 30-minute token.
- **Network protections:** `integrations/publicWebClient.js` with `integrations/publicAddress.js`:
  http(s) only, no credentials, public addresses only (IPv4 private/reserved ranges, IPv6 outside
  global unicast, local host names), every DNS answer checked inside the connection's lookup,
  manual redirects (at most four) checked again, no cookies or proxy, one 15-second deadline, media
  type allowlists, 3 MB page / 15 MB image limits after decompression, and at most four parallel reads.
- **Matching:** `shared/productImport.js` maps page attributes to existing custom fields by name or
  alias with type conversion and the shared validation; no category or field is ever created.
- **Client:** `components/UrlImportDialog.vue` over the item form (Add item → From URL, Fill from URL
  on the item page and in the form): Current → Found rows with provenance, conflicts unchecked by
  default, the opt-in **Use page price as Purchase Price**, image selection, and unmatched details.
  Values go into the form only; saving uses the normal item API. Hidden in the public demo through the
  new `urlImport` capability.
- **Source URL:** schema version 11 adds `items.source_url`, validated by `validateSourceUrl()`, editable
  in the item form, shown as a link on the item page, carried by Duplicate, backups, and the Batch Add
  JSON document (`sourceUrl`).
- **Copy and docs:** `urlImport.*` and the new error and warning codes in English and Ukrainian;
  `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (new *Fill an item from a product page URL* section,
  limitations, troubleshooting), `landing/guidePresentation.js`, the feature document and its index
  entry, `AGENTS.md`, and the 0.64.0 release-history entry. Existing tests that pinned schema version
  10 or the capabilities body were updated.

## Verification

- `npm run lint` — passed.
- `npm test` — 375 tests: 372 passed, 2 failed. The two failures are the known guide tests in
  `test/landing.test.js` that fail the same way on a clean `master` on this Windows machine. The new
  `test/url-import.test.js` (24 tests) passed.
- `npm run build` — passed.
- `APP_VERSION=0.64.0 npm run test:e2e` — 244 of 244 passed, including the new
  `test/e2e/url-import.spec.js` and the extended `test/e2e/demo.spec.js`.
- Manual: a preview of `https://example.com/` returned its title with the no-product-data warning, and
  `http://localtest.me/` (public DNS name for 127.0.0.1) was refused with `URL_IMPORT_BLOCKED_HOST`.
