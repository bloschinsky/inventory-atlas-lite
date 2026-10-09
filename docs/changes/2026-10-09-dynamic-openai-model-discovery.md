# Dynamic OpenAI model discovery

- Completed: 2026-10-09
- Version: 0.62.0
- Issue: #29

## Summary

The OpenAI model selector no longer intersects `/models` with the fixed GPT-5.6 Luna/Terra/Sol
allowlist, so a new GPT generation appears without an application release.

- `server/src/integrations/openAiModelCatalog.js` classifies the listing: GPT IDs are recognized by
  their name pattern, versions compare numerically (6.10 > 6.9), embedding, moderation, speech,
  realtime, image-generation, and legacy completion models are excluded, IDs are deduplicated and
  validated and kept exactly. Models are grouped into *Recommended / Latest* (the newest generation
  and the verified models), *Previous generations*, and *Other models* (shown on request).
- Capabilities are reported conservatively: only the verified GPT-5.6 models report image input and
  structured output; every other model is unknown. The OpenAI adapter's blanket `imageInput: true` is
  gone, so an unknown model is tried and a refusal is reported once, without a retry.
- `server/src/services/modelListCache.js` caches the OpenAI list in memory for 24 hours per
  connection under an HMAC key, so the API key is not stored and other keys, addresses, or providers
  never share an entry. **Refresh models** (`refresh: true`) and **Test connection** bypass it; a
  failed request answers the earlier list marked `stale` with the error. Other providers stay uncached
  and their listing is unchanged.
- `/api/ai/models` returns `{ models, providerCount, fetchedAt, cached, stale }`, and the OpenAI
  connection test reports the returned and candidate counts (`AI_CONNECTED_CANDIDATES`).
- Settings → AI: a grouped native select with **Show all models**, a **Refresh models** button with
  loading feedback, a live status line (last checked, models offered), the exact Model ID with
  Vision and Structured output as Supported / Not supported / Unknown, a *verified* mark, a note when
  the manual Image input setting overrides it, and the stale, failed, empty, no-recommendation, and
  changed-connection states. The configured model always stays selectable and is marked when the
  provider no longer lists it; loading or refreshing never changes or saves it.
- English and Ukrainian strings, `docs/features/ai-providers.md`, `ai-add-item.md`,
  `settings-center.md`, the feature index, and both user guides were updated.
- The default model (`gpt-5.6-luna`), saved settings, prompts, and the Responses API request are
  unchanged.

## Verification

- `npm run lint` — passed.
- `npm test` — 348 of 350 passed. The two failures are the known Windows-only guide tests in
  `test/landing.test.js` ("a translation that drifts…", "the guide renders Markdown safely…"), which
  fail the same way on the unchanged tracked files.
- `npm run build` — passed.
- `APP_VERSION=0.62.0 npm run test:e2e` — 236 passed, including the four new tests in `test/e2e/openai-model-selector.spec.js` (`APP_VERSION` is set because the What's New tests fail on an untagged `-dev` build).
