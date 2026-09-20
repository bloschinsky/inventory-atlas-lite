# Improve AI Add Item identification quality

**Completion date:** 2026-09-20

**Version:** 0.12.2

## Summary

- Changed the default OpenAI model to `gpt-5.6-luna` while preserving explicitly saved model
  settings.
- Removed browser-side image resizing and JPEG recompression from AI analysis, and changed the
  Responses API image detail to `original` so small labels remain readable.
- Added structured visible-marking extraction and prompt rules that distinguish specific commercial
  product names from model numbers, serial numbers, and generic item types.
- Added the Sound Blaster Audigy LS regression case and verified that internal observations do not
  leak into the Add Item draft.
- Updated the AI feature documentation and user guide to describe the new model, image handling,
  identification rules, and data sharing behavior.

## Verification

- `npm run lint` — passed.
- `npm test` — passed (16 passed, 10 platform-specific tests skipped).
- `npm run build` — passed.
- `npm run test:e2e` — passed (26 Playwright tests).
