# AI Add Item

AI Add Item prepares an editable inventory draft from one photo and an optional text hint. It never
creates an item by itself. A successful analysis opens the existing Add Item form, where every
suggestion and the original photo can be changed or removed before the normal Save item action
writes anything to SQLite.

## User workflow

1. Configure OpenAI under **Settings → AI**: enable AI, enter the provider API key, and choose a
   model that accepts image input and structured output.
2. Open **Items** and select **AI Add Item** next to the manual **Add item** action.
3. Choose one JPEG, PNG, WebP, or GIF image of at most 15 MB and optionally add a hint.
4. Select **Analyze**. The selected image and hint remain in place if the request fails.
5. Review the suggested category, base values, category fields, warnings, and original photo in the
   normal Add Item form. Edit any value and select **Save item** only when the draft is correct.

The browser creates a JPEG analysis copy with a maximum dimension of 1,280 pixels when it can decode
the source image. The server asks OpenAI to process it at low image detail. The untouched selected
file remains in browser memory and is uploaded as the inventory photo after confirmation.

## Implementation and validation

`POST /api/ai/items/analyze` accepts one multipart image and an optional hint. The server validates
the declared MIME type and file signature, then supplies the provider with only the allowed base
field names, existing categories, and their current custom-field definitions. Existing items are
never included.

The OpenAI provider uses the Responses API in one stateless request with strict JSON Schema output.
Its instruction requires null values for uncertain facts and forbids invented specifications,
purchase data, and locations. The server validates the response again: a suggested category must
exist, dynamic field IDs must belong to it, and values must match text, number, date, or boolean
field types. Unknown dynamic fields and invalid values are discarded. No automatic detailed retry
is made even when the response reports that more detail could help.

The in-memory client draft contains the normalized values and original `File`. Navigating directly
to Add Item does not use a draft, so the manual workflow is unchanged. Reloading the review page
clears the temporary draft by design.

## Credentials and data sharing

The API key is written to `ai-settings.json` under `DATA_DIR` with owner-only file permissions where
the operating system supports them. It is outside SQLite, excluded from Git, and absent from
downloaded database backups. Settings responses contain only whether a key exists and its last four
characters. The key, request image, and image payload are not logged.

When AI is enabled and the user selects Analyze, the server sends the analysis image copy, optional
hint, model instruction, and inventory category/field schema to OpenAI. Normal inventory browsing,
manual item creation, and backups do not contact OpenAI.

## Verification

The API acceptance test uses a local mock provider to verify credential masking, request scope,
low-detail strict structured output, schema normalization, invalid images, and disabled or missing
configuration. Playwright covers Settings, the full photo-to-review-to-save browser workflow, the
absence of a database record before confirmation, original-photo persistence, editable suggestions,
and retention of inputs after a recoverable provider error.

## Limitations

- OpenAI is the only provider implemented.
- The deployment needs Internet access to OpenAI only when analysis is requested.
- The application still has no authentication; protect the whole installation with a trusted LAN or
  VPN, including Settings.
- Background removal and automatic high-detail retries are outside this phase.
- The draft is temporary browser memory and does not survive a reload of the review page.
