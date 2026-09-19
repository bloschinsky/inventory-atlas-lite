# Task: AI Add Item — Local Background Removal

## Summary

Extend the completed **AI Add Item** feature with optional local background removal.

This is **Phase 2** and depends on the successful implementation of:

**Task: AI Add Item**

The feature adds a user-controlled option that removes the background from the uploaded item photo, places the isolated object on a clean white background, and uses the processed image as the final inventory photo.

Background removal must run locally and must not consume OpenAI/LLM tokens.

---

## Dependency

This task is BLOCKED until the main **AI Add Item** task is implemented.

Required existing behavior:

```text
Photo
  ↓
AI analysis
  ↓
Structured item draft
  ↓
Existing Add Item form
  ↓
User confirmation
```

This task extends that pipeline but must not replace it.

---

## Goals

- Add an optional `Remove background` control to AI Add Item.
- Remove the background locally without an AI API call.
- Preserve the original image for AI recognition.
- Generate a clean inventory-friendly final image.
- Place the isolated item on a white background.
- Reuse the processed image in the existing Add Item confirmation form.
- Keep background processing independent from the OpenAI provider.
- Fail gracefully if background removal cannot be completed.

---

## Non-goals

This task must NOT:

- use OpenAI image generation/editing for background removal;
- consume LLM tokens for segmentation;
- alter AI-generated field values;
- replace the original image before AI analysis;
- implement image beautification;
- reshape or redraw the item;
- remove labels, cables, parts, scratches, stickers, or other item details;
- invent missing parts of the object;
- perform generative fill;
- automatically crop so aggressively that item details are lost.

---

## UX

Extend the existing **AI Add Item** dialog/page with:

```text
[ ] Remove background
```

Default:

`Off`

The setting applies only to the final inventory photo.

AI analysis should normally still use the original uploaded image.

---

## Required flow

When `Remove background` is OFF:

```text
Original image
      ├──→ AI analysis
      └──→ Add Item form / final item photo
```

When `Remove background` is ON:

```text
Original image
      ├──→ AI analysis
      │
      └──→ Local background removal
                     ↓
              Transparent subject
                     ↓
                White canvas
                     ↓
               Processed image
                     ↓
              Add Item form
```

Important:

**Do not analyze only the processed image unless there is a concrete implementation reason.**

The original photo may contain useful contextual details, labels, packaging, shadows, text, or edges that improve recognition.

---

## Local processing requirement

Background removal must be local to the Inventory Atlas Lite deployment.

Preferred approach:

- segmentation model running locally;
- CPU-compatible;
- no external image-processing API;
- no per-image cloud fee;
- no OpenAI image API;
- no LLM tokens.

A practical implementation may use a local ONNX-based segmentation solution such as `rembg`, or an equivalent actively maintained solution that fits the existing stack and deployment model.

The exact library may be changed during implementation if there is a strong technical reason.

Avoid introducing an unnecessarily large external service.

---

## Architecture

The implementation should isolate background processing behind a small internal abstraction, for example:

```text
BackgroundRemovalService
  └── removeBackground(image)
```

Possible implementation options:

### Option A — local helper service

```text
Node / Express app
       ↓
local background-removal helper
       ↓
processed image
```

A small Python helper/service is acceptable if that is the simplest reliable integration.

### Option B — native Node solution

Acceptable if:

- quality is sufficient;
- licensing is compatible with the project;
- deployment remains simple;
- memory usage is reasonable.

Choose the simplest reliable implementation.

---

## Licensing

Before adding a background-removal library/model:

- check its software license;
- check the model weights/license if separate;
- document the dependency;
- avoid introducing a license incompatible with the project without an explicit decision.

Prefer permissive licenses where practical.

---

## Image output

The processed result should:

- preserve the item;
- remove the surrounding background;
- use a clean white final background;
- keep the object fully visible;
- keep reasonable padding around the item;
- avoid unnecessary distortion;
- retain good visual quality;
- preserve the original aspect ratio where practical.

Suggested output:

- JPEG for normal photo storage;
- white background;
- high-quality compression;
- sensible maximum resolution consistent with existing image handling.

Do not store a transparent PNG unless the current project has a reason to do so.

---

## Subject framing

After segmentation:

1. determine the visible subject bounds;
2. keep a reasonable margin;
3. center the item;
4. place it on a white canvas;
5. avoid cutting off edges.

Do not aggressively normalize all images to a single square crop unless this matches the current project image design.

If the application already has a canonical item-image size/aspect-ratio pipeline, reuse it.

---

## Original image handling

During the AI Add Item session:

- keep the original uploaded image available;
- create the processed version separately;
- use the original for AI recognition;
- use the processed version as the proposed final inventory photo.

Do not destructively overwrite the original before analysis is finished.

