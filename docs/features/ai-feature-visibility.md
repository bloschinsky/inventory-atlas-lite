# AI feature visibility

## Summary

**Enable AI features** in *Settings* is the switch that decides whether the optional AI actions
exist in the interface. While it is off, the AI entry points are not rendered and the AI page is not
reachable, so a user is never offered an action the server would reject. Everything that is not AI
keeps working exactly as before.

Hiding an entry point is a user-experience decision only. The server-side guard
(`AiSettingsService.requireUsableSettings()`) is unchanged and still rejects every AI request with
`409` while AI features are disabled, so bypassing the browser gains nothing.

## Capability state

```text
GET /api/capabilities → { "ai": { "enabled": false } }
                      → client/src/capabilities.js (loaded once at startup)
                      → pages and the router guard
```

- `server/src/routes/capabilityRoutes.js` answers with the UI-safe view of the optional features of
  this installation. It reports only the saved `enabled` flag; the provider, the model, and the API
  key never appear in the response.
- `client/src/capabilities.js` holds the shared reactive state, in the same style as `theme.js` and
  `update.js`. It exposes `capabilities.ai.enabled`, a memoized `loadCapabilities()`, and
  `setAiEnabled()`. Components read the state; no page asks the AI settings endpoint for visibility.
- The store **fails closed**: the state starts at `false` and a failed request leaves it there, so a
  capability is hidden until the backend confirms it. A failed request never blocks the application:
  the non-AI interface and all navigation continue to work.
- Adding another optional feature means adding one more key next to `ai`
  (`capabilities.someFutureFeature.enabled`); no further structure is needed.

## User-visible behaviour

While `ai.enabled` is `false`:

- **AI Add Item** is absent from the *Items* page header and from its empty state.
- **AI Add Fields** is absent from *Categories & Fields*. **Batch Add Fields** is not an AI action
  and stays available.
- `/items/ai` is not a usable page: a router guard redirects the navigation to `/items`, so a typed
  URL, a bookmark, or a back/forward entry cannot open it.

While `ai.enabled` is `true`, all of these appear and behave as documented in
[AI Add Item](ai-add-item.md) and [AI Add Fields](ai-add-fields.md).

## Settings integration

- Saving the AI settings applies the returned `enabled` value to the shared state, so the AI actions
  appear or disappear immediately, without a page reload.
- Only the saved value counts. Ticking or clearing the checkbox without pressing **Save settings**
  changes nothing outside the form, and reopening *Settings* shows the saved state again.

## Boundaries

- Disabling AI features changes visibility only. The saved provider, model, and API key are kept
  untouched, and re-enabling restores the previous configuration.
- The router guard covers the AI-only page. AI requests made by any other means are still stopped by
  the backend guard, which this feature does not weaken.

## Verification

- `test/e2e.test.js` asserts that `/api/capabilities` follows the saved setting in both states and
  carries no API key.
- `test/e2e/ai-visibility.spec.js` covers the hidden and visible states of both entry points, the
  `/items/ai` redirect, the backend `409` responses while AI is disabled, the reload-free effect of
  saving the setting in both directions, and a failed capability request leaving navigation intact.
