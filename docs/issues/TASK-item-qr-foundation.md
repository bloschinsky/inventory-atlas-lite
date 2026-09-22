# Task: Item QR Identity and QR Code Generation

## Goal
Add stable QR identity support for every item using the existing item UUID. Do not add QR columns/tables and do not store generated QR images.

## Dependency
None.

## QR payload
Canonical format:

```text
ial:item:v1:<uuid>
```

Requirements:
- use `item.uuid`, never numeric ID;
- never encode host/IP/port/domain;
- printed codes must survive moving/restoring the deployment;
- add shared helpers such as `encodeItemQrPayload(uuid)` and `decodeItemQrPayload(value)`;
- validate prefix, version, and UUID strictly.

## QR generation
Add a bundled npm QR library.
- no CDN;
- no remote QR service;
- generate locally;
- SVG/canvas/Data URL is acceptable;
- keep generation reusable for future print labels;
- do not persist QR images.

## Item Details UI
Add **QR Code** near Edit/Delete.

Click opens a Tabler-style modal containing:
- QR code;
- item name;
- optional compact UUID/payload debug text;
- Close.

Do not permanently show a large QR on the details page.

## Containers
No special container QR model. Boxes/containers are normal items and use the same UUID-based QR flow.

## Reusable structure
Prefer a reusable component/helper, e.g. `ItemQrCode.vue`, that future scanner/printing features can reuse.

## Error handling
QR generation failure must not crash Item Details. Show an error in the modal and allow closing it.

## Tests
Cover at minimum:
1. canonical `ial:item:v1:<uuid>` encoding;
2. valid decoding;
3. invalid prefix/version/UUID rejection;
4. modal opens from Item Details;
5. correct item name and UUID are used;
6. navigating between item detail routes updates the QR;
7. no network is required;
8. no QR-related DB schema is added.

## Documentation
Document the stable UUID-based QR identity, deployment-independent payload, and local generation. Follow `AGENTS.md`.

## Out of scope
- scanner;
- `/scan`;
- printing;
- batch selection;
- PDF generation;
- URL-based QR codes.
