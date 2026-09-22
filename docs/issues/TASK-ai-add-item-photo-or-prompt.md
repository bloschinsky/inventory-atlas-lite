# Task: Extend AI Add Item to support photo, prompt, or both

## Goal

Extend the existing **AI Add Item** workflow so a user can create an AI-generated item draft from:

1. a photo only;
2. a text description only;
3. both a photo and a text description.

Do not create a separate page, route, or second AI item workflow.

The existing AI Add Item page, draft format, review flow, and normal Add Item confirmation screen must be reused.

AI must continue to propose a draft only. It must never save an item automatically.

---

## Current behavior

The current AI Add Item flow requires an image.

Frontend:

- `client/src/pages/AIAddItem.vue`
- image is required;
- description is currently treated as an optional hint;
- **Analyze** is disabled without a selected image;
- successful analysis calls `setPendingAiDraft(...)` and opens the normal Add Item form.

Backend:

- `POST /api/ai/items/analyze`
- currently accepts one multipart image and optional text hint;
- `AiItemAnalysisService.analyze()` rejects requests without an uploaded image;
- the OpenAI request always contains both `input_text` and `input_image`.

Preserve the existing draft normalization, category/custom-field validation, structured output, server-side AI settings checks, and review-before-save behavior.

---

## UX

Keep the existing **AI Add Item** page.

Change the page explanation to make the supported inputs obvious.

Suggested copy:

> Add a photo, describe the item, or use both. AI will prepare an editable draft for review.

### Inputs

#### Item photo

Change the image field from required to optional.

Label:

**Item photo (optional)**

Keep:

- supported image formats;
- size limits;
- image preview;
- original-image AI analysis behavior.

#### Item description

Rename the current **Additional description** concept so it is no longer presented merely as a hint.

Suggested label:

**Item description (optional)**

Suggested helper text:

> Describe the item and include any details you already know, such as brand, model, serial number, condition, purchase information, or location.

The description becomes a first-class input source.

Keep a reasonable length limit. The existing 2,000-character limit may be retained unless there is a clear repository convention requiring otherwise.

### Validation

The user must provide at least one input:

```text
photo OR description
```

Valid:

```text
photo only
description only
photo + description
```

Invalid:

```text
no photo + empty description
```

Disable the primary submit button when both inputs are empty.

Also validate this on the backend.

---

## Primary action

Rename:

**Analyze**

to:

**Create Draft**

Loading state:

**Creating Draft…**

The wording should reflect that AI prepares data for review rather than directly creating an inventory record.

---

## Background removal

Background removal only applies when a photo exists.

When no image is selected:

- hide the **Remove background** checkbox and its helper text.

When an image is selected:

- show the existing background-removal option;
- preserve the current local-processing behavior;
- preserve fallback to the original photo if background removal fails.

Prompt-only requests must not call the background-removal endpoint.

---

## Frontend behavior

Update `AIAddItem.vue` so `analyze()` / equivalent submission logic supports all three modes.

### Photo only

Behavior remains equivalent to the existing implementation.

Send:

- image;
- no description if empty.

The resulting draft includes the selected photo as before.

### Photo + description

Send both sources to the backend.

The original image remains the image used for AI analysis.

If background removal is enabled, only the proposed final inventory photo is processed locally, exactly as in the current implementation.

### Description only

Send the description without requiring an image.

On success:

- call the existing `setPendingAiDraft(...)`;
- pass no proposed photo;
- navigate to `/items/new`;
- normal Add Item review/edit/save behavior remains unchanged.

Do not introduce a second draft format for prompt-only mode.

---

## API

Keep the existing endpoint:

```text
POST /api/ai/items/analyze
```

Do not add a second `/prompt` endpoint.

The endpoint should accept:

```text
image: optional
description: optional
```

The request is valid when at least one is present.

The existing multipart request format may be retained so the same endpoint supports image and text inputs.

If the implementation keeps the old internal field name `hint` for compatibility, normalize it at the API boundary and use clearer `description` naming in new code where practical.

Do not break existing clients/tests unnecessarily.

---

## Backend validation

Update `AiItemAnalysisService.analyze()`.

Current behavior similar to:

```js
if (!upload) throw httpError('Choose an image to analyze.');
```

must be replaced with validation equivalent to:

```text
normalize description

if no image AND description is empty:
    reject

if image exists:
    validate image MIME/signature exactly as today

if description exists:
    validate length
```

Requirements:

- do not run image MIME validation when no image was supplied;
- keep all existing AI configuration checks;
- keep the requirement that at least one inventory category exists;
- keep server-side response normalization and rejection of unsupported fields.

Use a clear validation error such as:

> Add a photo or describe the item before creating a draft.

---

## OpenAI request construction

Update the request construction so `input_image` is optional.

Conceptually:

```js
content = [
  {
    type: 'input_text',
    text: ...
  }
];

if (image) {
  content.push({
    type: 'input_image',
    ...
  });
}
```

The text payload must still include:

- user description;
- available base fields;
- existing categories;
- custom fields for those categories.

Existing inventory items must still never be sent to OpenAI.

Keep:

- Responses API;
- stateless request;
- `store: false`;
- strict JSON Schema output;
- existing structured response normalization.

