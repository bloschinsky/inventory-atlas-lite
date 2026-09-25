import { httpError } from '../httpError.js';

// Provider messages that mean the model cannot read the attached image.
const imageRejection = /image|vision|multimodal|modalit/i;
const missingModel = /model.{0,80}(not found|not exist|does not exist|unknown|no such)|(no such|unknown) model|model_not_found|not a valid model/i;

function providerDetail(body, text) {
  const detail = body?.error?.message ?? body?.error ?? body?.message ?? text;
  return (typeof detail === 'string' ? detail : JSON.stringify(detail) || '').slice(0, 300);
}

/*
  The HTTP transport shared by every AI provider adapter: one place for the request headers, the
  timeout, and the translation of provider failures into the application's own error codes. The
  provider's own wording is never passed on; it stays in the server log as diagnostic context.
  Paths are fixed constants from the adapters and are appended to the validated base URL, so no
  user-supplied path segment ever reaches a request. The API key is sent only as a header and is
  never logged; neither are request bodies, which can carry photos.
*/
export class AiProviderHttp {
  constructor({ label, baseUrl, apiKey }) {
    this.label = label;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // Resolves with the status and parsed body of any HTTP answer; throws only when there is none.
  async send(path, { body, timeoutMs }) {
    const headers = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (body) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(`${this.baseUrl}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw httpError(504, 'AI_PROVIDER_TIMEOUT', { provider: this.label });
      }
      console.warn('AI provider unreachable', { provider: this.label, baseUrl: this.baseUrl, reason: error.cause?.code || error.message });
      throw httpError(502, 'AI_PROVIDER_UNREACHABLE', { provider: this.label, baseUrl: this.baseUrl });
    }
    const text = await response.text().catch(() => '');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* Not JSON: kept as text for the error detail. */ }
    return { ok: response.ok, status: response.status, body: parsed, detail: response.ok ? '' : providerDetail(parsed, text) };
  }

  static rejectsImage(response) {
    return [400, 404, 415, 422, 500].includes(response.status) && imageRejection.test(response.detail);
  }

  // Maps a failed answer to a normalized error; `task` names the request in the server log.
  fail(response, { task, model = null, image = false }) {
    console.warn('AI provider error', { provider: this.label, status: response.status, task, model, detail: response.detail });
    const { status } = response;
    if (status === 401 || status === 403) {
      throw httpError(502, this.apiKey ? 'AI_PROVIDER_KEY_REJECTED' : 'AI_PROVIDER_KEY_REQUIRED', { provider: this.label });
    }
    if (status === 429) throw httpError(503, 'AI_PROVIDER_RATE_LIMITED', { provider: this.label });
    if (status === 408 || status === 504) throw httpError(504, 'AI_PROVIDER_TIMEOUT', { provider: this.label });
    if (image && AiProviderHttp.rejectsImage(response)) throw httpError(422, 'AI_IMAGE_UNSUPPORTED');
    if (model && missingModel.test(response.detail)) throw httpError(502, 'AI_MODEL_NOT_FOUND', { provider: this.label, model });
    if (status === 404) throw httpError(502, 'AI_PROVIDER_NO_API', { provider: this.label, baseUrl: this.baseUrl });
    throw httpError(502, 'AI_PROVIDER_REQUEST_FAILED', { provider: this.label, status });
  }

  // A model list that the endpoint does not implement is a normal state, not a broken provider.
  failModelList(response) {
    if ([404, 405, 501].includes(response.status)) {
      console.warn('AI provider model list unsupported', { provider: this.label, status: response.status });
      throw Object.assign(httpError(502, 'AI_MODEL_LIST_UNSUPPORTED', { provider: this.label }), { listUnsupported: true });
    }
    this.fail(response, { task: 'load the model list' });
  }
}
