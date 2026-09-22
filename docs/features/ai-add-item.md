# AI Add Item

AI Add Item prepares an editable inventory draft from one photo, a written description, or both. At
least one of the two is required. It never creates an item by itself. A successful request opens the
existing Add Item form, where every suggestion and the proposed final photo can be changed or removed
before the normal Save item action writes anything to SQLite.

## User workflow

1. Configure OpenAI under **Settings → AI**: enable AI, enter the provider API key, save it, and
   choose one of the available curated models. Choose **Custom model...** to retain or test another
   model ID, and use **Refresh models** when account access changes.
2. Open **Items** and select **AI Add Item** next to the manual **Add item** action.
3. Supply at least one input: **Item photo (optional)** takes one JPEG, PNG, WebP, or GIF image of
   at most 15 MB, and **Item description (optional)** takes up to 2,000 characters describing the
   item and anything already known about it. **Remove background** is shown only while a photo is
   selected and is off by default.
4. Select **Create Draft**. It stays disabled until a photo or a description is present. The selected
   image, the description, and the background-removal choice all remain in place if the request
   fails.
5. Review the suggested category, base values, category fields, warnings, and, with a photo, the
   proposed final photo in the normal Add Item form. A description-only draft opens with no photo and
   one can be added there. Edit any value and select **Save item** only when the draft is correct.

With a photo, the browser sends the selected file without resizing or JPEG recompression, and the
server asks OpenAI to process it at original image detail so small branding and model labels remain
readable.
The same untouched selected file remains in browser memory. With background removal off it becomes
the proposed inventory photo. With the option on, a separate local request produces the proposed
photo while the original continues to be the only image sent for AI analysis. A description-only
request never contacts the background-removal endpoint and hands no file to the Add Item form.

## Implementation and validation

`POST /api/ai/items/analyze` accepts one optional multipart image and an optional `description`
field; the earlier field name `hint` is still accepted for the same text. A request with neither is
rejected with *Add a photo or describe the item before creating a draft.* Image MIME type and file
signature are validated only when a file was uploaded, and the description is limited to 2,000
characters. The server then supplies the provider with only the allowed base field names, existing
categories, and their current custom-field definitions. Existing items are never included.

The OpenAI provider uses the Responses API in one stateless request with strict JSON Schema output.
The same request body is used in all three modes; the `input_image` part is added only when a file
was uploaded, so a description-only request contains text alone. The model first records important
visible branding and labels in an internal `observedMarkings` array, then maps them to the most
specific reliable commercial product name, model or part fields, and serial number. Visible printed
text and facts stated in the description both count as direct evidence, while unknown values remain
null and hidden specifications, serial numbers, purchase data, locations, and exact part numbers must
not be guessed. When the description and the image disagree, the instructions require a warning that
names the conflict rather than a silent choice, leaving the resolution to the human review. Without
an image `observedMarkings` stays empty and the server forces `needsDetailedImageAnalysis` to false. The server validates the response again: a suggested
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
decodes one in-memory image, and runs the IS-Net segmentation model through `onnxruntime-node` on the
local CPU. IS-Net is the `isnet-general-use` checkpoint from Highly Accurate Dichotomous Image
Segmentation; it replaced the lightweight U2NetP model in 0.24.0 because U2NetP kept clutter such as
hands, bubble wrap, and table edges in the foreground and left translucent fringes around the item.
Processing is limited to one image at a time. One lazily loaded model session is reused while
photos keep arriving and released after five idle minutes, which gave back about 470 MB when
measured, so one cutout no longer leaves that memory taken from the rest of the container, including
an update build that runs beside the application. Large
decoded images are bounded and resized to at most 2048 pixels per side, and no temporary files are
created. The model reads a 768x768 input instead of the earlier 320x320, so a typical photo takes
roughly two to four seconds and about 650 MB of resident memory on a homelab CPU. IS-Net is trained
at 1024x1024 and the pinned export accepts either size; 768 was measured to keep the mask within a
tenth of a per cent of the 1024 result while roughly halving both time and memory, which keeps the
feature inside the 1 GiB containers this application is deployed into.

Sessions are always created with the `cpu` execution provider, so the Docker build and the Proxmox
installer both install the dependencies with `ONNXRUNTIME_NODE_INSTALL=skip`, and the repository
`.npmrc` repeats it for an already installed, older updater that runs `npm ci` from its own copy of
`lib.sh`. Without it, `onnxruntime-node` downloads the CUDA and TensorRT providers from NuGet on
`linux/x64` and unpacks over a gigabyte of unused libraries, which the OOM killer stops in a default
1 GiB container.