---

## Prompt / instruction changes

The current instructions are image-centric and must be generalized.

AI may receive:

- description only;
- image only;
- both.

The instructions should enforce the following rules.

### Evidence

Treat as supported factual input:

- facts explicitly provided by the user in the description;
- clearly visible branding, labels, model numbers, part numbers, and serial numbers in the image.

Do not invent unsupported details.

Unknown values should remain null.

### Source priority and conflicts

When image and description agree:

- use the combined evidence.

When they provide complementary information:

- merge supported facts.

When they conflict:

- do not silently pick one without signaling the conflict;
- use the most strongly supported value where appropriate;
- add a clear warning to the draft explaining the conflict so the user can resolve it during review.

Example:

```text
Description: Sound Blaster Audigy 2
Visible marking: Sound Blaster Audigy LS / SB0310
```

Possible warning:

> The supplied description says Audigy 2, while the visible product marking appears to identify the item as Audigy LS.

Do not overcomplicate conflict resolution. The existing human-review step remains the final authority.

### Inventory-specific conservatism

Do not infer unsupported:

- serial numbers;
- purchase price;
- purchase date;
- location;
- exact model/part number;
- technical specifications.

Explicit user-provided values may be used.

Visible image markings may be used.

Speculation must not be converted into stored-looking facts.

---

## Structured output

Reuse the current draft schema and normalization path.

Do not create separate response schemas for image and prompt modes unless strictly necessary.

Keep existing:

- `categoryId`;
- `confidence`;
- `baseFields`;
- `dynamicFields`;
- `warnings`;
- internal image-analysis metadata where still useful.

Review whether image-specific internal fields such as:

```text
observedMarkings
needsDetailedImageAnalysis
```

still make sense for description-only mode.

Preferred behavior:

- keep the schema compatible if possible;
- allow `observedMarkings` to be an empty array when no image exists;
- `needsDetailedImageAnalysis` must be `false` when no image was supplied.

Do not expose internal analysis-only fields to the Add Item form.

---

## Draft and photo handling

The existing draft handoff must continue to work.

### With photo

Pass the final proposed photo exactly as today:

- original image when background removal is off;
- processed image when background removal succeeds;
- original image + warning when removal fails.

### Without photo

Pass no `File`.

The normal Add Item form must:

- load all AI-proposed fields;
- show no photo;
- allow the user to add a photo manually before saving if desired.

No item is written to SQLite until the user presses the existing normal **Save item** action.

---

## Error handling

Preserve user input after recoverable failures.

If the OpenAI request fails:

- selected photo remains selected;
- description remains intact;
- background-removal selection remains intact;
- user can retry.

Prompt-only errors must not mention choosing another image.

Use source-neutral error wording where the failure can happen in any mode.

For example, replace image-specific messages such as:

> AI analysis found no usable item details. Try another image or add a hint.

with wording such as:

> AI found no usable item details. Add more information or try a different photo.

Similarly review provider failure messages and UI copy for unnecessary image-only wording.

---

## Tests

Add/update automated tests covering at minimum:

### Frontend / Playwright

1. AI Add Item can submit with photo only.
2. AI Add Item can submit with description only.
3. AI Add Item can submit with photo + description.
4. Submit is disabled when both are empty.
5. Image field is no longer required.
6. Background-removal controls are hidden without a photo.
7. Background-removal controls appear when a photo is selected.
8. Prompt-only success opens the normal Add Item review form.
9. Prompt-only draft contains no proposed photo.
10. Prompt-only draft values remain editable before saving.
11. No database record exists before normal Save item.
12. Failed prompt-only requests retain the description.
13. Existing photo + background-removal flow remains working.

### Backend

14. `/api/ai/items/analyze` accepts a valid image without description.
15. It accepts a valid description without image.
16. It accepts both.
17. It rejects a request containing neither.
18. It still rejects invalid uploaded images.
19. It still rejects disabled AI configuration.
20. It still rejects missing API credentials.
21. Description-only OpenAI requests contain no `input_image`.
22. Photo requests still send the original image with existing detail settings.
23. Existing category/custom-field schema is still supplied.
24. Existing items are still never supplied.
25. Unsupported AI response fields remain rejected/ignored according to current normalization rules.
26. A description/image conflict can be represented through `warnings`.
27. `observedMarkings` may be empty and detailed-image analysis must be false in prompt-only mode.

---

## Documentation

Update:

- `docs/features/ai-add-item.md`;
- `docs/HOW-TO.md`;
- feature index if wording needs adjustment;
- relevant change documentation following `AGENTS.md`.

Document clearly that AI Add Item supports:

```text
photo
description
photo + description
```

Also document that the generated result is always an editable draft and is never saved automatically.

---

## Out of scope

Do not implement:

- a separate “AI Add Item from Prompt” page;
- a separate navigation button;
- a “Without photo” checkbox;
- automatic item saving;
- image generation;
- web search / external product lookup;
- matching against existing inventory items;
- additional AI providers;
- changes to the normal Add Item save flow;
- category creation by AI.

The feature must remain a small extension of the existing AI Add Item workflow rather than a parallel system.
