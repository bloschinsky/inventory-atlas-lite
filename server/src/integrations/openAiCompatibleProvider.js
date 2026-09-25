import { httpError } from '../httpError.js';
import { AiProviderHttp } from './aiProviderHttp.js';

// A capability is known only when the endpoint publishes it (OpenRouter does); otherwise null.
function listedCapability(values, ...names) {
  return Array.isArray(values) ? names.some(name => values.includes(name)) : null;
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) return message.content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('');
  return '';
}

// Models without native structured output often wrap the JSON in a code fence or a sentence.
export function parseJsonText(text) {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(unfenced); } catch { /* Fall back to the outermost object. */ }
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object found.');
  return JSON.parse(unfenced.slice(start, end + 1));
}

/*
  The adapter for every OpenAI-compatible endpoint: OpenRouter, Ollama, LM Studio, and custom
  servers. It uses only the broadly implemented /models and /chat/completions endpoints. Structured
  output is requested with the JSON-schema response format where it may work, the schema is also
  stated in the prompt, and the answer is always validated again by the calling service.
*/
export class OpenAiCompatibleProvider {
  constructor(connection) {
    this.label = connection.label;
    this.http = new AiProviderHttp(connection);
  }

  async listModels() {
    const response = await this.http.send('models', { timeoutMs: 15_000 });
    if (!response.ok) this.http.failModelList(response);
    const listed = Array.isArray(response.body?.data) ? response.body.data : (Array.isArray(response.body?.models) ? response.body.models : null);
    if (!listed) throw httpError(502, 'AI_INVALID_MODEL_LIST', { provider: this.label });
    const models = new Map();
    for (const model of listed) {
      const id = typeof model?.id === 'string' ? model.id.trim() : '';
      if (!id || models.has(id)) continue;
      models.set(id, {
        id,
        label: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : id,
        imageInput: listedCapability(model.architecture?.input_modalities, 'image'),
        structuredOutput: listedCapability(model.supported_parameters, 'structured_outputs', 'response_format')
      });
    }
    return [...models.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  // Unknown capabilities stay null: the request is attempted and a refusal is reported clearly.
  async modelCapabilities(model) {
    try {
      const listed = (await this.listModels()).find(candidate => candidate.id === model);
      return { imageInput: listed?.imageInput ?? null, structuredOutput: listed?.structuredOutput ?? null };
    } catch {
      return { imageInput: null, structuredOutput: null };
    }
  }

  async generateStructuredData({ model, instructions, input, image, schemaName, schema, task, structuredOutput = null }) {
    const content = image
      ? [{ type: 'text', text: input }, { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}` } }]
      : input;
    const body = {
      model,
      messages: [
        { role: 'system', content: `${instructions}\nRespond with one JSON object only, without commentary, that matches this JSON Schema:\n${JSON.stringify(schema)}` },
        { role: 'user', content }
      ],
      stream: false
    };
    const request = format => this.http.send('chat/completions', {
      timeoutMs: 120_000,
      body: format ? { ...body, response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } } } : body
    });

    let response = await request(structuredOutput !== false);
    // Endpoints without the JSON-schema response format usually reject it with a 400; the prompt
    // alone still asks for JSON, so the request is repeated once without it.
    if (!response.ok && structuredOutput !== false && [400, 422].includes(response.status) &&
        !(image && AiProviderHttp.rejectsImage(response))) {
      response = await request(false);
    }
    if (!response.ok) this.http.fail(response, { task, model, image: Boolean(image) });

    const text = messageText(response.body?.choices?.[0]?.message);
    if (!text.trim()) throw httpError(502, 'AI_NO_RESULT', { provider: this.label });
    try {
      return { data: parseJsonText(text), usage: response.body.usage || null };
    } catch {
      throw httpError(502, 'AI_INVALID_RESPONSE');
    }
  }
}
