# TASK — Multi-LLM and OpenAI-Compatible Provider Support

## Status

Planned.

## Goal

Remove the hard dependency of Inventory Atlas Lite AI features on OpenAI as the only LLM provider.

Introduce a provider abstraction that preserves existing OpenAI functionality while adding support for:

- OpenAI
- OpenRouter
- Ollama
- LM Studio
- generic custom OpenAI-compatible endpoints

The same provider subsystem must be reusable by all current AI features, including AI Add Item and AI Add Fields.

## Core architecture

Replace direct OpenAI-specific service coupling with a provider-neutral AI interface.

Recommended conceptual structure:

```text
AI feature service
  -> AIProviderService / AIClient interface
      -> OpenAIProvider
      -> OpenAICompatibleProvider
```

Preset providers such as OpenRouter, Ollama, and LM Studio may reuse the generic OpenAI-compatible implementation with provider-specific defaults.

Do not duplicate AI Add Item / AI Add Fields business logic per provider.

The provider layer must normalize:

- model listing;
- text generation;
- image/vision input where supported;
- structured JSON generation;
- provider errors;
- connection testing.

Keep provider-specific HTTP/client behavior under `server/src/integrations/` or the project-standard integration layer.

## Preserve existing behavior

Existing OpenAI configuration and AI functionality must continue to work after migration.

Migrate existing OpenAI settings safely where necessary.

Do not require users with a valid existing OpenAI configuration to manually rebuild it unless unavoidable.

Current model-selection behavior must remain available.

## Provider presets

Implement these provider choices in Settings.

### OpenAI

Default base URL:

```text
https://api.openai.com/v1
```

Requires API key.

Preserve current OpenAI-specific capabilities where useful.

### OpenRouter

Default base URL:

```text
https://openrouter.ai/api/v1
```

Requires API key.

Support model discovery where available.

Do not hard-code a permanent model catalog.

### Ollama

Default base URL:

```text
http://localhost:11434/v1
```

API key is normally optional/not required.

Allow the user to override the base URL because a self-hosted Inventory Atlas server may need to reach Ollama on another LAN machine, for example:

```text
http://192.168.1.50:11434/v1
```

### LM Studio

Default base URL:

```text
http://localhost:1234/v1
```

API key may be optional depending on local server configuration.

Allow base URL override for LAN-hosted LM Studio.

### Custom OpenAI-compatible

User-configurable:

- display name;
- base URL;
- API key, optional where supported;
- model;
- connection/model refresh.

This mode must not assume the endpoint is operated by OpenAI.

## Settings UI

Replace/extend the current AI settings with:

- **Provider**
- **Base URL**
- **API key**
- **Model**
- **Refresh models**
- **Test connection**
- provider help/status text

Provider presets should populate sensible default base URLs while allowing override where appropriate.

Never display a stored full API key after save.

Preserve the existing custom-model behavior if model discovery does not return the desired model.

## Model discovery

Use the provider's OpenAI-compatible model listing endpoint where supported.

A failed model-list request must not make the provider unusable if the user can manually supply a valid model ID.

Model discovery must:

- normalize model IDs into the existing selector;
- preserve a manually configured model;
- provide a useful error when listing is unsupported;
- avoid assuming every returned model can perform every Atlas AI task.

## Model capabilities

Inventory Atlas has different AI requirements.

At minimum distinguish:

- text input;
- image/vision input;
- structured/JSON output support.

AI Add Fields requires text generation.

AI Add Item with a photo requires a model/provider combination capable of image input.

Do not silently send images to a known text-only model.

When capabilities are known, disable or reject incompatible operations with a clear message such as:

`The selected model does not support image input.`

Because OpenAI-compatible APIs do not expose capabilities consistently, implement capabilities using a practical combination of:

- known provider/model metadata where reliable;
- provider configuration/preset knowledge;
- conservative fallback behavior;
- clear runtime errors.

Do not create a huge hard-coded model database.

## Structured output compatibility

Do not assume every OpenAI-compatible endpoint implements OpenAI-specific structured-output behavior identically.

Expose a provider-neutral operation such as:

```text
generateStructuredData(...)
```

OpenAI may use its best supported structured-output mechanism.

Generic OpenAI-compatible providers may use the most interoperable request format and then pass the result through strict server-side JSON/schema validation.

Existing Atlas validation remains authoritative.

