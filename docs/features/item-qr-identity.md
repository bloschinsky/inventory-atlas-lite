# Item QR identity

## Summary

Every item can be identified by a QR code generated from the UUID it already has. The code is
created locally in the browser, contains no address of the installation, and is never stored, so a
printed label keeps pointing at the same record after the deployment moves to another host, port, or
domain, or after the database is restored somewhere else.

## User-visible behaviour

- **Item details** shows a **QR Code** button next to **Edit** and **Delete**. The details page
  itself never displays a large permanent code.
- The button opens a small modal containing the QR code, the item name, and the encoded payload as a
  compact debug line.
- **Print Label** in the modal opens the label print view with this one item; see
  [`qr-label-printing.md`](qr-label-printing.md).
- The modal is closed with **Close**, the **×** button, `Escape`, or a click outside it. Keyboard
  focus starts on the **×** button.
- Containers have no separate model: a box, case, or drawer is an ordinary item and gets the same
  code through the same button.
- The code always describes the item whose page is open. Following a link to a container or to its
  contents closes the modal, and reopening it there shows that item's code.
- If a code cannot be generated, the modal shows the reason in place of the image and stays usable
  and closable; the details page keeps working.

## The payload

```text
ial:item:v1:<uuid>
```

- `<uuid>` is `items.uuid`, the UUID assigned when the record is created. The numeric ID is never
  used, because it is a storage detail that a restore or an export can renumber.
- No host, IP address, port, domain, or path is encoded, so a printed code is independent of how the
  application is reached.
- `shared/itemQr.js` holds the format for both sides of the application:
  - `encodeItemQrPayload(uuid)` trims and lowercases the UUID, rejects anything that is not a
    canonical `8-4-4-4-12` UUID, and returns the payload above.
  - `decodeItemQrPayload(value)` accepts only this exact format and returns the UUID. It reports an
    unknown prefix, an unsupported version, and a malformed UUID as three distinct errors, so the
    scanner can explain what it read.
- The `v1` component is what a future format change would increment; `decodeItemQrPayload` refuses
  every other version instead of guessing.

## Implementation overview

- `qrcode-generator` is a bundled dependency with no transitive dependencies. Nothing is loaded from
  a CDN and no remote QR service is contacted; generation is pure computation in the browser.
- `client/src/components/ItemQrCode.vue` takes a `uuid`, encodes the payload, builds the module
  matrix, and draws it as a single SVG path with the four-module quiet zone. It is deliberately free
  of page context, so the print labels reuse it as is.
- The SVG is fixed black on white in both colour modes, because a scanner needs the contrast rather
  than the theme.
- Generation failures are caught inside the component, which renders a Tabler alert instead of the
  image.
- `client/src/components/ItemQrDialog.vue` is the modal around it, following the existing dialog
  pattern: Bootstrap markup driven by Vue state, no Bootstrap JavaScript, `Escape` and backdrop
  clicks closing it.
- `client/src/pages/ItemDetails.vue` owns the open state and closes the modal when the route item
  changes.
- No schema, table, column, API route, or stored file was added. The QR code is derived from data
  the item already carries and exists only while the modal is open.

## Verification

- `test/item-qr.test.js` covers canonical encoding, normalization, decoding, the rejection of a
  foreign prefix, an unsupported version and a malformed UUID, one offline matrix generation from
  the payload, and the assertion that the applied schema contains no QR-related table or column.
- `test/e2e/item-qr.spec.js` opens the modal from **Item details**, checks the item name, the
  payload line, and the accessible name of the code, asserts that opening it issues no network
  request at all, and checks that moving from a contained item to its container shows the
  container's code.
- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` all pass.

## Notes and limitations

- Reading a code back is described in [`in-app-qr-scanner.md`](in-app-qr-scanner.md), which uses
  `decodeItemQrPayload`. Batch selection and A4 label printing, including Save as PDF through the
  browser, are described in [`qr-label-printing.md`](qr-label-printing.md), which reuses
  `ItemQrCode.vue`.
- Codes are generated on demand and never persisted, so a reprint after an item is deleted is not
  possible, and no cleanup is needed.
- Error correction level `M` with automatic version selection is used, which is enough for the
  fixed-length payload at label sizes.
