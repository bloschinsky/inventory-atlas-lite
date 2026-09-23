# Multi-LLM and OpenAI-compatible providers

- **Completed:** 2026-09-24
- **Version:** 0.31.0

## Summary

- Added provider presets for OpenAI, OpenRouter, Ollama, LM Studio, and a custom OpenAI-compatible
  endpoint in `shared/aiProviders.js`, with default base URLs, key requirements, base-URL validation,
  and a local-network host check shared by the Settings page and the server.
- Replaced `server/src/integrations/openAiClient.js` with a provider layer: `OpenAiProvider` keeps the
  Responses API, strict JSON-schema output, original image detail, and the curated model list;
  `OpenAiCompatibleProvider` uses `/models` and `/chat/completions` with a JSON-schema
  `response_format`, retries once without it on refusal, and parses fenced or embedded JSON. Both
  share `AiProviderHttp`, which sends the key only as a header and normalizes unreachable endpoints,
  rejected or missing keys, unknown models, wrong base URLs, unsupported model lists, rate limits,
  timeouts, refused images, invalid answers, and other provider errors.
- Added `AiProviderService`, the provider-neutral entry point for model listing, the connection test,
  and `generateStructuredData()`. It refuses a photo for a model known to be text-only (Settings
  override, OpenAI's curated models, or OpenRouter metadata) before any provider call. `AiFieldService`
  and `AiItemAnalysisService` now use it and keep their own validation unchanged.
- `AiSettingsService` stores the provider, display name, base URL, model, and image-input choice. Old
  settings files read as the OpenAI preset; local presets and custom endpoints can be enabled without
  a key; a saved key is dropped when the provider or base URL changes and is never reused for another
  endpoint. The `OPENAI_BASE_URL` environment override was removed.
- New API routes `POST /api/ai/models` and `POST /api/ai/test` work on unsaved Settings values;
  `/api/capabilities` gained `ai.imageInput`.
- Settings gained **Provider** presets, **Display name**, **Base URL** with the `localhost` note and a
  plain-HTTP warning for remote addresses, **Test connection**, provider model lists with *(text
  only)* labels, and **Image input**. AI Add Item hides the photo input for a text-only model. The
  **Remove the saved API key** checkbox no longer disappears when it is ticked.
- Documentation: new `docs/features/ai-providers.md` and its index entry; updates to
  `docs/features/ai-add-item.md`, `ai-add-fields.md`, `ai-feature-visibility.md`,
  `batch-add-fields.md`, `docs/HOW-TO.md` (provider setup, Ollama and LM Studio LAN examples,
  troubleshooting), `README.md`, `AGENTS.md`, and `docs/ROADMAP.md`; a release-history entry; and
  removal of the completed task file `docs/issues/TASK-multi-llm-openai-compatible-providers.md`.

## Verification

- `npm run lint` — passed.
- `npm test` — 104 passed, 1 skipped (shellcheck is not installed locally), including the new
  `test/ai-providers.test.js` (presets, base URLs, keys, migration, model listing, connection test,
  generation, normalized errors against a local stub, and AI feature regression with a mocked
  provider) and the updated OpenAI flows in `test/e2e.test.js` and `test/services.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 78 passed, including the new `test/e2e/ai-providers.spec.js` (Settings flow
  against a local OpenAI-compatible stub through to AI Add Fields, and the text-only photo state).
- No live or paid provider API was called. Manual checks against real Ollama, LM Studio, or
  OpenRouter servers were not performed.