Never write AI-produced data directly to the database without the current confirmation/validation flow.

## API compatibility strategy

Prefer broadly compatible OpenAI-style endpoints for generic providers.

Keep endpoint-specific behavior behind the provider adapter.

If an endpoint does not support an optional feature, return a normalized capability/compatibility error rather than leaking raw provider-specific stack traces to the UI.

Provider implementation must use configurable base URLs and must not concatenate unsafe arbitrary paths from user input.

Validate base URLs.

## Local-network behavior

Document that `localhost` is relative to the machine/container running the Inventory Atlas backend.

Examples:

- Proxmox LXC + Ollama on another PC: use the Ollama machine's LAN IP.
- Docker + LM Studio on the host/another device: use a reachable host/LAN address.
- Electron with a locally running provider: localhost may be appropriate.

Connection-test errors should make this distinction understandable.

Do not attempt automatic LAN scanning.

## Security

Store provider API keys using the existing AI settings/secrets pattern outside SQLite.

Secrets must:

- never be included in inventory database backups;
- never be returned in full through settings APIs;
- never be written to logs;
- be replaced only when the user explicitly supplies a new value.

For local HTTP endpoints, allow `http://` because Ollama/LM Studio commonly run without TLS on trusted LAN/localhost networks.

For remote public endpoints, prefer/document HTTPS.

Do not disable TLS certificate validation globally.

## Error normalization

Map provider failures into useful application-level errors for at least:

- unreachable endpoint;
- invalid base URL;
- invalid/missing API key;
- authentication failure;
- model not found;
- model-list unsupported;
- rate limit;
- provider timeout;
- unsupported image input;
- invalid structured response;
- provider/server error.

Keep enough technical detail in server logs for diagnosis without logging secrets or image payloads unnecessarily.

## Current AI features

Update all current AI-backed features to consume the provider abstraction.

At minimum verify:

### AI Add Item

- text-only input works with compatible providers;
- image input works with compatible vision providers/models;
- incompatible image/model combination is rejected clearly;
- current review/confirmation behavior remains unchanged.

### AI Add Fields

- works with compatible text models/providers;
- JSON result is validated using existing field-definition validation;
- current preview/edit/create flow remains unchanged.

Any future AI feature should be able to use the same provider layer.

## Tests

Add automated tests without requiring live paid APIs.

### Provider abstraction

Cover:

- OpenAI preset;
- OpenRouter preset;
- Ollama preset;
- LM Studio preset;
- custom compatible provider;
- custom base URL;
- optional API key;
- required API key;
- model listing;
- manual model fallback;
- connection test;
- normalized provider errors.

### AI feature regression

Using mocked providers, verify:

- AI Add Fields succeeds through the provider abstraction;
- AI Add Item text flow succeeds;
- AI Add Item vision flow succeeds for a vision-capable provider;
- vision request is rejected for text-only capability;
- invalid structured provider output is rejected;
- no AI response bypasses existing server validation.

### Playwright

Cover the main Settings flow:

1. choose a provider;
2. verify preset base URL;
3. configure credentials/base URL;
4. test connection;
5. refresh/select a model;
6. save;
7. verify the selected provider/model is used by an AI feature.

Use mocked backend/provider responses in CI.

## Documentation

When implemented:

- add/update the relevant feature documentation under `docs/features/`;
- document each supported provider preset;
- add local Ollama and LM Studio examples;
- clearly explain the `localhost` behavior for Docker/Proxmox;
- update `docs/HOW-TO.md`;
- update `docs/features/README.md`;
- update `docs/ROADMAP.md`;
- add the required `docs/changes/YYYY-MM-DD-*.md` record;
- update `AGENTS.md` repository structure/rules where needed;
- follow the task-file lifecycle.

## Acceptance criteria

- OpenAI continues to work after the refactor.
- AI services no longer depend directly on OpenAI-specific transport.
- OpenRouter can be configured through an OpenAI-compatible endpoint.
- Ollama can be configured locally or through a LAN base URL.
- LM Studio can be configured locally or through a LAN base URL.
- A custom OpenAI-compatible endpoint can be configured.
- Model discovery works where supported and manual model entry remains possible.
- AI Add Item rejects known text-only models for photo analysis.
- Existing review/validation flows remain authoritative.
- API keys remain outside SQLite and inventory backups.
- Provider errors are normalized for the UI.
- Automated provider, service/API, and Playwright coverage passes.
