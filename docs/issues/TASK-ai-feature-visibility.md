# Task: Make `Enable AI Features` a real UI feature toggle

## Goal

When AI features are disabled in **Settings**, hide all AI-specific UI entry points instead of letting the user open them and only then receive an API error.

The backend must still reject disabled AI operations. Hiding UI is UX only, not a security or validation replacement.

## Requirements

### 1. Central AI capability state

Create a small shared frontend capability/state layer for optional features.

Minimum required state:

```js
capabilities.ai.enabled
```

The UI must use the persisted backend setting as the source of truth.

Preferred implementation:

- expose a minimal endpoint such as `GET /api/capabilities`;
- return only UI-safe capability information, for example:

```json
{
  "ai": {
    "enabled": true
  }
}
```

- do not expose API keys or other AI credentials through this endpoint;
- load capabilities once at application startup;
- make the state reusable by any component that needs feature visibility.

If loading capabilities fails, the normal non-AI application must remain usable and AI entry points should fail closed / remain hidden.

### 2. Hide AI UI when disabled

When `ai.enabled === false`, hide at minimum:

- **AI Add Item** button in the Items page header;
- **AI Add Item** button in the Items empty state;
- **AI Add Fields** button in Categories & Fields;
- any other current AI-only action found during implementation.

When AI is enabled, these actions must appear normally.

Do not hide non-AI functionality such as **Batch Add Fields**.

### 3. Settings integration

`Enable AI Features` remains in Settings.

After the user saves a changed AI enabled state:

- update the shared capability state immediately;
- UI entry points should appear/disappear without requiring a page reload.

Unsaved checkbox changes must not affect the rest of the application.

### 4. Protect direct navigation

The `/items/ai` route must not behave like a usable AI page while AI is disabled.

Preferred behavior:

- redirect to `/items`.

Do not rely only on hidden buttons because users can navigate directly by URL.

### 5. Keep backend guards

Keep the existing backend validation that rejects AI requests while AI features are disabled.

Direct requests to AI endpoints must still fail even if the frontend is bypassed.

Do not weaken or remove `requireUsableSettings()` or equivalent server-side checks.

## Architecture

Keep feature visibility logic centralized.

Do not add separate `GET /api/settings/ai` calls independently inside every page/component.

The implementation should be easy to extend later with additional optional capabilities, for example:

```js
capabilities.ai.enabled
capabilities.someFutureFeature.enabled
```

Avoid unnecessary abstraction beyond this small capability store.

## Tests

Add/update automated tests covering at least:

1. AI disabled:
   - AI Add Item is not visible in Items header;
   - AI Add Item is not visible in Items empty state;
   - AI Add Fields is not visible in Categories & Fields;
   - direct `/items/ai` navigation redirects to `/items`;
   - backend AI endpoints still reject requests.

2. AI enabled:
   - AI Add Item appears;
   - AI Add Fields appears;
   - `/items/ai` remains accessible.

3. Settings:
   - saving OFF hides AI UI without reload;
   - saving ON restores AI UI without reload.

4. A failed capability request does not break normal application navigation.

## Documentation

Update the relevant feature/HOW-TO documentation to explain that disabling AI features removes AI actions from the UI while leaving the rest of Inventory Atlas Lite unchanged.

Follow the repository documentation conventions in `AGENTS.md`.

## Out of scope

- deleting AI configuration when AI is disabled;
- changing model/provider settings;
- changing AI request behavior;
- adding authentication/permissions;
- removing server-side AI guards.
