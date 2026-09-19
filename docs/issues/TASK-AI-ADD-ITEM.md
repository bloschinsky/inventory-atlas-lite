# Task: AI Add Item

## Summary

Implement a new **AI Add Item** flow in Inventory Atlas Lite.

The goal is to let the user create a new inventory item from a photo with minimal manual data entry.

The user provides:
- one item photo;
- an optional free-text hint/description.

The application sends the image and relevant inventory schema to an AI provider, receives structured item data, and opens the existing **Add Item** form prefilled with the suggested values.

The AI must never save an item directly. The user must review and confirm all generated values before the item is persisted.

This task is **Phase 1** of the AI-assisted item creation feature.

Background removal is explicitly out of scope for this task and will be implemented separately after this task is complete.

---

## Goals

- Add a new **AI Add Item** entry point next to the existing Add Item flow.
- Allow the user to upload a photo and optionally provide additional context.
- Analyze the image using the configured AI provider.
- Automatically determine the most appropriate existing category when possible.
- Populate all compatible base fields and category-specific dynamic fields.
- Reuse the existing Add Item form for review and final submission.
- Keep AI usage cheap and predictable.
- Prevent hallucinated values from being silently stored.
- Keep API credentials server-side only.

---

## Non-goals

This task must NOT:

- automatically save AI-generated items;
- create new categories;
- create new dynamic fields;
- modify the existing category schema based on AI output;
- perform web searches to identify products;
- perform reverse image search;
- remove or replace image backgrounds;
- use Codex as the runtime AI provider;
- expose the OpenAI API key to the browser;
- implement autonomous agents.

---

## UX

### Entry point

Add a new button near the existing **Add Item** action:

`AI Add Item`

Suggested icon:

`✨` or another suitable Tabler icon.

The existing **Add Item** flow must remain unchanged.

---

## AI Add Item dialog/page

The initial AI flow should contain:

### Required

- Image upload

### Optional

- Additional description / hint

Example:

> Old NVIDIA graphics card. I think it is a RIVA TNT2.

This text is additional context only and must not override clearly visible information.

### Action

`Analyze`

During analysis:

- disable duplicate submission;
- display a loading state;
- provide a clear error state if analysis fails.

---

## AI configuration

Add a new AI section in Settings.

Minimum configuration:

- AI features enabled/disabled
- Provider
- API key
- Model

Initial provider:

`OpenAI`

The architecture should allow another provider to be introduced later without rewriting the Add Item flow.

Suggested internal abstraction:

```text
AIProvider
  └── analyzeInventoryItem(...)
```

Do not over-engineer the abstraction. Only the OpenAI implementation is required now.

---

## API key handling

The API key must:

- be stored server-side;
- never be sent to the Vue frontend after saving;
- never appear in API responses;
- never be written to application logs;
- never be committed to the repository.

The UI may show only a masked state, for example:

`sk-••••••••abcd`

If an appropriate secret-storage mechanism already exists in the project, reuse it.

Otherwise use the simplest secure server-side storage consistent with the current architecture.

---

## Backend endpoint

Add an endpoint similar to:

```http
POST /api/ai/items/analyze
```

Input:

```text
multipart/form-data
```

Fields:

- `image` — required
- `hint` — optional

The endpoint must:

1. validate AI configuration;
2. validate the uploaded image;
3. load current inventory categories;
4. load relevant base field definitions;
5. load category-specific dynamic field definitions;
6. construct a compact AI request;
7. send the image and schema to the configured AI provider;
8. validate the returned structured response;
9. return a normalized draft item to the frontend.

---

## AI input

The model should receive only the information required to build an inventory item.

Input should include:

- uploaded image;
- optional user hint;
- existing categories;
- allowed base fields;
- category-specific dynamic fields;
- allowed select/options where applicable.

Avoid sending unrelated application data.

Do not send existing inventory items unless a future task explicitly requires that behavior.

---

## AI behavior rules

The AI must be instructed to:

1. identify only what can reasonably be derived from:
   - the image;
   - visible labels;
   - the optional user hint;
2. never invent unsupported values;
3. return `null` when a value cannot be determined;
4. choose only from existing categories;
5. fill only fields that currently exist in the database/schema;
6. respect predefined select/enum values;
7. avoid guessing technical specifications that are not visible;
8. avoid assigning an exact model when evidence is insufficient;
9. distinguish visible facts from uncertain inference.

Examples of values that must NOT be invented:

- RAM capacity not visible on the item;
- storage capacity not visible on the label;
- purchase date;
- purchase price;
- serial number unless visible;
- exact revision/part number unless visible;
- condition details that cannot be seen in the photo.

---

## Structured output

Use strict structured output / JSON schema where supported.

The AI must not return arbitrary prose that then needs to be parsed manually.

Suggested normalized response:

```json
{
  "categoryId": "string-or-number-or-null",
  "confidence": 0.92,
  "needsDetailedImageAnalysis": false,
  "baseFields": {
    "name": "NVIDIA RIVA TNT2 graphics card",
    "condition": "Used",
    "description": "PCI/AGP graphics card with visible NVIDIA RIVA TNT2 branding",
    "purchaseDate": null,
    "purchasePrice": null,
    "serialNumber": null
  },
  "dynamicFields": {
    "brand": "NVIDIA",
    "model": "RIVA TNT2",
    "partNumber": null
  },
  "warnings": []
}
```

