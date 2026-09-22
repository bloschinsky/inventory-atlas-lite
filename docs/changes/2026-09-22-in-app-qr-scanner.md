# In-app QR scanner

- **Completed:** 2026-09-22
- **Version:** 0.26.0

## Summary

Added **Scan QR** at `/scan`. It reads an Inventory Atlas item QR code with the camera or from an
image, decodes it locally in the browser, and opens the matching item at `/items/<uuid>`.

- Added the bundled dependency `jsqr` (Apache-2.0, no transitive dependencies). It decodes raw
  canvas pixels, so the scanner does not rely on the native `BarcodeDetector` and loads nothing from
  a CDN.
- Added `client/src/qrScan.js`: frame and image decoding, scaled to at most 1600 px, and
  `readScannedText`, which uses the shared `decodeItemQrPayload` and turns its result into an item
  UUID or one of the scanner messages. No new payload format was introduced.
- Added `client/src/pages/ScanQr.vue`: asks for the rear camera, samples a frame every 150 ms,
  stops the camera on the first code, guards against duplicate navigation, releases every track on
  route leave (including a stream granted after leaving), and checks the item with
  `GET /api/items/<uuid>` so a missing item shows `Item not found.` on the scanner.
- A camera that cannot start (insecure context, denied permission, no camera, camera busy) shows a
  *Camera unavailable* explanation while **Scan from image** keeps working. **Scan again** and
  **Scan from image** allow a retry without a reload.
- Registered the `/scan` route and the **Scan QR** navigation entry with the Tabler QR icon, and
  added the `.app-scan-preview` style.
- ESLint now gives Playwright specs browser globals as well, for callbacks that run in the page.
- No API route, schema, or stored data was added.

## Documentation

- Added `docs/features/in-app-qr-scanner.md` and its entry in `docs/features/README.md`.
- Updated `docs/HOW-TO.md`: the *Scan a QR code to open an item* section with the HTTPS limitation,
  the QR concept row, a limitation entry, and a troubleshooting row.
- Updated `docs/features/item-qr-identity.md` and `docs/features/application-ui.md` for the new
  scanner and navigation entry.
- Removed the completed `docs/issues/TASK-in-app-qr-scanner.md` and its `docs/ROADMAP.md` entry.
- Listed the new client files in the repository structure in `AGENTS.md`.
- Added the 0.26.0 entry to `shared/release-history.json`.

## Verification

- `npm run lint` — passed.
- `npm test` — passed (83 tests, 1 pre-existing skip). `test/item-qr.test.js` now decodes a
  generated item code from its pixels with `jsqr` and checks the classification of scanned text.
- `npm run build` — passed.
- `npm run test:e2e` — passed, 67 Playwright tests in Chromium. Added `test/e2e/scan-qr.spec.js`
  (9 tests, also passed three times in a row with `--repeat-each 3`), which uses a canvas-stream fake camera
  showing real generated QR codes: navigation entry and route, rear-camera request, valid code
  opening the item with exactly one navigation, external URL rejection with retry, malformed codes
  and an image without a code, a missing item, camera release on route leave, denied camera with the
  image fallback sending only body-less `GET` requests, the insecure-context explanation, and the
  phone layout.
- The live camera was not tried on a real device in this environment; camera behaviour is covered
  by the mocked browser tests.
