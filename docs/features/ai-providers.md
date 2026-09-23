# AI providers

## Summary

The AI features are not tied to OpenAI. **Settings → AI** selects one provider from five presets —
OpenAI, OpenRouter, Ollama, LM Studio, and a custom OpenAI-compatible endpoint — and both
[AI Add Item](ai-add-item.md) and [AI Add Fields](ai-add-fields.md) use whichever one is saved,
through one provider-neutral server layer. The business logic, the prompts, and the validation of
every answer are the same for all providers.

## Presets

| Provider | Default base URL | API key | Notes |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | Required | Native Responses API with strict JSON-schema output. Only the recommended models available to the key are listed (GPT-5.6 Luna, Terra, Sol). |
| OpenRouter | `https://openrouter.ai/api/v1` | Required | The model list is loaded from OpenRouter and shows which models are text only. |
| Ollama | `http://localhost:11434/v1` | Optional | For photos choose a vision model such as `llava` or `qwen2.5vl`. |
| LM Studio | `http://localhost:1234/v1` | Optional | A key is needed only when authentication is enabled in the LM Studio server. |
| Custom OpenAI-compatible | none | Optional | Any server with the OpenAI-style `/models` and `/chat/completions` endpoints. Has its own **Display name**. |

Every preset's base URL can be overridden, for example to reach Ollama on another computer. The
presets are defined once in `shared/aiProviders.js`, which both the Settings page and the server
import; there is no hard-coded model catalogue for any provider other than OpenAI's curated three.

### `localhost` is the server, not the browser

The Inventory Atlas **backend** makes every provider request, so `localhost` in a base URL means the
machine or container that runs the Inventory Atlas server:

- **Proxmox LXC, Ollama on a desktop PC:** use the PC's LAN address, for example
  `http://192.168.1.50:11434/v1`, and start Ollama with `OLLAMA_HOST=0.0.0.0` so it accepts LAN
  connections.
- **Docker, LM Studio on the Docker host or another device:** use an address the container can
  reach, such as the host's LAN IP (`http://192.168.1.20:1234/v1`) or `http://host.docker.internal:1234/v1`
  where Docker provides it, and enable *Serve on Local Network* in LM Studio.
- **Everything on one machine without containers** (for example a future desktop build or
  `npm run dev`): `http://localhost:11434/v1` or `http://localhost:1234/v1` is correct.

Connection errors repeat this distinction. The application never scans the network for providers.

## Settings

The AI card in **Settings** has **Enable AI features**, **Provider**, **Display name** (custom only),
**Base URL**, **API key**, **Test connection**, **Model** with **Refresh models** and **Custom
model...**, and **Image input**. Choosing a provider fills in its default base URL and clears the
previous provider's model list.

- **Test connection** and **Refresh models** use the values currently in the form, before saving,
  through `POST /api/ai/test` and `POST /api/ai/models`. `GET /api/ai/models` still lists the models
  of the saved configuration.
- A model list that cannot be loaded never blocks the provider: the saved or typed model ID stays in
  use through **Custom model...**, and a warning explains why the list is missing. An endpoint that
  does not implement `/models` is reported as reachable but unlisted by the connection test.
- Listed models keep the provider's own IDs and names. A model the provider reports as text-only is
  labelled *(text only)*.
