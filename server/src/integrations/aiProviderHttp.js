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
  timeout, and the translation of provider failures into the application's own error messages.
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
        throw httpError(`${this.label} did not answer in time. Try again, or use a faster model.`, 504);
      }
      console.warn('AI provider unreachable', { provider: this.label, baseUrl: this.baseUrl, reason: error.cause?.code || error.message });
      throw httpError(`Could not reach ${this.label} at ${this.baseUrl}. Check that it is running and reachable from the ` +
        'machine running Inventory Atlas: "localhost" means that machine or container, not your browser\'s computer.', 502);
    }
    const text = await response.text().catch(() => '');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* Not JSON: kept as text for the error detail. */ }
    return { ok: response.ok, status: response.status, body: parsed, detail: response.ok ? '' : providerDetail(parsed, text) };
  }

  static rejectsImage(response) {
    return [400, 404, 415, 422, 500].includes(response.status) && imageRejection.test(response.detail);
  }

  // Maps a failed answer to a normalized error; `task` completes "<provider> could not <task>".
  fail(response, { task, model = null, image = false }) {
    console.warn('AI provider error', { provider: this.label, status: response.status, task, model, detail: response.detail });
    const { status } = response;
    if (status === 401 || status === 403) {
      throw httpError(this.apiKey
        ? `${this.label} rejected the API key. Check it in Settings.`
        : `${this.label} requires an API key. Add it in Settings.`, 502);
    }
    if (status === 429) throw httpError(`${this.label} rate limit reached. Try again later.`, 503);
    if (status === 408 || status === 504) throw httpError(`${this.label} did not answer in time. Try again, or use a faster model.`, 504);
    if (image && AiProviderHttp.rejectsImage(response)) throw httpError('The selected model does not support image input.', 422);
    if (model && missingModel.test(response.detail)) {
      throw httpError(`${this.label} does not know the model "${model}". Refresh the model list or check the model ID in Settings.`, 502);
    }
    if (status === 404) {
      throw httpError(`${this.label} has no compatible API at ${this.baseUrl}. Check the base URL; it usually ends in /v1.`, 502);
    }
    throw httpError(`${this.label} could not ${task} (HTTP ${status}). Try again later.`, 502);
  }

  // A model list that the endpoint does not implement is a normal state, not a broken provider.
  failModelList(response) {
    if ([404, 405, 501].includes(response.status)) {
      console.warn('AI provider model list unsupported', { provider: this.label, status: response.status });
      throw Object.assign(httpError(`${this.label} does not support listing models at this base URL. Enter the model ID manually.`, 502), { listUnsupported: true });
    }
    this.fail(response, { task: 'load the model list' });
  }
}
