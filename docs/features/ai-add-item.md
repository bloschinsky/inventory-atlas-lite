# AI Add Item

AI Add Item prepares an editable inventory draft from one photo and an optional text hint. It never
creates an item by itself. A successful analysis opens the existing Add Item form, where every
suggestion and the proposed final photo can be changed or removed before the normal Save item action
writes anything to SQLite.

## User workflow

1. Configure OpenAI under **Settings → AI**: enable AI, enter the provider API key, save it, and
   choose one of the available curated models. Choose **Custom model...** to retain or test another
   model ID, and use **Refresh models** when account access changes.
2. Open **Items** and select **AI Add Item** next to the manual **Add item** action.
3. Choose one JPEG, PNG, WebP, or GIF image of at most 15 MB, optionally add a hint, and optionally
   enable **Remove background**. Background removal is off by default.
4. Select **Analyze**. The selected image and hint remain in place if the request fails.
5. Review the suggested category, base values, category fields, warnings, and proposed final photo
   in the normal Add Item form. The photo can still be replaced. Edit any value and select **Save
   item** only when the draft is correct.

The browser sends the selected file without resizing or JPEG recompression, and the server asks
OpenAI to process it at original image detail so small branding and model labels remain readable.
The same untouched selected file remains in browser memory. With background removal off it becomes
the proposed inventory photo. With the option on, a separate local request produces the proposed
photo while the original continues to be the only image sent for AI analysis.

## Implementation and validation

`POST /api/ai/items/analyze` accepts one multipart image and an optional hint. The server validates
the declared MIME type and file signature, then supplies the provider with only the allowed base
field names, existing categories, and their current custom-field definitions. Existing items are
never included.

The OpenAI provider uses the Responses API in one stateless request with strict JSON Schema output.
The model first records important visible branding and labels in an internal `observedMarkings`
array, then maps them to the most specific reliable commercial product name, model or part fields,
and serial number. Visible printed text counts as direct evidence, while unknown values remain null
and hidden specifications must not be guessed. The server validates the response again: a suggested
category must exist, dynamic field IDs must belong to it, and values must match text, number, date,
or boolean field types. Unknown dynamic fields and invalid values are discarded. The internal
markings are not sent to the item form, and no second AI request is made.

`GET /api/ai/models` keeps OpenAI communication on the server. It lists models for the saved API
key, then returns only the curated image-analysis choices: GPT-5.6 Luna, GPT-5.6 Terra, and GPT-5.6
Sol when they are available. The Settings page loads the list once when opened, refreshes it after a
new key is saved or when requested, and falls back to the saved custom ID with a warning if listing
fails. Raw provider errors and the API key never reach the browser.

The in-memory client draft contains the normalized values and proposed photo `File`. Navigating directly
to Add Item does not use a draft, so the manual workflow is unchanged. Reloading the review page
clears the temporary draft by design.

## Local background removal

`POST /api/images/remove-background` validates the declared MIME type and file signature, safely
decodes one in-memory image, and runs the lightweight U2NetP segmentation model through
`onnxruntime-node` on the local CPU. Processing is limited to one image at a time. One lazily loaded
model session is reused, large decoded images are bounded and resized to at most 2048 pixels per
side, and no temporary files are created.

The subject mask is resized to the source dimensions, its visible bounds are detected, and the
undistorted subject is centered with padding on a white canvas that retains the source aspect ratio.
The endpoint returns a quality-90 JPEG. If any processing step fails, the browser keeps the completed
AI draft, displays a warning, and passes the original photo to the Add Item form.

The 4.6 MB ONNX model is downloaded during `npm install` from the rembg release mirror and accepted
only when its pinned SHA-256 matches. Docker includes that verified build artifact, so inference does
not download anything at runtime. U2NetP and its upstream U²-Net project use Apache-2.0; the license
and attribution are included under `LICENSES/`. `onnxruntime-node` is MIT and `sharp` is Apache-2.0.

## Credentials and data sharing

The API key is written to `ai-settings.json` under `DATA_DIR` with owner-only file permissions where
the operating system supports them. It is outside SQLite, excluded from Git, and absent from
downloaded database backups. Settings responses contain only whether a key exists and its last four
characters. The key, request image, and image payload are not logged.

When AI is enabled and the user selects Analyze, the server sends the selected image, optional
hint, model instruction, and inventory category/field schema to OpenAI. Normal inventory browsing,
manual item creation, background removal, and backups do not contact OpenAI. Enabling background
removal does not change the OpenAI request or token usage.

## Verification

The API acceptance test uses a local mock provider to verify credential masking, request scope,
original-detail strict structured output, visible-marking extraction, the Sound Blaster Audigy LS
regression case, schema normalization, invalid images, and disabled or missing configuration.
Playwright covers Settings, both original and processed photo-to-review-to-save workflows, the
absence of a database record before confirmation, editable suggestions, local-processing fallback,
and retention of inputs after a recoverable provider error. A deterministic service test verifies
white-canvas composition, framing, JPEG output, and invalid-image rejection.

## Limitations

- OpenAI is the only provider implemented.
- The deployment needs Internet access to OpenAI only when analysis is requested.
- The application still has no authentication; protect the whole installation with a trusted LAN or
  VPN, including Settings.
- U2NetP is a compact salient-object model; complex scenes, transparent objects, fine gaps, and
  low-contrast edges can produce an imperfect cutout. The original photo is retained on failure.
- The draft is temporary browser memory and does not survive a reload of the review page.
