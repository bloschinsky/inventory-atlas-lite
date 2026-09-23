# Batch Add Items from JSON

## Summary

Several items of one category can be created in one reviewed batch. The user opens **Batch Add from
JSON** on the Items page, picks the category, pastes or generates an item import document, presses
**Preview**, edits or removes the proposed items, and then commits them with a single atomic request.
Nothing reaches the database before that explicit confirmation, and a failed batch creates no item.

The feature covers structured item data only. It does not import photos, download images, accept
base64 data, or call any AI service; photos are added to each item afterwards through its form.

## Item import format

```json
{
  "version": 1,
  "category": "Computer Equipment",
  "items": [
    {
      "name": "USB hub",
      "condition": "Good",
      "location": "Shelf A",
      "description": "",
      "transferredTo": "",
      "purchaseDate": "2024-05-01",
      "purchasePrice": { "amount": 350.5, "currency": "UAH" },
      "serialNumber": "HB-7",
      "customFields": { "Brand": "D-Link", "Ports": 7, "Released": null, "Working": true }
    }
  ]
}
```

- `version`, `category`, and `items` are required, and no other top-level property is accepted.
- `version` must be `1`.
- `category` must name the category selected in the dialog (compared trimmed and case-insensitively).
  The selected category is authoritative; the document cannot redirect items to another one.
- `items` must contain between 1 and 100 entries.
- An item accepts only `name`, `condition`, `location`, `description`, `transferredTo`,
  `purchaseDate`, `purchasePrice` (`amount` and `currency` only), `serialNumber`, and `customFields`.
  All of them are optional in the document; the name is required before the batch can be created.
  Server-owned values — IDs, UUIDs, timestamps, and the containing item — cannot be expressed, and
  any such property is rejected as unsupported.
- The text attributes must be strings or `null`. `purchasePrice.amount` may be a number, a string, or
  `null`; `purchasePrice.currency` a string or `null`.
- `customFields` is keyed by the names of the category's current custom fields, matched trimmed and
  case-insensitively. An unknown name is rejected with the list of the category's fields instead of
  creating a field; naming the same field twice is rejected too. Values are text, a number,
  `true`/`false`, or `null`. Fields left out stay empty.

## User-visible behaviour

- **Batch Add from JSON** sits next to **Add item** in the Items page header and is disabled until a
  category exists. The dialog's **Category** selector starts at the category the list is filtered
  by, and the dialog title names the selected category.
- **Insert Template** builds a document for the selected category on demand: two blank items with
  every base attribute, the purchase fields (currency `UAH`, like the item form), the serial number,
  and one `customFields` key per current field of the category — `""` for text fields and `null` for
  number, date, and boolean fields. A non-empty editor asks for confirmation before it is replaced.
- **Preview** parses the document. Document-level problems — invalid JSON, a missing or unsupported
  version, a category mismatch, a missing or empty `items` array, more than 100 items, an unsupported
  property, a wrongly typed attribute, or an unknown custom field — are shown as one actionable
  message, and no preview is produced.
- A parsed document becomes one card per proposed item. Every base attribute, the purchase date,
  the purchase price amount and currency, the serial number, and every custom field are editable:
  booleans are a Yes/No list, dates use the date control, numbers and text are text inputs.
- Value problems are shown inline on the affected control and the card is outlined, for example
  `Field "Ports" must be a number.` or `Item name is required.` A summary above the cards counts the
  items and how many need attention. The review is recalculated after every edit or removal.
- **Remove** drops that item from the draft only. **Edit JSON** returns to the pasted text.
- **Create N Items** counts the remaining drafts. It stays disabled while any draft is invalid or no
  draft is left.
- After a successful create the dialog closes, the Items list switches to the batch's category, and a
  dismissible message reports how many items were created. A server-side refusal keeps the dialog and
  its drafts open and shows the reason.
- `Escape`, **Cancel**, the close button, and a click on the backdrop discard the whole draft.

## Implementation overview

- `shared/itemValidation.js` holds the canonical item rules — required name, purchase date, purchase
  price and ISO 4217 currency, 255-character serial number and Transferred To, and custom-field values
  by type (`validateFieldValue`). The server applies them to every create and update, and the batch
  preview runs the same functions in the browser, so its inline errors are the API's errors. Custom
  field messages name the field, and date custom fields must be valid `YYYY-MM-DD` dates.
- `shared/itemImport.js` defines the format:
  - `itemImportTemplate(category, fields)` builds the template from the current fields.
  - `readItemImportDocument(document, { categoryName, fields })` performs the structural checks and
    returns editable string drafts; `parseItemImportDocument(text, context)` adds `JSON.parse`.
  - `reviewItemDraft(draft, fields)` returns the inline errors of one draft.
  - `itemImportDocument(categoryName, drafts)` rebuilds the document sent to the API, and
    `itemImportRequestBody(draft, categoryId, fields)` maps a draft to the regular item create body,
    resolving custom field names to their IDs.
- `POST /api/items/batch` takes `{ "categoryId": 3, "document": { … } }` and answers `201` with the
  created items in document order. `ItemService.createBatch` resolves the category, re-reads the
  document against the category's current fields rather than trusting the client, and then creates
  every item through the same `insertItem` path as `POST /api/items` — `readAttributes`, UUID
  generation in `ItemRepository.insert`, and the field-value writes — inside one
  `ItemRepository.transaction`. Any refusal or failure rolls back the whole batch. Refusals are
  `400` with the item position prepended, for example `Item 2: Field "Ports" must be a number.`
- `client/src/components/BatchAddItemsDialog.vue` is the editor and preview; the drafts are plain
  reactive objects and the review is a computed value. It uses the same Vue-driven Bootstrap modal
  markup as the other dialogs, without Bootstrap JavaScript.
- `client/src/pages/ItemsList.vue` owns the button, the success message, and the list refresh.

## Boundaries

- No photos, image URLs, base64 data, or AI processing.
- Items are always created top-level; the containing item is set afterwards in the item form.
- The document cannot create categories or custom fields, and it cannot update existing items.
- There is no item export and no CSV import.

## Verification

- `test/services.test.js` — `batch item import creates every item through the regular item rules`:
  a multi-item import with every base attribute, the purchase fields, the serial number, all four
  custom field types, distinct generated UUIDs, and each refusal (category mismatch, version,
  unknown property, missing or empty items, the 100-item limit, server-owned UUID, unknown custom
  field, malformed number/date/boolean, price amount and currency, serial number length, missing
  name) leaving the item count unchanged. `a batch import that fails while writing rolls back every
  item` makes the third insert fail and checks that no item remains.
- `test/e2e.test.js` — `batch item import creates the whole batch atomically and keeps it over a
  restart`: the HTTP contract, refusals that write nothing, invalid JSON, and persistence after a
  server restart.
- `test/e2e/batch-items.spec.js` — the browser flow: filter by category, open the dialog, insert the
  template and check its category fields, preview a three-item document, see and fix an inline error,
  edit a value, remove one item, create the batch, and check the created items.
