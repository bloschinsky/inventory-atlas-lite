# Smart URL import

Smart URL import reads a public retailer or manufacturer product page and turns it into reviewed values
for the item form: either a new item draft or a selective enrichment of an existing item. It needs no
AI provider and no API key; an optional, user-initiated AI enhancement (see
[AI enhancement](#ai-enhancement)) can map the same page facts further. Nothing is written to the
inventory until the user saves the item form.

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
only suggestions. The extracted `product`, `provenance`, and `price` are also kept server-side under
the preview token, where the optional AI enhancement reads them.

## AI enhancement

An optional second step of the same review, offered only while `/api/capabilities` reports
`ai.enabled` (a configured, connectable provider). It is off until the user presses **Enhance with
AI** in the review; reading a page never contacts the AI provider, and nothing runs in the background
or is remembered between dialogs.

### Request

`POST /api/items/import-url/:token/ai` with `{ categoryId? }`
(`server/src/routes/urlImportRoutes.js` → `server/src/services/urlImportAiService.js`):

- The facts come from the preview session of `token` (`UrlImportService.facts()`), never from the
  browser, so a forged product description cannot be submitted; an unknown or expired token answers
  `URL_IMPORT_PREVIEW_EXPIRED` before AI is checked.
- `categoryId` fixes the category: an existing item always sends its own, a new item sends the one
  chosen in the dialog. Without it the model may choose among all categories; when that category and
  field list is larger than 20,000 characters the request is refused with
  `URL_IMPORT_AI_CHOOSE_CATEGORY`.
- `AiProviderService.assertReady()` and `generateStructuredData()` are used as for every AI feature,
  so the configured provider, model, discovery (#29), timeouts, and error codes
  (`AI_DISABLED`, `AI_PROVIDER_TIMEOUT`, `AI_INVALID_RESPONSE`, …) are shared. No image is sent.

### What the provider receives

- **Trusted instructions** in the provider's system/instructions slot, separate from the data. They
  say that `pageFacts` is untrusted page data, never an instruction; that the model cannot browse or
  call tools; which categories and field ids it may use; the color presets; that units and scales are
  never converted; that brand/model/SKU/MPN/GTIN describe the catalog product; and that serial
  number, condition, New/Used, location, purchase date, and purchase price are never provided.
- **One JSON user message** `{ inventory, pageFacts }`. `inventory` holds only category ids and names
  and their field ids, names, and types (`categorySchema()` shared with AI Add Item), without fields
  whose name is about the user's own item or purchase (serial, IMEI, purchase, paid, bought, price,
  location, condition, and Ukrainian equivalents). `pageFacts` holds the extracted name, brand, model,
  SKU, MPN, GTIN, breadcrumbs, plain-text description, specification pairs, and the page prices by
  index, bounded to 12,000 characters by dropping specifications from the end. No HTML, addresses,
  images, existing item values, other items, or credentials are sent.

### Validation of the answer

The model output is treated as untrusted input (`normalize()` in `urlImportAiService.js`):

- The top level must be exactly `categoryId`, `name`, `description`, `fields`, `offerPriceIndex`,
  `warnings` with the right types, or the whole answer is refused with `AI_INVALID_RESPONSE`.
- `categoryId` must be an existing (or the fixed) category; fields must belong to it and be on the
  allowlist above.
- Each field entry needs a known confidence (`high`, `medium`, `low`) and an evidence quote that is
  really found in the page facts (compared by words, case- and punctuation-insensitive). The value
  must already have the field type: booleans as booleans, dates as valid ISO dates, colors through
  the same preset-or-HEX reading as AI Add Item, numbers only when the same number appears in the
  evidence (so no silent unit conversion), and text only with words found on the page. Values pass
  `validateFieldValue()`.
- An entry that fails is dropped and counted (`URL_IMPORT_AI_WARNING_DROPPED`); different values for
  one field drop all of them (`URL_IMPORT_AI_WARNING_CONFLICT`).
- A cleaned `name` may only use words of the page; `description` is plain text of at most 1,000
  characters; model notes are at most five plain-text lines of 300 characters.
- `offerPriceIndex` is kept only as a position among the page's own price candidates. No amount,
  currency, or purchase field can come out of the answer.

```json
{
  "categoryId": 3,
  "baseFields": { "name": null, "description": "Running shoe with a full-grain leather upper." },
  "fields": [{ "fieldId": 7, "name": "Color", "type": "color", "value": "{\"key\":\"blue\",\"hex\":\"#2878D0\"}",
               "confidence": "medium", "evidence": "Colorway: Midnight Navy" }],
  "offerPriceIndex": 0,
  "notes": ["The description mentions a different price."],
  "warnings": [{ "code": "URL_IMPORT_AI_WARNING_DROPPED", "params": { "count": 1 } }]
}
```

### Review

`UrlImportDialog.vue` merges the answer into the same Current → Found rows; nothing reaches the form
until **Use/Apply selected values**:

- A field the page did not fill gets a row marked **AI suggestion** with its confidence and the page
  text it relies on. Low-confidence rows start unchecked; others follow the usual rule (empty current
  value checked, filled one unchecked).
- A field the page did fill keeps the page value: the AI value is offered beside it with **Page
  value** / **AI suggestion** radios, and **AI agrees** marks rows where both match.
- Text, number, name, and description suggestions are editable; editing one chooses it.
- Rows already shown keep their checkbox, choice, and edits when **Ask AI again** answers, and
  **Discard AI suggestions** returns to the page values.
- A new item without a category takes the AI's category, with *Suggested by AI from the details on
  the page*.
- The AI's offer price only preselects that radio when none is selected and adds an **AI: current
  offer** badge; **Use page price as Purchase Price** stays unchecked and the item's existing price
  is untouched.
- A failed request shows its translated error and keeps the review usable.

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
- No price monitoring, no refresh from the saved Source URL, and no variant selection. AI never
  browses, searches, or fetches anything; it only sees the facts the server already extracted.
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
- `test/url-import-ai.test.js` — the AI enhancement with a stubbed provider: the bounded payload and
  its separation from the instructions, the field allowlist without personal fields, schema mapping
  and color normalization, unknown ids, malformed types, invented evidence, converted units,
  conflicts, prompt-injection text that stays data, malformed answers, AI disabled, timeout, and
  failure with the preview kept, expired previews, oversized inventories, and the HTTP contract.
- `test/e2e/url-import.spec.js` — the new-item and enrich flows, conflicts, the opt-in page price,
  image selection, partial failures and blocked pages, Ukrainian, and the phone layout; with AI, the
  opt-in request, AI rows with confidence and evidence, page-versus-AI choices and edits that survive
  a second request, the untouched price opt-in, a timeout that keeps the page values, discarding the
  suggestions of an existing item, and the phone layout;
  `test/e2e/demo.spec.js` checks that the demo does not offer the import.