The exact field names should follow the real project schema rather than introducing duplicate concepts.

---

## Category selection

The AI may suggest a category only from the list of categories already defined in Inventory Atlas Lite.

If confidence is insufficient:

```json
"categoryId": null
```

The user will select the category manually in the Add Item form.

If a category is selected by AI:

- load that category's dynamic fields;
- map only valid returned values into those fields.

Unknown returned fields must be discarded.

---

## Dynamic fields

This feature must work with the project's dynamic category field system.

Do not hardcode fields such as:

- brand;
- model;
- type;
- part number.

Instead:

1. read field definitions from the current schema;
2. send the appropriate definitions to the AI;
3. validate returned values against those definitions;
4. populate the existing Add Item form.

This is a core requirement.

---

## Reuse existing Add Item form

After successful AI analysis:

1. close/leave the AI analysis step;
2. open the normal Add Item form;
3. prefill:
   - uploaded image;
   - suggested category;
   - base fields;
   - dynamic fields;
4. allow the user to freely edit everything;
5. save using the normal existing item creation flow.

Do not create a second separate implementation of the item editor.

The normal Add Item form remains the source of truth.

---

## Confidence and uncertainty

The AI response may contain a confidence value.

This is informational only.

The application must not hide or reject low-confidence results automatically.

If useful, fields with no AI value should simply remain empty.

Do not visually imply that AI-generated values are guaranteed to be correct.

---

## Image handling

For Phase 1:

- keep the original uploaded image;
- use the same image in the final Add Item form;
- do not modify the image;
- do not remove the background.

A future task will add background removal.

The AI analysis image may be resized/compressed before sending to the provider to reduce cost.

The original stored photo should not be degraded merely to reduce AI usage.

---

## Token and cost optimization

The implementation should deliberately minimize AI usage.

Requirements:

- use one model call per normal analysis;
- send a compact system instruction;
- send only relevant schema;
- resize the AI analysis copy of the image;
- use low-detail image analysis by default where supported;
- keep output schema compact;
- do not request explanations or prose;
- do not include previous conversation history;
- do not use an agent loop.

If the provider supports different image detail modes, default to a low-cost mode.

A second high-detail analysis call may be supported only if clearly required by the first response, for example:

```json
"needsDetailedImageAnalysis": true
```

Do not automatically perform repeated calls without a concrete reason.

---

## Provider implementation

Initial implementation:

`OpenAI`

Use the current recommended OpenAI API for multimodal input and structured output.

The model name must come from Settings rather than being hardcoded throughout the codebase.

Provider-specific request construction should remain isolated from UI/business logic.

---

## Error handling

Handle at minimum:

- AI disabled;
- missing API key;
- invalid API key;
- provider unavailable;
- rate limit;
- unsupported image;
- image too large;
- invalid structured response;
- AI timeout;
- no usable result.

The user should receive a concise useful message.

The original photo and entered hint should not be lost after a recoverable error.

---

## Security

- AI requests must originate from the backend.
- Never expose provider credentials to the frontend.
- Sanitize/validate uploaded files.
- Enforce reasonable upload size limits.
- Do not log uploaded images or secrets unnecessarily.
- Do not trust AI-returned field IDs blindly.
- Validate category and dynamic-field IDs against the database.

---

## Logging

Useful server-side diagnostic logging may include:

- provider;
- selected model;
- request duration;
- success/failure;
- token usage/cost metadata if returned by the provider.

Do NOT log:

- API keys;
- complete image payloads;
- sensitive credentials.

---

## Suggested implementation flow

```text
AI Add Item
      ↓
Upload image + optional hint
      ↓
POST /api/ai/items/analyze
      ↓
Load categories + field definitions
      ↓
Create compact AI request
      ↓
OpenAI multimodal analysis
      ↓
Strict structured result
      ↓
Backend validation / normalization
      ↓
Existing Add Item form
      ↓
User reviews / edits
      ↓
Normal Save Item flow
```

---

## Acceptance criteria

This task is complete when:

- [ ] `AI Add Item` is available from the inventory UI.
- [ ] The user can upload one image.
- [ ] The user can provide an optional text hint.
- [ ] OpenAI configuration can be set in Settings.
- [ ] The API key remains server-side.
- [ ] The backend can analyze an item image.
- [ ] The request includes existing categories and relevant dynamic field definitions.
- [ ] AI output uses validated structured JSON.
- [ ] Unsupported/unknown AI fields are rejected.
- [ ] The AI can suggest an existing category.
- [ ] Base fields are prefilled where values are available.
- [ ] Category dynamic fields are prefilled where values are available.
- [ ] Unknown values remain empty/null.
- [ ] The AI is explicitly instructed not to invent information.
- [ ] Successful analysis opens the existing Add Item form.
- [ ] The uploaded photo is carried into that form.
- [ ] The user can edit every suggested value.
- [ ] Nothing is written to the inventory database before the user presses Save.
- [ ] The normal existing Add Item save path is reused.
- [ ] One low-cost AI request is sufficient for the normal path.
- [ ] Errors are handled without losing the user's uploaded image/hint.
- [ ] Existing manual Add Item behavior continues to work unchanged.

---

## Dependency / follow-up

Completion of this task unlocks:

**Task: AI Add Item — Local Background Removal**

The background-removal task must build on this flow rather than creating an independent item creation workflow.
