import { httpError } from '../httpError.js';
import { AiProviderHttp } from './aiProviderHttp.js';
import { classifyOpenAiModels, knownOpenAiCapabilities } from './openAiModelCatalog.js';

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item.content || []) if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
  }
  return '';
}

/*
  The OpenAI adapter. It keeps OpenAI's own Responses API with strict JSON-schema output and the
  original image detail, which the generic chat-completions adapter cannot rely on elsewhere.
*/
export class OpenAiProvider {
  constructor(connection) {
    this.label = connection.label;
    this.http = new AiProviderHttp(connection);
  }

  async listModels() {
    const response = await this.http.send('models', { timeoutMs: 15_000 });
    if (!response.ok) this.http.failModelList(response);
    if (!Array.isArray(response.body?.data)) throw httpError(502, 'AI_INVALID_MODEL_LIST', { provider: this.label });
    return { models: classifyOpenAiModels(response.body.data), providerCount: response.body.data.length };
  }

  // /models publishes no capabilities, so only verified models are known; others are tried as they are.
  async modelCapabilities(model) {
    return knownOpenAiCapabilities(model);
  }

  async generateStructuredData({ model, instructions, input, image, schemaName, schema, task }) {
    const content = [{ type: 'input_text', text: input }];
    if (image) content.push({ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`, detail: 'original' });
    const response = await this.http.send('responses', {
      timeoutMs: 45_000,
      body: {
        model,
        store: false,
        instructions,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } }
      }
    });
    if (!response.ok) this.http.fail(response, { task, model, image: Boolean(image) });
    const text = outputText(response.body);
    if (!text) throw httpError(502, 'AI_NO_RESULT', { provider: this.label });
    try {
      return { data: JSON.parse(text), usage: response.body.usage || null };
    } catch {
      throw httpError(502, 'AI_INVALID_RESPONSE');
    }
  }
}
