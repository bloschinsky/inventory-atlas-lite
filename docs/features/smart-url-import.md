# Smart URL import (Phase 1)

Smart URL import reads a public retailer or manufacturer product page and turns it into reviewed values
for the item form: either a new item draft or a selective enrichment of an existing item. It needs no
AI provider and no API key. Nothing is written to the inventory until the user saves the item form.

## Entry points

- **Items → Add item ▾ → From URL** opens `/items/new?import=url`: the blank Add Item form with the
  import dialog over it.
- **Fill from URL** on an item page opens `/items/:id/edit?import=url`; the same button is in the page
  header of the Add and Edit forms.
- Every entry point is shown only while `/api/capabilities` reports `urlImport: true`. Only the real
  server does; the public demo (in-browser backend) reports `false`, and its item routes do not include
  the import, so a direct request answers `DEMO_UNAVAILABLE`.

## Review dialog

`client/src/components/UrlImportDialog.vue` works on the item form's own state:

1. **Product page URL** and **Read page** call `POST /api/items/import-url/preview`. The URL starts
   at the form's current Source URL.
2. **Found values** lists every proposed change as **Current → Found** with its provenance
   (Structured data, Open Graph, Page meta tags, Page content, or Page address): Name, Description,
   Source URL, and the custom fields of the target category matched by
   `shared/productImport.js`. Values equal to the current ones are left out. An empty current value is
   offered checked; a filled one is marked **Replaces current value** and starts unchecked.
3. For a new item, **Category** starts at the server's suggestion (an existing category whose name the
   page states as its category or breadcrumb, singular and plural counted as one), otherwise empty.
   Changing it re-matches the attributes to that category's fields in the browser with the same
   shared function. An existing item always keeps its category.
4. **Page price** lists the price candidates with their kind (Offer, Sale price, Regular price,
   Lowest/Highest offer). A single clear reading is preselected for display; an ambiguous one is not.
   **Use page price as Purchase Price** is always unchecked and is the only way the amount and
   currency reach `purchase_price`; an existing purchase price is shown as a conflict.
5. **Product images** are loaded one at a time through the server and shown as previews. Only checked
   images are imported, limited to the number of photos the form can still upload with one save.
6. **Other details found** lists page details that no field takes (for example SKU or GTIN when the
   category has no such field). They are never saved and never become the serial number.
7. **Use selected values** / **Apply selected values** writes only the checked values into the form,
   sets the chosen category for a new item, adds the checked images as unsaved photos after the
   existing ones (the cover is unchanged), and shows a notice. The item is then saved with the normal
   form, so `PUT`/`POST /api/items` validation applies and an existing item keeps its id, UUID,
   container, photos, loan, lifecycle, and every value that was not chosen.

The import never fills New, Condition, Condition Notes, Location, Purchase Date, Transferred To,
Serial Number, or the container.

## Server

- `server/src/routes/urlImportRoutes.js` — `POST /api/items/import-url/preview` with
  `{ url, categoryId? }`, and `GET /api/items/import-url/:token/images/:index`, which answers the
  image bytes with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- `server/src/services/urlImportService.js` — validates the address, reads the page, decodes it by
  its declared charset, extracts, maps, and returns the preview. Image candidates stay on the server
  under a random token for 30 minutes (at most 100 previews), so the browser can only ask for "image
  *n* of this preview" and never names an address for the server to fetch. An image must be a real
  JPEG, PNG, WebP, or GIF (magic bytes), at most 15 MB, and at most 50 megapixels (sharp metadata).
- `server/src/urlImport/htmlDocument.js` — a bounded, DOM-free reader of the title, first heading,
  meta and link tags, JSON-LD blocks, and two-cell specification rows and definition lists. Input is
  cut at 2,000,000 characters, every result type has its own limit, and every pattern is linear (tag
  attributes stop at the next `<`, unclosed elements run to the end instead of being searched for
  again). `plainText()` removes tags and script/style content before and after decoding entities and
  drops control and invisible formatting characters.
- `server/src/urlImport/productExtraction.js` — schema.org `Product`/`ProductGroup` JSON-LD first
  (including `@graph`, `@id` references, `hasVariant`, `offers`, `AggregateOffer`,
  `priceSpecification` with a strikethrough or list price, `additionalProperty`, and
  `QuantitativeValue`), then Open Graph and product meta tags (`og:*`, `product:*`, `itemprop`), then
  the page heading, title, and specification tables. Values are plain text with provenance; the
  description is cut to 2,000 characters at a word boundary. Amounts accept a dot decimal and only
  unambiguous thousands separators, must be positive with at most four decimals, and currencies must be
  ISO 4217 codes known to `Intl`; anything else is ignored with a warning. Several current prices, a
  price range, or several currencies make the price ambiguous. Image and canonical addresses are
  resolved against the page and only public-looking `http(s)` URLs without credentials are kept, at
  most eight images. The canonical URL is the proposed Source URL only while it stays on the same site.
- `shared/productImport.js` — deterministic attribute-to-field matching by name or a small alias list
  (Brand/Manufacturer, Model, SKU/Article, MPN, GTIN/EAN/UPC, Color/Colour, Material, Weight, Size, with
  Ukrainian names), converted to the field type and checked with `validateFieldValue()`. Colors map to
  a preset group by name or to `custom` by HEX, following `shared/colors.js`. Different values for one
  field leave it unmatched with a warning. No field is ever created.

### Network protections

`server/src/integrations/publicWebClient.js` is the only code that reads a remote resource, and
`server/src/integrations/publicAddress.js` decides what it may reach:

- only `http:` and `https:` without user name or password; WHATWG URL parsing normalizes unusual IPv4
  spellings before the address is checked;
