import { httpError } from '../httpError.js';

/*
  The only place that talks to OpenAI. Everything above it depends on these two methods and on the
  project's own error messages, never on the provider's HTTP details.
*/
export class OpenAiClient {
  // The base URL is read per request so OPENAI_BASE_URL can be pointed at a stub in tests.
  get baseUrl() {
    return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  static outputText(response) {
    if (typeof response.output_text === 'string') return response.output_text;
    for (const item of response.output || []) {
      for (const content of item.content || []) if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
    return '';
  }

  async listModels(apiKey) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw httpError('OpenAI model list timed out. Try again.', 504);
      }
      throw httpError('OpenAI model list is unavailable. Try again later.', 502);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw httpError('OpenAI rejected the API key. Check it in Settings.', 502);
      }
      if (response.status === 429) throw httpError('OpenAI rate limit reached. Try again later.', 503);
      throw httpError('OpenAI could not load the model list. Try again later.', 502);
    }

    const result = await response.json().catch(() => null);
    if (!Array.isArray(result?.data)) throw httpError('OpenAI returned an invalid model list.', 502);
    return result.data.map(model => model?.id).filter(id => typeof id === 'string');
  }

  // One place for the /responses request, its timeout, and the provider error mapping.
  async createStructuredResponse({ apiKey, body, failureMessage }) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000)
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw httpError('The AI request timed out. Try again.', 504);
      throw httpError('OpenAI is unavailable. Try again later.', 502);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw httpError('OpenAI rejected the API key. Check it in Settings.', 502);
      if (response.status === 429) throw httpError('OpenAI rate limit reached. Try again later.', 503);
      throw httpError(failureMessage, 502);
    }
    const text = OpenAiClient.outputText(result);
    if (!text) throw httpError('OpenAI returned no usable result.', 502);
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw httpError('OpenAI returned an invalid structured response.', 502); }
    return { parsed, usage: result.usage || null };
  }
}