The raw mask is never composited directly. It is first reduced to a clean silhouette on the model
grid:

1. **Hysteresis thresholding.** Pixels at or above 0.6 form confident cores, which then grow over
   neighbouring pixels at or above 0.2. Soft background haze never touches a core and is dropped
   whole, instead of surviving as the semi-transparent grey that dirtied earlier results.
2. **Region filtering.** Detached regions smaller than five per cent of the largest region are
   removed, so wrap fragments and specks do not reach the canvas.
3. **Hole filling.** Enclosed gaps of up to two per cent of the subject area are filled, which closes
   the pinholes the model leaves over dark, low-contrast areas such as a black PCB.
4. **Feathering.** The silhouette is scaled to the photo and blurred by a fraction of a pixel, then
   mapped through a 0.45-0.8 smoothstep. The window is deliberately off-centre, so the edge is pulled
   slightly inward, away from the pixels whose colour is still mixed with the old background.

The subject's visible bounds are then detected, and the undistorted subject is centered with seven
per cent padding on a white canvas that retains the source aspect ratio. A soft shadow is generated
from the placed silhouette - blurred by two per cent of the subject height, offset downward by 2.5
per cent, and composited beneath the subject at 22 per cent opacity in a dark neutral tint. It is
drawn deliberately rather than inherited from mask noise, so it cannot reintroduce the artefacts it
replaces. The endpoint returns a quality-90 JPEG. If any processing step fails, the browser keeps the
completed AI draft, displays a warning, and passes the original photo to the Add Item form.

The 168 MB ONNX model is downloaded during `npm install` and accepted only when its pinned SHA-256
matches; the same step deletes a superseded model file left by an earlier release. It is an export
with dynamic spatial axes, pinned to one repository revision, because the rembg release mirror used
in 0.24.0 bakes 1024x1024 into every declared shape and cannot run at any other size. The two
exports were compared on the regression photo at 1024 and their masks differ by at most 3e-6, so the
checkpoint is the same; `server/models/README.md` records the reasoning and both sources. Docker
includes that verified build artifact, so inference does not download anything at runtime. IS-Net and
its upstream DIS project use Apache-2.0; the license and attribution are included under `LICENSES/`.
`onnxruntime-node` is MIT and `sharp` is Apache-2.0.

## Credentials and data sharing

The API key is written to `ai-settings.json` under `DATA_DIR` with owner-only file permissions where
the operating system supports them. It is outside SQLite, excluded from Git, and absent from
downloaded database backups. Settings responses contain only whether a key exists and its last four
characters. The key, request image, and image payload are not logged.

When AI is enabled and the user selects Create Draft, the server sends the selected image when there
is one, the description, the model instruction, and the inventory category/field schema to OpenAI. Normal inventory browsing,
manual item creation, background removal, and backups do not contact OpenAI. Enabling background
removal does not change the OpenAI request or token usage.

## Verification

The API acceptance test uses a local mock provider to verify credential masking, request scope,
original-detail strict structured output, visible-marking extraction, the Sound Blaster Audigy LS
regression case, schema normalization, invalid images, and disabled or missing configuration. It also
covers all three input modes: an image alone, a description alone whose request carries no
`input_image` and whose draft reports no detailed image analysis, both together with a conflict
surfaced through `warnings`, and the rejection of an empty, blank, or over-long submission.
Playwright covers Settings, both original and processed photo-to-review-to-save workflows, the
description-only workflow through to a saved item with no photo, the disabled Create Draft button
with no input, the background-removal controls appearing only with a photo, the absence of a database
record before confirmation, editable suggestions, local-processing fallback, and retention of inputs
after a recoverable provider error. Service tests cover background removal at two levels: stubbed
model output verifies white-canvas composition, framing, JPEG output, speck and haze removal, hole
filling, shadow presence, an absent subject, and invalid-image rejection; and a full run of the real
model over `test/fixtures/sound-blaster-audigy-ls-on-bubble-wrap.jpg` checks background cleanliness,
the absence of tinted leftovers along the padded border, subject coverage, and the shadow. That last
test is skipped when the model has not been downloaded.

## Limitations

- OpenAI is the only provider implemented.
- The deployment needs Internet access to OpenAI only when analysis is requested.
- The application still has no authentication; protect the whole installation with a trusted LAN or
  VPN, including Settings.
- IS-Net is a general foreground model with no idea which object was meant. It keeps whatever is
  salient, so a hand holding the item, or clutter of similar prominence, stays in the cutout.
  Transparent objects and low-contrast edges can still produce an imperfect result, and the original
  photo is retained on failure.
- The draft is temporary browser memory and does not survive a reload of the review page.