- IP literals and every DNS answer must be public: loopback, unspecified, RFC 1918, carrier-grade
  NAT, link-local (including `169.254.169.254`), benchmarking, documentation, multicast, and reserved
  IPv4 ranges are refused, and IPv6 is allowed only inside `2000::/3` without Teredo, 6to4, ORCHID,
  and documentation ranges (so IPv4-mapped, NAT64, ULA, and link-local addresses are refused); host
  names need at least two labels and no local-only suffix such as `localhost`, `.local`, `.lan`, or
  `.internal`;
- the check runs inside the connection's own `lookup`, so the address that was validated is the one
  connected to, and every answer must pass; redirects are followed by hand, at most four, and each
  destination is checked again;
- a fresh agent per request (no pooled sockets, no environment proxy), and only a fixed User-Agent,
  `Accept`, `Accept-Encoding`, and `Accept-Language` are sent — never cookies, authorization, or
  anything from the browser request;
- one 15-second deadline for the whole read, the expected media types only (`text/html`,
  `application/xhtml+xml` for pages, the four photo types for images), a declared or decompressed size
  limit (3 MB for pages, 15 MB for images) that also stops gzip, deflate, and Brotli bombs, and at most
  four reads at a time (`URL_IMPORT_BUSY` beyond that).

Errors are stable codes without addresses or remote content: `URL_IMPORT_URL_REQUIRED`,
`URL_IMPORT_INVALID_URL`, `URL_IMPORT_UNSUPPORTED_PROTOCOL`, `URL_IMPORT_URL_CREDENTIALS`,
`URL_IMPORT_BLOCKED_HOST`, `URL_IMPORT_HOST_NOT_FOUND`, `URL_IMPORT_CONNECTION_FAILED`,
`URL_IMPORT_TIMEOUT`, `URL_IMPORT_TOO_MANY_REDIRECTS`, `URL_IMPORT_PAGE_REFUSED`,
`URL_IMPORT_PAGE_UNAVAILABLE`, `URL_IMPORT_UNSUPPORTED_CONTENT`, `URL_IMPORT_TOO_LARGE`,
`URL_IMPORT_NO_PRODUCT`, `URL_IMPORT_PREVIEW_EXPIRED`, `URL_IMPORT_IMAGE_NOT_FOUND`, and
`URL_IMPORT_IMAGE_INVALID`. Partial results carry `URL_IMPORT_WARNING_*` codes for unreadable JSON-LD,
missing product data, several products, ambiguous or invalid prices, a shortened description, and
ambiguous field matches.

## Preview contract

```json
{
  "token": "uuid",
  "pageUrl": "final address after redirects",
  "product": { "name": "", "brand": "", "model": "", "description": "", "sku": "", "mpn": "", "gtin": "",
               "categories": [], "attributes": [{ "name": "", "value": "", "source": "json-ld" }] },
  "provenance": { "name": "json-ld" },
  "baseFields": { "name": "", "description": null, "source_url": "" },
  "suggestedCategoryId": null,
  "categoryId": null,
  "customFields": [{ "fieldId": 1, "name": "", "type": "text", "value": "", "attribute": "", "source": "" }],
  "price": { "candidates": [{ "amount": "129.90", "currency": "EUR", "kind": "sale", "source": "json-ld" }], "ambiguous": false },
  "images": [{ "index": 0, "url": "", "source": "json-ld" }],
  "warnings": [{ "code": "URL_IMPORT_WARNING_PRICE_AMBIGUOUS", "params": {} }]
}
```

`product` holds the raw candidates, `baseFields` and `customFields` what they map to, and `price`
only suggestions. The same normalized result is meant to feed a later optional AI analysis.

## Source URL

Schema version 11 adds the nullable `items.source_url` column; existing databases and restored older
backups are migrated in place with no value. `validateSourceUrl()` in `shared/itemValidation.js`
accepts an absolute `http(s)` address without credentials of at most 2,048 characters and stores the
normalized `URL.href` (`INVALID_SOURCE_URL`, `SOURCE_URL_TOO_LONG`). The item form edits it (not the
template editor), the item page shows it as an external link with `rel="noopener noreferrer
nofollow"`, Duplicate copies it, backups carry it with the database, and the Batch Add from JSON
document accepts an optional `sourceUrl`. It is a reference only: nothing fetches it in the
background.

## Limits and boundaries

- Static HTML only: no script execution, no headless browser, no login, and no attempt to get past
  paywalls, CAPTCHAs, or bot protection.
- No price monitoring, no refresh from the saved Source URL, no variant selection, and no AI analysis
  in this phase.
- The server needs outbound Internet access; it never contacts the local network for an import.

## Verification

- `test/url-import.test.js` — extraction from the fixtures in `test/fixtures/url-import/` (JSON-LD,
  `@graph` ProductGroup, Open Graph fallback with malformed JSON-LD, specification table and
  definition list, a title-only page, invalid, ambiguous, and multi-currency prices, hostile markup),
  linear behavior on runaway markup, attribute matching, the address policy, the fetcher against a
  local server (gzip and Brotli, no credentials sent, private DNS answers, redirects to private,
  literal, `localhost`, metadata, and `file:` destinations, DNS rebinding between connections, size,
  bomb, type, status, timeout, and concurrency limits), the preview service and image tokens, Source
  URL validation and persistence, the version 11 migration and older-backup restore, and the HTTP
  contract.
- `test/e2e/url-import.spec.js` — the new-item and enrich flows, conflicts, the opt-in page price,
  image selection, partial failures and blocked pages, Ukrainian, and the phone layout;
  `test/e2e/demo.spec.js` checks that the demo does not offer the import.