Long-term storage of both versions is NOT required unless the existing data model makes this trivial and useful.

The simplest acceptable implementation stores only the final user-confirmed image.

---

## Failure behavior

Background removal failure must not block AI item creation.

If segmentation fails:

1. show a warning;
2. retain the original image;
3. allow the user to continue;
4. use the original image in the Add Item form.

Example:

> Background removal failed. The original photo will be used instead.

Do not throw away a valid AI analysis result merely because image processing failed.

---

## Performance

The feature is expected to run on a self-hosted homelab deployment and may be CPU-only.

Requirements:

- process one image at a time;
- avoid loading duplicate model instances unnecessarily;
- reuse the loaded model/process when practical;
- enforce input-size limits;
- resize excessively large source images before segmentation if appropriate;
- preserve enough resolution for a clean final result.

A long-lived helper process is preferable to spawning a new heavyweight model process for every request if the selected technology benefits from reuse.

---

## Docker / deployment

The existing deployment process must continue to work.

If a new runtime dependency is required:

- add it to Docker configuration;
- document it;
- ensure a normal build includes everything required;
- do not require manual package installation after deployment.

The feature must continue to work in the self-hosted/offline-local scenario once dependencies/models are already installed.

If model weights are downloaded during image build or first start, choose and document one behavior explicitly.

Prefer deterministic deployment.

---

## AI cost isolation

Background removal must not make any AI provider request.

The following should remain true:

```text
Remove background OFF
OpenAI usage = item analysis only

Remove background ON
OpenAI usage = exactly the same item analysis
Local compute = background removal
```

Enabling background removal must not increase OpenAI token usage.

---

## API design

The background-removal processing may be:

### Integrated into AI analysis endpoint

or

### Exposed internally through a separate endpoint

Example:

```http
POST /api/images/remove-background
```

Prefer whichever approach keeps responsibilities clearer.

If a public/backend endpoint is added:

- validate input type;
- limit image size;
- handle malformed images;
- return the processed file or a temporary reference;
- clean temporary files reliably.

---

## Temporary files

If temporary disk files are required:

- generate collision-safe names;
- keep them outside permanent item storage;
- delete them after the request/session is complete;
- clean stale temporary files after failures.

Prefer in-memory processing where practical, but not at the cost of excessive memory usage.

---

## Security

- Treat uploaded images as untrusted files.
- Validate MIME type and actual image decoding.
- Enforce file-size limits.
- Do not execute uploaded content.
- Do not pass arbitrary user-controlled file paths to helper processes.
- Do not expose local helper services outside the application network unless required.

---

## UI preview

When background removal succeeds, the AI Add Item flow should show the processed result before final save, either:

- directly in the existing Add Item form;
- or in the AI preview step if one exists.

The user must still be able to replace/change the photo manually before saving.

Optional but useful:

`Use original photo`

This is not mandatory if replacing the image through the normal Add Item form already provides equivalent functionality.

---

## Suggested implementation flow

```text
User uploads image
        ↓
Keep original
        ↓
     ┌───────────────┐
     │               │
     ↓               ↓
AI analysis      Remove background
(original)          locally
     │               │
     ↓               ↓
Item draft       White-background image
     │               │
     └───────┬───────┘
             ↓
      Existing Add Item form
             ↓
         User reviews
             ↓
            Save
```

---

## Acceptance criteria

This task is complete when:

- [ ] The main AI Add Item feature is already functional.
- [ ] AI Add Item has a `Remove background` option.
- [ ] The option is disabled by default.
- [ ] Background removal runs locally.
- [ ] Background removal does not call OpenAI or another paid AI API.
- [ ] OpenAI token usage is unchanged whether the option is enabled or disabled.
- [ ] AI item analysis uses the original image.
- [ ] The item is successfully isolated from typical simple backgrounds.
- [ ] The final generated photo has a white background.
- [ ] The item is not visibly distorted by processing.
- [ ] The processed image is passed into the existing Add Item form.
- [ ] The user can still replace/edit the selected photo before Save.
- [ ] Failure falls back to the original photo.
- [ ] Background-removal failure does not discard successful AI field analysis.
- [ ] Uploaded files are validated.
- [ ] Temporary files are cleaned up.
- [ ] Docker/deployment includes all required dependencies.
- [ ] Existing manual Add Item functionality is unaffected.
- [ ] Existing AI Add Item works normally when background removal is disabled.

---

## Result

After both phases are implemented, Inventory Atlas Lite should support this workflow:

```text
AI Add Item
   ↓
Take/upload photo
   ↓
Optional user hint
   ↓
Optional local background removal
   ↓
AI recognizes item
   ↓
Existing fields are populated
   ↓
Normal Add Item form opens
   ↓
User verifies everything
   ↓
Save
```

The result should feel like an assisted data-entry feature, not an autonomous agent.
