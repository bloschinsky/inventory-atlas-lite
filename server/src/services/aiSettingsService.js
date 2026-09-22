import fs from 'node:fs';
import { httpError } from '../httpError.js';

const defaults = { enabled: false, provider: 'openai', model: 'gpt-5.6-luna', apiKey: '' };
// Only the models this application is known to work with are offered, and only when the account
// actually has access to them.
const preferredOpenAiModels = [
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }
];

/*
  Owns the AI configuration: its file on disk, its validation, and the masked view the client gets.
  The API key never leaves this module in full.
*/
export class AiSettingsService {
  constructor({ settingsPath, openAiClient }) {
    this.settingsPath = settingsPath;
    this.openAiClient = openAiClient;
  }

  // A fresh installation has no settings file at all, so AI starts disabled and unconfigured.
  read() {
    if (!fs.existsSync(this.settingsPath)) return { ...defaults };
    const saved = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
    const apiKey = typeof saved.apiKey === 'string' ? saved.apiKey : '';
    return {
      // AI can only be on with a saved key. Without one the feature is off everywhere, so a settings
      // file that lost its key never leaves entry points visible for an operation that cannot run.
      enabled: saved.enabled === true && Boolean(apiKey),
      provider: saved.provider === 'openai' ? saved.provider : defaults.provider,
      model: typeof saved.model === 'string' && saved.model.trim() ? saved.model.trim() : defaults.model,
      apiKey
    };
  }

  publicSettings() {
    const settings = this.read();
    return {
      enabled: settings.enabled,
      provider: settings.provider,
      model: settings.model,
      hasApiKey: Boolean(settings.apiKey),
      apiKeyMasked: settings.apiKey ? `••••••••${settings.apiKey.slice(-4)}` : ''
    };
  }

  write(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Invalid AI settings.');
    if (typeof input.enabled !== 'boolean') throw httpError('AI enabled must be true or false.');
    if (input.provider !== 'openai') throw httpError('OpenAI is the only supported AI provider.');
    if (typeof input.model !== 'string' || !input.model.trim() || input.model.trim().length > 100) {
      throw httpError('Model is required and must be 100 characters or fewer.');
    }
    const current = this.read();
    let apiKey = current.apiKey;
    if (input.clearApiKey === true) apiKey = '';
    if (input.apiKey !== undefined && input.apiKey !== '') {
      if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.trim().length > 512) {
        throw httpError('API key is invalid.');
      }
      apiKey = input.apiKey.trim();
    }
    // Enabling without a key is not an error, it simply cannot take effect: the request is saved
    // with AI turned off, and the answer shows the state that was actually stored.
    const settings = { enabled: input.enabled && Boolean(apiKey), provider: input.provider, model: input.model.trim(), apiKey };
    const temporaryPath = `${this.settingsPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, this.settingsPath);
    try { fs.chmodSync(this.settingsPath, 0o600); } catch { /* Windows may not apply POSIX file modes. */ }
    return this.publicSettings();
  }

  // Shared by the AI use cases: they may only run with a configured, enabled provider.
  requireUsableSettings(missingKeyMessage) {
    const settings = this.read();
    // The missing key is reported first: it is the reason AI is off in that case.
    if (!settings.apiKey) throw httpError(missingKeyMessage, 409);
    if (!settings.enabled) throw httpError('AI features are disabled. Enable them in Settings.', 409);
    if (settings.provider !== 'openai') throw httpError('The configured AI provider is not supported.', 409);
    return settings;
  }

  async listAvailableModels() {
    const settings = this.read();
    if (!settings.apiKey) throw httpError('Add an OpenAI API key in Settings before loading models.', 409);
    const availableIds = new Set(await this.openAiClient.listModels(settings.apiKey));
    return preferredOpenAiModels.filter(model => availableIds.has(model.id));
  }
}
