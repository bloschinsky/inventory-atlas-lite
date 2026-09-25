import fs from 'node:fs';
import { httpError } from '../httpError.js';
import {
  DEFAULT_AI_PROVIDER, IMAGE_INPUT_OPTIONS, MAX_AI_DISPLAY_NAME_LENGTH, MAX_AI_MODEL_LENGTH, aiProvider, normalizeBaseUrl
} from '../../../shared/aiProviders.js';

const defaults = { enabled: false, provider: DEFAULT_AI_PROVIDER, displayName: '', model: 'gpt-5.6-luna', imageInput: 'auto', apiKey: '' };

function savedBaseUrl(value, preset) {
  try { return normalizeBaseUrl(value); } catch { return preset.defaultBaseUrl; }
}

function requireBaseUrl(value) {
  return normalizeBaseUrl(value);
}

// A connection can run once it has an endpoint and, where the provider needs one, a key.
const connectable = settings => Boolean(settings.baseUrl) && (Boolean(settings.apiKey) || !aiProvider(settings.provider).apiKeyRequired);

/*
  Owns the AI configuration: its file on disk, its validation, and the masked view the client gets.
  The file lives under DATA_DIR, outside SQLite, so it is never part of an inventory backup. The API
  key only leaves this module for the provider request itself, never in a response or a log.
*/
export class AiSettingsService {
  constructor({ settingsPath }) {
    this.settingsPath = settingsPath;
  }

  static label(settings) {
    return settings.provider === 'custom' ? (settings.displayName || 'Custom provider') : aiProvider(settings.provider).label;
  }

  /*
    A fresh installation has no settings file at all, so AI starts disabled and unconfigured. Files
    written before provider support hold only the OpenAI fields; they read as the OpenAI preset with
    its default base URL, so an existing configuration keeps working without being rebuilt.
  */
  read() {
    if (!fs.existsSync(this.settingsPath)) return { ...defaults, baseUrl: aiProvider(defaults.provider).defaultBaseUrl };
    const saved = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
    const preset = aiProvider(saved.provider) || aiProvider(defaults.provider);
    const settings = {
      enabled: saved.enabled === true,
      provider: preset.id,
      displayName: preset.id === 'custom' && typeof saved.displayName === 'string' ? saved.displayName.trim().slice(0, MAX_AI_DISPLAY_NAME_LENGTH) : '',
      baseUrl: savedBaseUrl(saved.baseUrl, preset),
      model: typeof saved.model === 'string' && saved.model.trim() ? saved.model.trim() : defaults.model,
      imageInput: IMAGE_INPUT_OPTIONS.includes(saved.imageInput) ? saved.imageInput : defaults.imageInput,
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : ''
    };
    // AI can only be on when it can connect. Otherwise the feature is off everywhere, so a settings
    // file that lost its key never leaves entry points visible for an operation that cannot run.
    settings.enabled &&= connectable(settings);
    return settings;
  }

  publicSettings() {
    const { apiKey, ...settings } = this.read();
    return { ...settings, hasApiKey: Boolean(apiKey), apiKeyMasked: apiKey ? `••••••••${apiKey.slice(-4)}` : '' };
  }

  write(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'INVALID_AI_SETTINGS');
    if (typeof input.enabled !== 'boolean') throw httpError(400, 'INVALID_AI_ENABLED');
    const model = typeof input.model === 'string' ? input.model.trim() : '';
    if (!model || model.length > MAX_AI_MODEL_LENGTH) throw httpError(400, 'INVALID_AI_MODEL', { max: MAX_AI_MODEL_LENGTH });
    const imageInput = input.imageInput ?? defaults.imageInput;
    if (!IMAGE_INPUT_OPTIONS.includes(imageInput)) throw httpError(400, 'INVALID_IMAGE_INPUT');
    const endpoint = this.endpoint(input);
    const settings = { enabled: input.enabled, ...endpoint, model, imageInput, apiKey: this.apiKeyFor(endpoint, input) };
    // Enabling without a usable connection is not an error, it simply cannot take effect: the request
    // is saved with AI turned off, and the answer shows the state that was actually stored.
    settings.enabled &&= connectable(settings);
    const temporaryPath = `${this.settingsPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, this.settingsPath);
    try { fs.chmodSync(this.settingsPath, 0o600); } catch { /* Windows may not apply POSIX file modes. */ }
    return this.publicSettings();
  }

  // The provider, display name, and base URL of a submitted form; the preset's URL when none is given.
  endpoint(input) {
    const preset = aiProvider(input.provider);
    if (!preset) throw httpError(400, 'UNSUPPORTED_AI_PROVIDER');
    let displayName = '';
    if (preset.id === 'custom' && input.displayName !== undefined && input.displayName !== null) {
      if (typeof input.displayName !== 'string' || input.displayName.trim().length > MAX_AI_DISPLAY_NAME_LENGTH) {
        throw httpError(400, 'AI_DISPLAY_NAME_TOO_LONG', { max: MAX_AI_DISPLAY_NAME_LENGTH });
      }
      displayName = input.displayName.trim();
    }
    const baseUrl = input.baseUrl === undefined || input.baseUrl === null || (input.baseUrl === '' && preset.defaultBaseUrl)
      ? requireBaseUrl(preset.defaultBaseUrl)
      : requireBaseUrl(input.baseUrl);
    return { provider: preset.id, displayName, baseUrl };
  }

  /*
    A new key replaces the saved one only when it is supplied. The saved key belongs to the endpoint
    it was entered for: changing the provider or the base URL drops it, so a stored secret can never
    be sent to a different server without being entered again.
  */
  apiKeyFor(endpoint, input) {
    if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== '') {
      if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.trim().length > 512) throw httpError(400, 'INVALID_API_KEY');
      return input.apiKey.trim();
    }
    const current = this.read();
    if (input.clearApiKey === true || current.provider !== endpoint.provider || current.baseUrl !== endpoint.baseUrl) return '';
    return current.apiKey;
  }

  /*
    The connection for the model list and the connection test. Without a form they use the saved
    settings; with one they use its unsaved values, so a provider can be checked before it is saved.
  */
  connection(input) {
    const settings = input === undefined ? this.read() : { ...this.endpoint(input), apiKey: '' };
    if (input !== undefined) settings.apiKey = this.apiKeyFor(settings, { apiKey: input.apiKey });
    const label = AiSettingsService.label(settings);
    if (!settings.apiKey && aiProvider(settings.provider).apiKeyRequired) throw httpError(409, 'AI_API_KEY_REQUIRED', { provider: label });
    return { provider: settings.provider, label, baseUrl: settings.baseUrl, apiKey: settings.apiKey };
  }

  // Shared by the AI use cases: they may only run with a configured, enabled provider.
  requireUsableSettings() {
    const settings = this.read();
    const label = AiSettingsService.label(settings);
    // The missing key is reported first: it is the reason AI is off in that case.
    if (!settings.apiKey && aiProvider(settings.provider).apiKeyRequired) throw httpError(409, 'AI_API_KEY_MISSING', { provider: label });
    if (!settings.enabled) throw httpError(409, 'AI_DISABLED');
    return { ...settings, label };
  }
}
