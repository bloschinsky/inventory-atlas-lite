# Item QR identity and QR code generation

- **Completed:** 2026-09-22
- **Version:** 0.25.0

## Summary

Every item can now be identified by a QR code built from the UUID it already has. Nothing about the
deployment is encoded and no image is stored, so a printed code survives a move to another host,
port, or address and a restore of the database elsewhere.

- Added `shared/itemQr.js` with the canonical payload `ial:item:v1:<uuid>`:
  `encodeItemQrPayload(uuid)` normalizes and validates the UUID, and `decodeItemQrPayload(value)`
  accepts only this exact format, reporting a foreign prefix, an unsupported version, and a
  malformed UUID as three distinct errors. The numeric item ID is never used.
- Added the bundled dependency `qrcode-generator` (no transitive dependencies). Generation is local
  computation in the browser: no CDN, no remote QR service, no stored image.
- Added `client/src/components/ItemQrCode.vue`, which turns a UUID into one inline SVG path with the
  standard quiet zone, fixed black on white in both colour modes. It carries no page context, so the
  planned label printing can reuse it unchanged. A generation failure renders a Tabler alert instead
  of the image.
- Added `client/src/components/ItemQrDialog.vue`, the modal around it with the code, the item name,
  and the payload as a compact debug line. It follows the existing dialog pattern: Bootstrap markup
  driven by Vue state, `Escape`, backdrop click, and **Close**.
- `client/src/pages/ItemDetails.vue` gained the **QR Code** button next to **Edit** and **Delete**,
  owns the open state, and closes the modal when the route item changes, so the code always belongs
  to the item on screen. No large permanent code is shown on the page.
- Containers needed no special handling: a box is an ordinary item and uses the same flow.
- Added the `.item-qr-code` size rule to `client/src/style.css`.
- No schema, table, column, API route, or stored file was added.

## Documentation

- Added `docs/features/item-qr-identity.md` and its entry in `docs/features/README.md`.
- Updated `docs/HOW-TO.md`: a **QR code** concept row and the new *Show the QR code of an item*
  section.
- Removed the completed `docs/issues/TASK-item-qr-foundation.md`; the two dependent QR tasks in
  `docs/ROADMAP.md` are now listed as unblocked.
- Listed `shared/itemQr.js` in the repository structure in `AGENTS.md`.
- Added the 0.25.0 entry to `shared/release-history.json`.

## Verification

- `npm run lint` — passed.
- `npm test` — passed (79 tests, 1 pre-existing skip). Added `test/item-qr.test.js`: canonical
  encoding and normalization, decoding, rejection of a foreign prefix, an unsupported version and a
  malformed UUID, one offline matrix generation from the payload, and the assertion that the applied
  schema contains no QR-related table or column.
- `npm run build` — passed.
- `npm run test:e2e` — passed, 57 Playwright tests in Chromium. Added `test/e2e/item-qr.spec.js`:
  opening the modal from **Item details** with the item name, the payload line, and the accessible
  name of the code, the assertion that opening it issues no network request at all, and the code
  changing when moving from a contained item to its container.
