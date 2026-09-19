import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './db.js';

const settingsPath = path.join(dataDir, 'ai-settings.json');
const defaults = { enabled: false, provider: 'openai', model: 'gpt-4o-mini', apiKey: '' };
const baseFieldNames = [
  'name', 'description', 'condition', 'location', 'purchase_date',
  'purchase_price_amount', 'purchase_price_currency', 'serial_number'
];

const httpError = (message, status = 400) => Object.assign(new Error(message), { status });

export function readAiSettings() {
  if (!fs.existsSync(settingsPath)) return { ...defaults };
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  return {
    enabled: saved.enabled === true,
    provider: saved.provider === 'openai' ? saved.provider : defaults.provider,
    model: typeof saved.model === 'string' && saved.model.trim() ? saved.model.trim() : defaults.model,
    apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : ''
  };
}

export function publicAiSettings() {
  const settings = readAiSettings();
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(settings.apiKey),
    apiKeyMasked: settings.apiKey ? `••••••••${settings.apiKey.slice(-4)}` : ''
  };
}

export function writeAiSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Invalid AI settings.');
  if (typeof input.enabled !== 'boolean') throw httpError('AI enabled must be true or false.');
  if (input.provider !== 'openai') throw httpError('OpenAI is the only supported AI provider.');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.trim().length > 100) {
    throw httpError('Model is required and must be 100 characters or fewer.');
  }
  const current = readAiSettings();
  let apiKey = current.apiKey;
  if (input.clearApiKey === true) apiKey = '';
  if (input.apiKey !== undefined && input.apiKey !== '') {
    if (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.trim().length > 512) {
      throw httpError('API key is invalid.');
    }
    apiKey = input.apiKey.trim();
  }
  const settings = { enabled: input.enabled, provider: input.provider, model: input.model.trim(), apiKey };
  const temporaryPath = `${settingsPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, settingsPath);
  try { fs.chmodSync(settingsPath, 0o600); } catch { /* Windows may not apply POSIX file modes. */ }
  return publicAiSettings();
}

export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString())) return 'image/gif';
  return null;
}

const nullableString = { type: ['string', 'null'] };
function responseSchema(categories) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['categoryId', 'confidence', 'needsDetailedImageAnalysis', 'baseFields', 'dynamicFields', 'warnings'],
    properties: {
      categoryId: { type: ['integer', 'null'], enum: [null, ...categories.map(category => category.id)] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needsDetailedImageAnalysis: { type: 'boolean' },
      baseFields: {
        type: 'object',
        additionalProperties: false,
        required: baseFieldNames,
        properties: Object.fromEntries(baseFieldNames.map(name => [name, nullableString]))
      },
      dynamicFields: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['fieldId', 'value'],
          properties: {
            fieldId: { type: 'integer' },
            value: { type: ['string', 'boolean', 'null'] }
          }
        }
      },
      warnings: { type: 'array', items: { type: 'string' } }
    }
  };
}

function inventorySchema(categories, fields) {
  const byCategory = new Map(categories.map(category => [category.id, { id: category.id, name: category.name, fields: [] }]));
  for (const field of fields) byCategory.get(field.category_id)?.fields.push({ id: field.id, name: field.name, type: field.type });
  return { baseFields: baseFieldNames, categories: [...byCategory.values()] };
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
  }
  return '';
}

async function analyzeWithOpenAI({ settings, image, mimeType, hint, categories, fields }) {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const body = {
    model: settings.model,
    store: false,
    instructions: 'Create a conservative inventory draft from the image and optional hint. Use only visible facts or explicit hint details. Never invent values or technical specifications. Use null when uncertain. Choose only a supplied category and only its field IDs. Do not infer purchase data or physical location. Return JSON only.',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: JSON.stringify({ hint: hint || null, inventorySchema: inventorySchema(categories, fields) }) },
        { type: 'input_image', image_url: `data:${mimeType};base64,${image.toString('base64')}`, detail: 'low' }
      ]
    }],
    text: { format: { type: 'json_schema', name: 'inventory_item_draft', strict: true, schema: responseSchema(categories) } }
  };
  let response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw httpError('AI analysis timed out. Try again.', 504);
    throw httpError('OpenAI is unavailable. Try again later.', 502);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw httpError('OpenAI rejected the API key. Check it in Settings.', 502);
    if (response.status === 429) throw httpError('OpenAI rate limit reached. Try again later.', 503);
    throw httpError('OpenAI could not analyze the image. Try again later.', 502);
  }
  const text = outputText(result);
  if (!text) throw httpError('OpenAI returned no usable result.', 502);
  try { return { draft: JSON.parse(text), usage: result.usage || null }; } catch { throw httpError('OpenAI returned an invalid structured response.', 502); }
}

const providers = { openai: analyzeWithOpenAI };

function cleanString(value, maximum = 5000) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null;
}

function normalizeDraft(raw, categories, fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError('OpenAI returned an invalid structured response.', 502);
  const topLevelNames = ['categoryId', 'confidence', 'needsDetailedImageAnalysis', 'baseFields', 'dynamicFields', 'warnings'];
  if (Object.keys(raw).some(name => !topLevelNames.includes(name)) ||
      (raw.categoryId !== null && !Number.isInteger(raw.categoryId)) ||
      !Number.isFinite(raw.confidence) || typeof raw.needsDetailedImageAnalysis !== 'boolean' ||
      !raw.baseFields || typeof raw.baseFields !== 'object' || Array.isArray(raw.baseFields) ||
      !Array.isArray(raw.dynamicFields) || !Array.isArray(raw.warnings)) {
    throw httpError('OpenAI returned an invalid structured response.', 502);
  }
  const unknownBase = Object.keys(raw.baseFields || {}).filter(name => !baseFieldNames.includes(name));
  if (unknownBase.length) throw httpError('OpenAI returned unsupported item fields.', 502);
  if (baseFieldNames.some(name => !(name in raw.baseFields) || (raw.baseFields[name] !== null && typeof raw.baseFields[name] !== 'string'))) {
    throw httpError('OpenAI returned invalid item field values.', 502);
  }
  if (raw.dynamicFields.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).some(name => !['fieldId', 'value'].includes(name)) || !Number.isInteger(entry.fieldId) ||
      (!['string', 'boolean'].includes(typeof entry.value) && entry.value !== null)) ||
      raw.warnings.some(value => typeof value !== 'string')) {
    throw httpError('OpenAI returned invalid dynamic field values.', 502);
  }
  const category = categories.find(candidate => candidate.id === raw.categoryId) || null;
  const allowedFields = new Map(fields.filter(field => category && field.category_id === category.id).map(field => [field.id, field]));
  const dynamicFields = {};
  for (const entry of Array.isArray(raw.dynamicFields) ? raw.dynamicFields : []) {
    const field = allowedFields.get(entry?.fieldId);
    if (!field || entry.value === null || entry.value === '') continue;
    if (field.type === 'boolean') {
      if (typeof entry.value !== 'boolean') continue;
      dynamicFields[field.id] = entry.value ? '1' : '0';
    } else if (field.type === 'number') {
      if (!Number.isFinite(Number(entry.value))) continue;
      dynamicFields[field.id] = String(entry.value);
    } else if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.value))) continue;
      dynamicFields[field.id] = String(entry.value);
    } else dynamicFields[field.id] = String(entry.value).trim().slice(0, 5000);
  }
  const source = raw.baseFields && typeof raw.baseFields === 'object' ? raw.baseFields : {};
  const purchaseAmount = /^\d{1,12}(?:\.\d{1,4})?$/.test(source.purchase_price_amount || '') ? source.purchase_price_amount : null;
  const currency = typeof source.purchase_price_currency === 'string' ? source.purchase_price_currency.toUpperCase() : null;
  const baseFields = {
    name: cleanString(source.name, 255),
    description: cleanString(source.description),
    condition: cleanString(source.condition, 255),
    location: cleanString(source.location, 255),
    purchase_date: /^\d{4}-\d{2}-\d{2}$/.test(source.purchase_date || '') ? source.purchase_date : null,
    purchase_price: purchaseAmount && currency && Intl.supportedValuesOf('currency').includes(currency) ? { amount: purchaseAmount, currency } : null,
    serial_number: cleanString(source.serial_number, 255)
  };
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter(value => typeof value === 'string').map(value => value.slice(0, 500)) : [];
  const usable = category || Object.values(baseFields).some(Boolean) || Object.keys(dynamicFields).length;
  if (!usable) throw httpError('AI analysis found no usable item details. Try another image or add a hint.', 422);
  return {
    categoryId: category?.id ?? null,
    confidence: Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : null,
    needsDetailedImageAnalysis: raw.needsDetailedImageAnalysis === true,
    baseFields,
    dynamicFields,
    warnings
  };
}

export async function analyzeInventoryItem({ image, mimeType, hint, categories, fields }) {
  const settings = readAiSettings();
  if (!settings.enabled) throw httpError('AI features are disabled. Enable them in Settings.', 409);
  if (!settings.apiKey) throw httpError('Add an OpenAI API key in Settings before analyzing an item.', 409);
  if (!categories.length) throw httpError('Create at least one category before using AI Add Item.', 409);
  const provider = providers[settings.provider];
  if (!provider) throw httpError('The configured AI provider is not supported.', 409);
  const started = Date.now();
  try {
    const result = await provider({ settings, image, mimeType, hint, categories, fields });
    const normalized = normalizeDraft(result.draft, categories, fields);
    console.info('AI item analysis', { provider: settings.provider, model: settings.model, durationMs: Date.now() - started, success: true, usage: result.usage });
    return normalized;
  } catch (error) {
    console.info('AI item analysis', { provider: settings.provider, model: settings.model, durationMs: Date.now() - started, success: false });
    throw error;
  }
}
