# Task: In-App QR Scanner

## Goal
Add an in-app scanner that reads Inventory Atlas item QR codes and opens the matching item.

## Dependency
Blocked by **Item QR Identity and QR Code Generation**.

Reuse the shared QR decoder. Do not create another format.

## Route and navigation
Add:

```text
/scan
```

Add a **Scan QR** navigation entry. Mobile usability is primary.

## Supported payload
Accept only:

```text
ial:item:v1:<uuid>
```

Do not open arbitrary QR URLs.

## Main flow
```text
Open Scan QR
→ camera
→ decode QR
→ validate Inventory Atlas payload
→ open /items/<uuid>
```

Use UUID navigation.

## Camera
Use a bundled QR scanning dependency with local fallback decoding.
- no CDN;
- prefer rear/environment camera;
- release camera tracks on route leave;
- stop scanning after successful detection;
- prevent duplicate navigation from repeated frames;
- do not rely only on native `BarcodeDetector`.

## Secure-context handling
Live camera may be unavailable on plain HTTP LAN deployments.

When camera access cannot start:
- show a clear explanation;
- keep the page usable;
- provide **Scan from image** fallback.

## Image fallback
Allow selecting an image/screenshot/photo containing a QR.
- decode locally in browser;
- no upload to backend.

## Validation/errors
Valid existing item:
- navigate to `/items/<uuid>`.

Valid Inventory Atlas QR but missing item:
- show `Item not found.`

Non-Inventory QR:
- show `This is not an Inventory Atlas QR code.`

Malformed Inventory Atlas QR:
- show clear invalid-code message.

Allow retry without reload.

## UX
Suggested structure:

```text
Scan QR

[camera preview]

Point the camera at an Inventory Atlas label.

[ Scan from image ]
```

## Privacy
- do not persist camera/device data;
- do not upload frames or selected QR images.

## Tests
Cover at minimum:
1. `/scan` route;
2. navigation entry;
3. valid payload opens correct item;
4. external URL QR rejected;
5. malformed payload rejected;
6. missing item handled;
7. duplicate detections do not double-navigate;
8. scanner stops on route leave;
9. image fallback works;
10. camera unavailable/permission denied keeps fallback usable;
11. no image/frame upload occurs.

Use mocks/fixtures for camera-dependent browser tests.

## Documentation
Document scanner usage, secure-context limitation, image fallback, local decoding, and supported payload format.

## Out of scope
- generic QR browser;
- external URLs;
- label printing;
- QR history;
- barcodes other than Inventory Atlas QR.