- **Image input** is *Detect automatically*, *Supported by this model*, or *Not supported (text
  only)*; see [Model capabilities](#model-capabilities).
- Plain `http://` is accepted because Ollama and LM Studio normally run without TLS. For an address
  outside the local network (not loopback, a private IPv4 or IPv6 range, Tailscale's CGNAT range, a
  single-label host, or a `.local`, `.lan`, `.internal`, or `.ts.net` name) the form warns that the
  key and data would travel unencrypted.

Enabling AI requires a usable connection: a base URL and, for OpenAI and OpenRouter, an API key. The
local presets and a custom endpoint can be enabled without a key. Otherwise the rules of
[AI feature visibility](ai-feature-visibility.md) are unchanged.

## Model capabilities

OpenAI-compatible servers do not describe their models consistently, so capabilities are resolved
conservatively:

- **Text** is assumed for every model; AI Add Fields and a description-only AI Add Item need nothing
  else.
- **Image input**: an explicit *Supported* or *Not supported* in Settings always wins. With *Detect
  automatically*, OpenAI models are treated as vision-capable, OpenRouter's published
  `architecture.input_modalities` decides for its models, and every other model is unknown.
- **Structured output**: OpenAI always uses strict JSON-schema output. For other providers,
  OpenRouter's `supported_parameters` tells whether a model accepts `response_format`; elsewhere it
  is tried and dropped on refusal (see below).

A photo is never sent to a model known to be text-only: the server answers `422` with *The selected
model does not support image input.* before contacting the provider. With *Not supported* the AI Add
Item page also hides the photo input and explains why (`/api/capabilities` reports
`ai.imageInput: false`). An unknown model is tried, and a provider refusal that mentions images,
vision, or modalities is reported with the same message.

## Implementation overview

```text
AiItemAnalysisService ─┐
AiFieldService ────────┴→ AiProviderService → createProvider(connection)
                                                ├→ OpenAiProvider            (/models, /responses)
                                                └→ OpenAiCompatibleProvider  (/models, /chat/completions)
                                                      both use AiProviderHttp (transport + errors)
```

- `server/src/services/aiSettingsService.js` owns `ai-settings.json`: the provider, display name,
  base URL, model, image-input choice, and API key. It validates the base URL with
  `normalizeBaseUrl()` (only `http:`/`https:`, no credentials, query, or fragment; the trailing slash
  is removed) and builds the connection for unsaved Settings values.
- `server/src/services/aiProviderService.js` is the provider-neutral entry point. It requires usable
  settings, applies the image-input rule, calls `generateStructuredData()`, and logs the purpose,
  provider, model, duration, success, and token usage — never the key, the prompt, or the image.
  It also implements the model list and the connection test.
- `server/src/integrations/openAiProvider.js` keeps the previous OpenAI behaviour: the Responses API,
  `store: false`, strict `json_schema` output, the original image detail, and the curated model list.
- `server/src/integrations/openAiCompatibleProvider.js` serves the other four presets. It sends a
  system message with the instructions and the JSON schema, the user content as text or as text plus
  an `image_url` data URL, and a `json_schema` `response_format`. When the endpoint rejects that
  format with a `400`/`422`, the request is repeated once without it. The reply may be plain JSON or
  JSON in a code fence or sentence; the outermost object is parsed.
- `server/src/integrations/aiProviderHttp.js` appends only fixed endpoint names to the validated base
  URL, sends the key only as a `Bearer` header, and normalizes failures.
- The composition root in `server/src/app.js` chooses the adapter: OpenAI uses `OpenAiProvider`,
  every other preset `OpenAiCompatibleProvider`.

The existing validation stays authoritative. AI Add Fields still reads every answer with
`readFieldDefinitionDocument`, AI Add Item still normalizes and filters the draft, and both results
only reach the database through the reviewed save the user confirms.

### Normalized errors

| Situation | Status | Message (shortened) |
| --- | --- | --- |
| Invalid base URL | 400 | *Base URL must start with http:// or https://.* and similar |
| Missing required API key | 409 | *Enter the OpenRouter API key first.* / *Add an OpenAI API key in Settings before …* |
| Endpoint unreachable | 502 | *Could not reach Ollama at … "localhost" means that machine or container …* |
| Key rejected (`401`/`403`) | 502 | *… rejected the API key.* or, without a key, *… requires an API key.* |
| Model not found | 502 | *… does not know the model "…".* |
| No compatible API at the base URL (`404`) | 502 | *… has no compatible API at …; it usually ends in /v1.* |
| Model list unsupported | 502 | *… does not support listing models at this base URL. Enter the model ID manually.* |
| Rate limit (`429`) | 503 | *… rate limit reached.* |
| Timeout (15 s list, 45 s OpenAI, 120 s others) | 504 | *… did not answer in time.* |
| Image not supported | 422 | *The selected model does not support image input.* |
| Invalid structured answer | 502 | *… returned an invalid structured response.* |
| Other provider or server error | 502 | *… could not … (HTTP n).* |

The provider's own error text is written to the server log, shortened to 300 characters, and never
sent to the browser.

## Credentials and migration

- The key stays in `ai-settings.json` under `DATA_DIR` with owner-only permissions where supported:
  outside SQLite and therefore outside every inventory backup. Settings responses contain only
  `hasApiKey` and the last four characters.
- A saved key belongs to the provider and base URL it was entered for. Saving another provider or
  address without a new key removes it, and the model list or connection test for a different
  endpoint never reuses it, so a stored key cannot be redirected to another server.
- A settings file written before provider support (`enabled`, `provider: "openai"`, `model`,
  `apiKey`) reads as the OpenAI preset with the default base URL and automatic image detection, so an
  existing configuration keeps working without being entered again.
- The previous `OPENAI_BASE_URL` environment override is gone; the base URL is a saved setting.
- TLS certificate validation is never disabled.

## Verification

- `test/ai-providers.test.js` covers the preset definitions, base-URL validation, the local-network
  host check, migration of an old settings file, every preset's default and overridden base URL,
  optional and required keys, the key staying with its endpoint, model listing with capabilities,
  authentication with and without a key, the unsupported model list, the connection test for
  reachable, unlisted, and unreachable endpoints, structured generation with the retry without
  `response_format`, vision requests, and every normalized error, all against a local stub server.
  With a mocked provider it checks AI Add Fields, AI Add Item text and vision flows, rejection of a
  text-only model without a provider call, the Settings override in both directions, and rejection of
  invalid structured answers by the existing validation.
- `test/e2e.test.js` keeps the OpenAI API flows, now with the base URL pointed at the local stub.
- `test/e2e/ai-providers.spec.js` walks the Settings flow against a local OpenAI-compatible stub:
  preset base URLs, a custom provider with display name, base URL, and key, **Test connection**,
  **Refresh models** with a text-only label, selecting and saving a model, and AI Add Fields using
  exactly that provider, model, and key. A second test checks that a text-only setting hides the
  photo input on AI Add Item.

## Boundaries

- Only OpenAI-style HTTP APIs are supported; there is no native Anthropic, Gemini, or Ollama API
  adapter.
- Capability detection relies on provider metadata where it exists (OpenAI's curated models and
  OpenRouter); for other servers use the **Image input** setting.
- One provider is configured at a time; there is no per-feature provider or fallback chain.
- Structured output from small local models can still be malformed. Such answers are rejected with a
  clear message and never stored.
