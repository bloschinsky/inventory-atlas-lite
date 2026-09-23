import { httpError } from '../httpError.js';

/*
  The provider-neutral entry point of every AI feature. It resolves the configured provider through
  the injected factory, checks what the model can accept, and exposes model listing, a connection
  test, and structured generation. Features describe what they need; they never see provider HTTP.
*/
export class AiProviderService {
  constructor({ aiSettingsService, createProvider }) {
    this.settingsService = aiSettingsService;
    this.createProvider = createProvider;
  }

  // `form` holds unsaved Settings values; without it the saved configuration is used.
  async listModels(form) {
    return this.createProvider(this.settingsService.connection(form)).listModels();
  }

  async testConnection(form) {
    const connection = this.settingsService.connection(form);
    try {
      const models = await this.createProvider(connection).listModels();
      return { message: `Connected to ${connection.label}. ${models.length === 1 ? '1 model is' : `${models.length} models are`} available.`, models };
    } catch (error) {
      // The endpoint answered, so it is reachable; it just cannot say which models it has.
      if (error.listUnsupported) return { message: `Connected to ${connection.label}, but it does not list its models. Enter the model ID manually.`, models: [] };
      throw error;
    }
  }

  // Fails fast, before a feature does any other work, when AI cannot run at all.
  assertReady(action) {
    this.settingsService.requireUsableSettings(action);
  }

  /*
    `image` is `{ buffer, mimeType }` or null. A model that is known not to read images is refused
    before anything is sent; an unknown one is tried, and its refusal is reported the same way.
  */
  async generateStructuredData({ action, purpose, image = null, ...request }) {
    const settings = this.settingsService.requireUsableSettings(action);
    const provider = this.createProvider({ provider: settings.provider, label: settings.label, baseUrl: settings.baseUrl, apiKey: settings.apiKey });
    const capabilities = settings.imageInput === 'auto' && image ? await provider.modelCapabilities(settings.model) : {};
    const imageInput = settings.imageInput === 'auto' ? capabilities.imageInput : settings.imageInput === 'supported';
    if (image && imageInput === false) throw httpError('The selected model does not support image input.', 422);

    const started = Date.now();
    const log = details => console.info('AI request', { purpose, provider: settings.provider, model: settings.model, image: Boolean(image), durationMs: Date.now() - started, ...details });
    try {
      const result = await provider.generateStructuredData({ ...request, model: settings.model, image, structuredOutput: capabilities.structuredOutput ?? null });
      log({ success: true, usage: result.usage });
      return result;
    } catch (error) {
      log({ success: false });
      throw error;
    }
  }
}
