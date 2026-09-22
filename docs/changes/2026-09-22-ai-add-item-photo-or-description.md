# AI Add Item from a photo, a description, or both

- **Completed:** 2026-09-22
- **Version:** 0.23.0

## Summary

AI Add Item no longer requires a photo. The same page, endpoint, draft format, and review flow now
accept a photo alone, a written description alone, or both. AI still only proposes a draft; nothing
is written to SQLite until the normal **Save item** action.

- `client/src/pages/AIAddItem.vue`: the image field became **Item photo (optional)** and is no longer
  a required input, the former hint became the first-class **Item description (optional)** with
  helper text, and the primary action is now **Create Draft** / **Creating Draft…**, disabled while
  both inputs are empty. The **Remove background** checkbox and its helper text are rendered only
  while a photo is selected, and a description-only submission never calls
  `/api/images/remove-background`. Background removal now receives its own form data containing just
  the photo.
- `client/src/pages/ItemForm.vue`: a draft without a proposed photo opens the review form with no
  pending upload instead of an empty photo entry.
- `server/src/routes/aiRoutes.js`: `POST /api/ai/items/analyze` reads `description` and still accepts
  the previous `hint` field name for the same text.
- `server/src/services/aiItemAnalysisService.js`: `analyze()` normalizes the description first and
  rejects a request with neither input using *Add a photo or describe the item before creating a
  draft.* Image MIME and signature validation runs only when a file was uploaded. The OpenAI request
  body adds `input_image` only for photo requests, the instructions were generalized to describe
  evidence, source priority, conflict warnings, and inventory-specific conservatism, and
  `needsDetailedImageAnalysis` is forced to `false` when no image was supplied. Provider and
  no-result failure messages are now source-neutral.

The AI configuration checks, the requirement that a category exists, the strict JSON Schema output,
the stateless `store: false` request, the response normalization, and the rule that existing items
are never sent to OpenAI are all unchanged.

## Verification

- `npm run lint` — clean.
- `npm test` — 70 passed, 1 skipped, 0 failed. The AI API test now covers image-only,
  description-only (no `input_image`, `needsDetailedImageAnalysis` false), both together with a
  conflict surfaced through `warnings`, and the rejection of empty, blank, and over-long
  submissions, alongside the existing masking, scope, and invalid-image cases.
- `npm run build` — client compiles.
- `npm run test:e2e` — 55 passed. New Playwright coverage: a description-only draft through to a
  saved item with no photo and no record before saving, **Create Draft** disabled with no input, the
  photo input no longer being required, background-removal controls appearing only once a photo is
  selected, and the description surviving a failed request. The existing photo and background-removal
  workflows still pass.

## Documentation

- `docs/features/ai-add-item.md` rewritten for the three input modes.
- `docs/features/README.md` index entry updated.
- `docs/HOW-TO.md` section renamed to *Create an item from a photo or a description with AI* and its
  steps, privacy notes, and troubleshooting row updated.
- `docs/ROADMAP.md` entry removed and `docs/issues/TASK-ai-add-item-photo-or-prompt.md` deleted.
- `shared/release-history.json` gained the 0.23.0 entry shown in About → Version History.
