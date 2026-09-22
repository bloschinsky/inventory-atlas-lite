# QR label printing

## Summary

Items can be selected on the **Items** page and printed as QR labels on A4 sheets. Every label
carries the item's deployment-independent QR code and, optionally, its name, description, category,
and displayed location. Printing uses the browser's own print dialog, which also offers Save as PDF;
nothing is rendered on the server.

## User-visible behaviour

### Selection

- Every table row and every mobile card on **Items** starts with a **Select <item name>** checkbox.
  The table header has **Select all items on this page**, which is indeterminate while the page is
  partly selected and never touches selections on other pages.
- A bar between the filters and the results shows `N selected`, **Clear selection** while anything
  is selected, and **Print Labels**, which is disabled at zero.
- The selection is kept by UUID across paging, search, category filter, sorting, and visits to item
  pages, and after returning from the print view. Only **Clear selection** or a page reload empties
  it. **View** and **Edit** behave as before.
- **Print Label** in the item's **QR Code** modal opens the same print view with only that item.

### Print view (`/labels/print`)

- The page subtitle shows the number of selected items. **Back to Items** returns to the list.
- **Layout** offers three fixed presets, all in millimetres on a 210 × 297 mm sheet:

  | Preset | Grid | Label | QR code | Labels per page |
  | --- | --- | --- | --- | --- |
  | Large | 2 × 4 | 95 × 69 mm | 45 mm | 8 |
  | Standard (default) | 3 × 7 | 63 × 39 mm | 30 mm | 21 |
  | Compact | 3 × 10 | 63 × 27 mm | 22 mm | 30 |

- **Show on labels**: **QR Code** is always on and cannot be switched off; **Item name** and
  **Description** default to on; **Category** and **Location** default to off. Location is the
  effective location, so a contained item shows the location of its outermost container.
- The preview is the printed output itself: one white A4 sheet per page, with a summary such as
  `25 labels on 2 A4 pages`. More items simply make more pages; a selection is never limited to one
  page.
- **Print** calls `window.print()`. The browser dialog handles the printer or **Save as PDF**.
- Selected items that no longer exist are skipped with a warning such as *1 selected item no longer
  exists and was skipped.* If none exist, the page says there is nothing to print.
- Opening `/labels/print` without a selection shows *No items selected* and a link to **Items**.

### Label content and text fitting

- The QR code has the fixed size of the preset and never shrinks; metadata takes the remaining width.
  Without any metadata the code is centred.
- The name is bold and clamped (3 lines in Large, 2 in Standard and Compact), the description is
  clamped (4, 3, and 2 lines), and category and location are single lines with an ellipsis. Long
  unbroken words wrap anywhere. The text column is clipped to the label, so nothing overflows it.
- Labels are black on white in both colour modes, with a light dashed outline as a cutting guide.

## The payload

Every label encodes exactly `ial:item:v1:<uuid>` through the existing `ItemQrCode.vue` component.
No host, port, or URL is encoded; see [`item-qr-identity.md`](item-qr-identity.md).

## Implementation overview

- `POST /api/items/labels` with `{ "uuids": [...] }` returns
  `{ "items": [{ uuid, name, description, category_name, effective_location }], "missing": [...] }`
  in the order of the request. The route in `server/src/routes/itemRoutes.js` stays thin;
  `ItemService.labels` validates the body, trims, lowercases and de-duplicates the UUIDs, applies the
  limit, and reports missing items; `ItemRepository.findLabels` loads every label in one statement,
  passing the UUIDs as one JSON parameter through `json_each` and resolving the effective location
  with the same root CTE as the item list. A print job therefore costs one request and one query,
  whatever its size.
- Non-array, empty, or non-string input is a `400`. More than `MAX_LABELS_PER_PRINT` (500) distinct
  UUIDs is a `400` with *A print job can contain at most 500 labels, but N items were selected.*,
  shown on the print view; the job is never truncated.
- `client/src/labelSelection.js` holds the selection as a reactive `Set` of UUIDs for the lifetime of
  the page, and builds the route to the print view. The UUIDs are passed in Vue Router history
  state rather than the query string: several hundred UUIDs would exceed the HTTP header limit when
  the print view is reloaded, while history state survives the reload.
- `client/src/components/ItemResults.vue` renders the checkboxes; `client/src/pages/ItemsList.vue`
  renders the selection bar.
- `client/src/pages/PrintLabels.vue` owns the presets, the metadata toggles, the paging of labels
  into sheets, and the preview. The preset is applied as CSS custom properties (`--label-width`,
  `--label-qr`, `--label-font`, …) on the sheet container, so one set of rules in
  `client/src/style.css` serves every preset.
- Print CSS: sheets use the named page `labels` (`@page labels { size: A4 portrait; margin: 0 }`),
  are exactly 210 × 297 mm, and break after each sheet except the last. Labels use
  `break-inside: avoid`. The sidebar, the mobile header, the page header, the controls, and the
  alerts are `d-print-none`, and the shell wrappers lose their margins and backgrounds while a sheet
  is on the page (`:has(.label-sheets)`), so only the sheets are printed on white.
- No schema, table, or stored file was added.

## Verification

- `test/services.test.js` covers selection order, de-duplication and case normalisation, the
  inherited effective location, missing items, and the empty, non-string, and over-limit errors.
- `test/e2e/print-labels.spec.js` covers desktop and mobile selection, the selected count, the
  disabled button, selection across pages and filters with sorting, View, and Edit still working, one
  batch request and no per-item request, every label's QR accessible name, the default metadata and
  the toggles, the inherited location, the three presets' label sizes and page counts, the PDF page
  count from Chromium's print output (2 pages for 25 Standard labels, 4 for Large), labels staying
  inside their sheets, long text staying inside the label in every preset without shrinking the
  code, black-on-white print colours in dark mode, hidden application chrome in print media, a
  deleted item's warning also after a reload, the empty print view, the single-item **Print Label**
  path, and a mocked `window.print()`.

## Notes and limitations

- Presets are fixed; there is no label designer, custom size, stored template, font or colour
  choice, or non-QR barcode.
- Physical label sizes are exact only when the print dialog uses A4 paper and 100 % scale.
- The selection lives in memory and is lost on a page reload of the Items page.
