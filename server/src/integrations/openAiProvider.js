import { httpError } from '../httpError.js';
import { AiProviderHttp } from './aiProviderHttp.js';

// Only the models this application is known to work with are offered, and only when the account
// actually has access to them. All of them accept images.
const preferredModels = [
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }
];

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
    const availableIds = new Set(response.body.data.map(model => model?.id));
    return preferredModels.filter(model => availableIds.has(model.id)).map(model => ({ ...model, imageInput: true }));
  }

  // OpenAI models used here all read images, and structured outputs are a documented API feature.
  async modelCapabilities() {
    return { imageInput: true };
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
