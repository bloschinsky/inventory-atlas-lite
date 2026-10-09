import { AppError, errorBody } from '../../../shared/appError.js';
import { httpError } from '../httpError.js';
import { ModelListCache } from './modelListCache.js';

/*
  The provider-neutral entry point of every AI feature. It resolves the configured provider through
  the injected factory, checks what the model can accept, and exposes model listing, a connection
  test, and structured generation. Features describe what they need; they never see provider HTTP.
*/
export class AiProviderService {
  constructor({ aiSettingsService, createProvider, modelListCache = new ModelListCache(), now = Date.now }) {
    this.settingsService = aiSettingsService;
    this.createProvider = createProvider;
    this.modelListCache = modelListCache;
    this.now = now;
  }

  // Only the OpenAI list is cached: the other providers keep listing live, as they always have.
  static cachesModels(connection) {
    return connection.provider === 'openai';
  }

  async fetchModels(connection) {
    const { models, providerCount } = await this.createProvider(connection).listModels();
    const list = { models, providerCount, fetchedAt: new Date(this.now()).toISOString() };
    if (AiProviderService.cachesModels(connection)) this.modelListCache.set(connection, list);
    return list;
  }

  /*
    `form` holds unsaved Settings values; without it the saved configuration is used. A cached list
    younger than a day is answered without contacting the provider unless `refresh` asks for a new
    one. When the provider fails, an earlier list of the same connection is still answered, marked
    `stale` and carrying the error, so the selector keeps its choices without hiding the failure.
  */
  async listModels(form, { refresh = false } = {}) {
    const connection = this.settingsService.connection(form);
    const cached = AiProviderService.cachesModels(connection) ? this.modelListCache.get(connection) : null;
    if (cached?.fresh && !refresh) return { ...cached.list, cached: true, stale: false };
    try {
      return { ...(await this.fetchModels(connection)), cached: false, stale: false };
    } catch (error) {
      if (!cached || !(error instanceof AppError) || error.listUnsupported) throw error;
      return { ...cached.list, cached: true, stale: true, error: errorBody(error) };
    }
  }

  // Always asks the provider. OpenAI reports how many models it returned and how many are offered.
  async testConnection(form) {
    const connection = this.settingsService.connection(form);
    try {
      const list = await this.fetchModels(connection);
      const { models, providerCount } = list;
      const notice = AiProviderService.cachesModels(connection)
        ? { code: 'AI_CONNECTED_CANDIDATES', params: { provider: connection.label, count: providerCount, offered: models.length } }
        : { code: 'AI_CONNECTED', params: { provider: connection.label, count: models.length } };
      return { notice, ...list };
    } catch (error) {
      // The endpoint answered, so it is reachable; it just cannot say which models it has.
      if (error.listUnsupported) return { notice: { code: 'AI_CONNECTED_NO_MODEL_LIST', params: { provider: connection.label } }, models: [] };
      throw error;
    }
  }

  // Fails fast, before a feature does any other work, when AI cannot run at all.
  assertReady() {
    this.settingsService.requireUsableSettings();
  }

  /*
    `image` is `{ buffer, mimeType }` or null. A model that is known not to read images is refused
    before anything is sent; an unknown one is tried, and its refusal is reported the same way.
  */
  async generateStructuredData({ purpose, image = null, ...request }) {
    const settings = this.settingsService.requireUsableSettings();
    const provider = this.createProvider({ provider: settings.provider, label: settings.label, baseUrl: settings.baseUrl, apiKey: settings.apiKey });
    const capabilities = settings.imageInput === 'auto' && image ? await provider.modelCapabilities(settings.model) : {};
    const imageInput = settings.imageInput === 'auto' ? capabilities.imageInput : settings.imageInput === 'supported';
    if (image && imageInput === false) throw httpError(422, 'AI_IMAGE_UNSUPPORTED');

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
