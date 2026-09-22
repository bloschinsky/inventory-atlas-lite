# AI feature visibility

- **Completed:** 2026-09-22
- **Version:** 0.22.0

## Summary

`Enable AI features` in *Settings* now controls whether the AI actions exist in the interface at
all, instead of letting a user open an AI action and receive an API error afterwards.

- Added `GET /api/capabilities` (`server/src/routes/capabilityRoutes.js`, wired in
  `server/src/app.js`). It returns only `{ "ai": { "enabled": <saved flag> } }`; no provider, model,
  or API key is exposed.
- Added `client/src/capabilities.js`, the shared reactive visibility state for optional features. It
  is loaded once at startup, exposes `capabilities.ai.enabled`, and fails closed, so a failed
  request hides AI actions instead of breaking the application. Another optional feature is one more
  key next to `ai`.
- Hid the AI entry points while AI is disabled: **AI Add Item** in the *Items* header and empty
  state, and **AI Add Fields** in *Categories & Fields*. **Batch Add Fields** is unaffected.
- Added a router guard in `client/src/main.js` that redirects `/items/ai` to `/items` while AI is
  disabled, so a typed URL cannot open the AI page.
- `client/src/pages/Settings.vue` applies the saved state to the shared store, so the AI actions
  appear or disappear immediately after **Save settings**, with no page reload. An unsaved checkbox
  change affects nothing outside the form.
- The server-side guards were not touched: `AiSettingsService.requireUsableSettings()` still rejects
  AI requests with `409` while AI features are disabled.

Tied the enabled state to a saved API key, since AI cannot run without one:

- `AiSettingsService.write()` stores `enabled: false` whenever the saved configuration ends up
  without a key, and `read()` applies the same rule, so an older or hand-edited settings file that
  has no key is disabled everywhere, including `/api/capabilities`.
- Removing the saved key turns AI features off in the same save.
- `requireUsableSettings()` now reports the missing key before the disabled state, which is the more
  useful message once the two are linked.
- In *Settings*, the **Enable AI features** switch is unavailable, with a hint, until a key is saved
  or typed into the form, and it clears itself when **Remove the saved API key** is ticked.
- Confirmed that a fresh installation starts disabled: with no settings file, `read()` returns the
  defaults, and both `/api/settings/ai` and `/api/capabilities` report AI as off.

## Documentation

- Added `docs/features/ai-feature-visibility.md` and its entry in `docs/features/README.md`.
- Updated `docs/HOW-TO.md`: the setup section explains what turning AI off removes, and the AI Add
  Item, AI Add Fields, and troubleshooting entries were corrected accordingly.
- Removed the completed `docs/issues/TASK-ai-feature-visibility.md` and its roadmap entry in
  `docs/ROADMAP.md`.
- Listed `client/src/capabilities.js` in the repository structure in `AGENTS.md`.
- Added the 0.22.0 entry to `shared/release-history.json`.

## Verification

- `npm run lint` — passed.
- `npm test` — passed (71 tests, 1 pre-existing skip). Extended `test/e2e.test.js` with the
  `/api/capabilities` assertions for both AI states, the check that no API key is exposed there, and
  the enable-without-a-key and key-removal cases; added the `AiSettingsService` rules to
  `test/services.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — passed, 53 Playwright tests in Chromium. Added
  `test/e2e/ai-visibility.spec.js` (hidden and visible entry points, the `/items/ai` redirect, the
  backend `409` responses, the reload-free effect of saving the setting both ways, and a failed
  capability request leaving navigation intact, and the switch staying unavailable until a key is
  saved). The specs that need AI available now set that state through the new `setAiEnabled` helper
  in `test/e2e/helpers.js`, which saves a test key with it.
