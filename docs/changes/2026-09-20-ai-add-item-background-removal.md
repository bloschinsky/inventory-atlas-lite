# AI Add Item local background removal

**Completion date:** 2026-09-20

**Version:** 0.13.0

## Summary

- Added an off-by-default **Remove background** option to AI Add Item while keeping the original
  image as the only input to OpenAI analysis.
- Added local CPU segmentation with a reused U2NetP ONNX session, safe image decoding, bounded
  resolution, serialized processing, white-background JPEG composition, and no temporary files.
- Passed the processed image into the normal Add Item photo workflow with a visible preview and
  automatic fallback to the original photo when local processing fails.
- Added deterministic model downloading with SHA-256 verification, Docker packaging, licensing and
  deployment documentation, service coverage, and Playwright coverage for success and fallback.

## Verification

- `npm run lint` — passed.
- `npm test` — passed (18 passed, 10 platform-specific tests skipped).
- `npm run build` — passed.
- `npm run test:e2e` — passed (28 Playwright tests in Chromium).
