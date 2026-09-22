import { reactive } from 'vue';
import { api } from './api.js';

/*
  Shared visibility state for the optional features of this installation, in the same style as
  theme.js and update.js. Pages read it instead of asking the AI settings endpoint themselves, so a
  single request decides what the whole interface offers.

  It fails closed: a capability stays hidden until the backend confirms it. Hiding an entry point is
  only UX; the backend keeps rejecting operations for a feature that is turned off.
*/
export const capabilities = reactive({ ai: { enabled: false } });

let loading = null;

// Loaded once at startup; later calls reuse the same promise so a navigation guard can await it.
export function loadCapabilities() {
  loading ??= api('/api/capabilities')
    .then(loaded => setAiEnabled(loaded?.ai?.enabled))
    .catch(() => setAiEnabled(false));
  return loading;
}

// Applied straight from a saved settings response so the interface follows without a reload.
export function setAiEnabled(enabled) {
  capabilities.ai.enabled = enabled === true;
}
