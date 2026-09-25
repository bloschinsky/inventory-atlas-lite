# In-app QR scanner

## Summary

**Scan QR** (`/scan`) reads an Inventory Atlas item QR code with the device camera, or from a chosen
image, and opens the matching item at `/items/<uuid>`. Decoding happens entirely in the browser with
a bundled decoder; camera frames and images never leave the device.

## User-visible behaviour

- **Scan QR** is a navigation entry between **Items** and **Categories & Fields**, in the desktop
  sidebar and in the mobile drawer. The page is laid out for phones first: a square camera preview,
  the hint *Point the camera at an Inventory Atlas label.*, and full-width buttons.
- The camera starts when the page opens and asks for the rear camera
  (`facingMode: { ideal: 'environment' }`), falling back to any camera the browser offers.
- The first decoded code stops the camera. A valid, existing item opens with one router navigation;
  further frames of the same code cannot navigate a second time.
- **Scan from image** accepts any image (photo, screenshot, or on phones a new picture) and decodes
  it the same way. It stays available in every state except while a code is being looked up.
- Results that keep the user on the page, each with **Scan again** (camera) and **Scan from image**
  available for a retry without a reload:
  - `This is not an Inventory Atlas QR code.` — any text that does not start with `ial:item:`,
    including web addresses, which are never opened;
  - `This Inventory Atlas QR code is invalid or uses an unsupported format.` — text that starts with
    `ial:item:` but has another version, a malformed UUID, or extra parts;
  - `Item not found.` — a valid code whose item does not exist in this database;
  - `No QR code was found in this image.` and `This file could not be read as an image.` for the
    image fallback.
- When the camera cannot start, a *Camera unavailable* notice explains why and points to **Scan from
  image**:
  - no `navigator.mediaDevices` on an insecure page (plain HTTP on a LAN address): the live camera
    only works over HTTPS or on localhost;
  - permission denied, no camera, or a camera held by another application, each with its own
    sentence.
- Leaving the page stops every camera track, including a stream that is granted only after the user
  has already left.

## Supported payload

Only the canonical item payload from [`item-qr-identity.md`](item-qr-identity.md) is accepted:

```text
ial:item:v1:<uuid>
```

The scanner uses `decodeItemQrPayload` from `shared/itemQr.js`; it defines no format of its own.

## Implementation overview

- `jsqr` is the bundled decoder (Apache-2.0, no transitive dependencies). It works on raw RGBA
  pixels, so scanning does not depend on the native `BarcodeDetector`, and nothing is loaded from a
  CDN.
- `client/src/qrScan.js`:
  - `decodeQrFrom(source, width, height, canvas, thorough)` draws a video frame or an image onto a
    canvas, scaled so the longest side is at most 1600 px, and returns the decoded text or `null`.
    Live frames skip the inverted-colour pass; a chosen image tries both.
  - `decodeQrFromFile(file)` decodes a chosen file through `createImageBitmap`.
  - `readScannedText(text)` returns `{ uuid }` or `{ error }` with the translation key of the
    message above; the page shows it in the active language.
- `client/src/pages/ScanQr.vue` owns the camera state (`starting`, `live`, `stopped`,
  `unavailable`), samples a frame every 150 ms onto one reused canvas, and guards every result with a
  single `handling` flag that is set before the camera stops and kept after a successful navigation.
- A valid code is checked with `GET /api/items/<uuid>` before navigating, so a missing item is
  reported on the scanner instead of an error page. This lookup of the decoded UUID is the only
  request the scanner makes; the existing item endpoint already accepts a UUID as well as a numeric
  ID, so no API or schema change was needed.
- Nothing is stored: no camera choice, device identifier, frame, image, or scan history.

## Verification

- `test/item-qr.test.js` decodes a generated item code back from its pixels with `jsqr`, and checks
  that `readScannedText` separates items, foreign codes, and broken item codes.
- `test/e2e/scan-qr.spec.js` replaces `getUserMedia` with a repainted canvas stream that shows a real
  generated QR code, and covers: the navigation entry, `/scan`, and the rear-camera request; a valid
  code opening its item with exactly one `pushState` and the camera released; an external URL being
  rejected followed by a successful **Scan again** without a reload; malformed codes and an image
  without a code; a missing item; the camera stopping when another page is opened; a denied camera
  with a working image fallback that sends only `GET` requests without a body; a page without secure
  context explaining the limitation and keeping the fallback; and the phone layout reached from the
  mobile menu without horizontal scrolling.

## Notes and limitations

- The live camera needs a secure context (HTTPS or localhost). Plain-HTTP LAN deployments get the
  image fallback only.
- Only Inventory Atlas item codes are handled: no generic QR reader, external URLs, barcodes, or
  scan history.
- One code per scan: when a frame or image contains several QR codes, the first one decoded wins.
