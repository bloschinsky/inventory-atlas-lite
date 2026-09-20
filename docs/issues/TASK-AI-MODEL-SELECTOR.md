# Task: OpenAI Model Selector in AI Settings

## Objective

Replace the current free-text OpenAI model field in **Inventory Atlas Lite** with a proper model selector that loads available models from the configured OpenAI account/API key.

The selector should show only a small curated set of relevant models for **AI Add Item**, not every model returned by OpenAI.

Also keep a **Custom model** option for manual testing of model IDs.

This is a focused Settings/UI improvement. Do not redesign the AI subsystem.

---

## Current behavior

AI Settings currently contain a free-text model field where the user manually enters a model ID.

Example:

```text
Model
gpt-5.6-luna
```

This works, but it is inconvenient for testing different models.

---

## Desired behavior

Replace the plain text field with a selector similar to:

```text
Model

[ GPT-5.6 Luna ▼ ]

Available options:
- GPT-5.6 Luna
- GPT-5.6 Terra
- GPT-5.6 Sol
- ...
- Custom model...
```

The exact options shown must depend on the models available to the currently configured OpenAI API key.

---

## 1. Load available models from OpenAI

Add backend logic that retrieves models available to the configured OpenAI API key.

Use the OpenAI models listing API.

Suggested internal endpoint:

```http
GET /api/ai/models
```

The frontend must NOT call OpenAI directly.

Flow:

```text
Settings UI
   ↓
GET /api/ai/models
   ↓
Atlas backend
   ↓
OpenAI Models API
   ↓
Filter / normalize
   ↓
Return supported models to frontend
```

---

## 2. Curated model list

Do NOT show every model returned by OpenAI.

The OpenAI account may expose unrelated models such as:

- embeddings;
- audio;
- realtime;
- image generation;
- moderation;
- legacy models;
- fine-tunes;
- other models not suitable for AI Add Item.

Instead, maintain a small curated allowlist of preferred models suitable for the current image-analysis workflow.

Initial preferred models should include:

```text
gpt-5.6-luna
gpt-5.6-terra
gpt-5.6-sol
```

The implementation should make this list easy to extend later.

Example internal structure:

```js
const preferredModels = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" }
];
```

Only show preferred models that are actually returned as available for the current API key.

Do not assume that every preferred model is available.

---

## 3. Selector behavior

Replace the current model text input with a select/dropdown.

Expected options:

```text
GPT-5.6 Luna
GPT-5.6 Terra
GPT-5.6 Sol
Custom model...
```

Only include available preferred models.

The currently saved model should remain selected.

---

## 4. Custom model option

The selector must include:

```text
Custom model...
```

When selected:

- show the existing text input;
- allow the user to enter any model ID manually;
- save that value exactly as entered;
- do not force it to exist in the curated list.

This is required for testing newly released models before the application is updated.

Example:

```text
Model
[ Custom model... ▼ ]

Custom model ID
[ gpt-example-new-model ]
```

---

## 5. Default model

Keep the current intended default model:

```text
gpt-5.6-luna
```

Rules:

- new/clean installs default to `gpt-5.6-luna`;
- existing saved model values must not be overwritten;
- if the saved model is not in the curated list, automatically display it through the `Custom model...` state;
- do not silently replace an existing custom model.

---

## 6. Refresh behavior

The model list should be loaded when opening the AI Settings section.

Optional but preferred:

Add a small refresh action:

```text
Refresh models
```

This should reload the list from OpenAI without changing the selected model.

Do not automatically call OpenAI repeatedly during normal app usage.

---

## 7. Error handling

If the OpenAI model list cannot be loaded:

- do not block the Settings page;
- preserve the currently configured model;
- allow `Custom model...`;
- show a concise warning.

Example:

```text
Could not load available OpenAI models.
You can continue using the configured model or enter a custom model ID.
```

Handle at minimum:

- missing API key;
- invalid API key;
- network error;
- OpenAI timeout;
- OpenAI API error.

---

## 8. API key changes

If the user changes the OpenAI API key:

- the cached model list must be considered stale;
- refresh/reload available models after the new key is saved successfully;
- do not retain availability assumptions from the previous key.

---

## 9. Caching

Avoid calling OpenAI on every render.

Simple caching is acceptable.

Recommended behavior:

- fetch when AI Settings are opened;
- cache for the current app session or for a short TTL;
- provide manual refresh;
- invalidate cache when the API key changes.

Do not persist a stale OpenAI model list indefinitely.

---

## 10. Backend response

Suggested normalized response:

```json
{
  "models": [
    { "id": "gpt-5.6-luna", "label": "GPT-5.6 Luna" },
    { "id": "gpt-5.6-terra", "label": "GPT-5.6 Terra" },
    { "id": "gpt-5.6-sol", "label": "GPT-5.6 Sol" }
  ]
}
```

The frontend should not need to understand raw OpenAI `/models` response details.

---

## 11. Security

- OpenAI API key stays server-side.
- Never expose the API key to the frontend.
- Frontend calls only Atlas backend.
- Do not log the API key.
- Do not return raw OpenAI error payloads if they may expose sensitive data.

---

## 12. Preserve existing AI behavior

This task must NOT change:

- AI Add Item analysis logic;
- image-detail configuration;
- reasoning configuration;
- prompt behavior;
- background removal;
- dynamic field handling;
- item creation workflow.

The selected model ID should continue to feed into the existing AI provider implementation exactly as before.

---

## UI example

Preferred final UX:

```text
AI Settings

Provider
[ OpenAI ]

API Key
[ sk-•••••••••• ]

Model
[ GPT-5.6 Luna ▼ ]

  GPT-5.6 Luna
  GPT-5.6 Terra
  GPT-5.6 Sol
  ─────────────
  Custom model...

[ Refresh models ]
```

If `Custom model...` is selected:

```text
Custom model ID
[ gpt-custom-model ]
```

---

## Acceptance criteria

- [ ] The model field is a selector instead of only a plain text field.
- [ ] Available models are loaded through the Atlas backend.
- [ ] Backend retrieves model availability using the configured OpenAI API key.
- [ ] Frontend never calls OpenAI directly.
- [ ] The selector only shows curated AI Add Item-compatible models.
- [ ] Initial curated models include Luna, Terra, and Sol.
- [ ] Unavailable preferred models are not shown as normal selectable options.
- [ ] `Custom model...` is always available.
- [ ] Existing custom/saved model values are preserved.
- [ ] `gpt-5.6-luna` remains the default for new installs.
- [ ] Changing the API key invalidates/refetches the model list.
- [ ] Failure to load models does not break Settings.
- [ ] Current AI Add Item behavior remains unchanged apart from easier model selection.

---

## Scope constraints

Keep this implementation small and localized.

Do not add:

- automatic model benchmarking;
- model pricing calculations;
- model quality scoring;
- model recommendations;
- provider switching logic beyond current OpenAI support;
- unrelated AI refactoring.
