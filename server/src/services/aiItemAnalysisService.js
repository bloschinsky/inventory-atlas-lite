import { httpError } from '../httpError.js';
import { detectImageMime } from '../imageMime.js';

const baseFieldNames = [
  'name', 'description', 'condition', 'location', 'purchase_date',
  'purchase_price_amount', 'purchase_price_currency', 'serial_number'
];
const nullableString = { type: ['string', 'null'] };

function responseSchema(categories) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['observedMarkings', 'categoryId', 'confidence', 'needsDetailedImageAnalysis', 'baseFields', 'dynamicFields', 'warnings'],
    properties: {
      observedMarkings: { type: 'array', items: { type: 'string' } },
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

// The inventory the model may choose from: the categories and the fields of each one.
function inventorySchema(categories, fields) {
  const byCategory = new Map(categories.map(category => [category.id, { id: category.id, name: category.name, fields: [] }]));
  for (const field of fields) byCategory.get(field.category_id)?.fields.push({ id: field.id, name: field.name, type: field.type });
  return { baseFields: baseFieldNames, categories: [...byCategory.values()] };
}

const instructions = `Create a conservative inventory draft from the image and optional hint.
First record important visible branding, product labels, model numbers, part numbers, and serial numbers in observedMarkings, preserving their useful wording.
For name, use the most specific commercial product name that can be reliably identified from the image and user hint. Prioritize exact product branding, family names, and model names visibly printed on the item. Visible printed text is direct evidence, not speculation. Do not replace a specific visible product name with a generic item type.
Distinguish the commercial product name from model numbers, part numbers, serial numbers, and generic item types. If a specific product name is visible, use it in name. Use observedMarkings when mapping name, model or part number fields, serial number, and other supported fields.
Use only visible facts or explicit hint details. Never invent unsupported values or hidden technical specifications. Use null when a value is unknown. Choose only a supplied category and only its field IDs. Do not infer purchase data or physical location. Return JSON only.`;

function cleanString(value, maximum = 5000) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null;
}

/*
  The model output is untrusted input: its shape is verified, unknown categories and fields are
  dropped, and every value is normalized to what the item form can actually accept.
*/
function normalizeDraft(raw, categories, fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError('OpenAI returned an invalid structured response.', 502);
  const topLevelNames = ['observedMarkings', 'categoryId', 'confidence', 'needsDetailedImageAnalysis', 'baseFields', 'dynamicFields', 'warnings'];
  if (Object.keys(raw).some(name => !topLevelNames.includes(name)) ||
      (raw.categoryId !== null && !Number.isInteger(raw.categoryId)) ||
      !Number.isFinite(raw.confidence) || typeof raw.needsDetailedImageAnalysis !== 'boolean' ||
      !Array.isArray(raw.observedMarkings) || raw.observedMarkings.some(value => typeof value !== 'string') ||
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

export class AiItemAnalysisService {
  constructor({ aiSettingsService, openAiClient, categoryRepository, customFieldRepository }) {
    this.settingsService = aiSettingsService;
    this.openAiClient = openAiClient;
    this.categories = categoryRepository;
    this.fields = customFieldRepository;
  }

  // `upload` is the multer file of the submitted image; only its bytes and declared type are used.
  async analyze(upload, rawHint) {
    if (!upload) throw httpError('Choose an image to analyze.');
    const mimeType = detectImageMime(upload.buffer);
    if (!mimeType || mimeType !== upload.mimetype) {
      throw httpError('The uploaded file is not a valid JPEG, PNG, WebP, or GIF image.');
    }
    const hint = typeof rawHint === 'string' ? rawHint.trim() : '';
    if (hint.length > 2000) throw httpError('The description must be 2,000 characters or fewer.');

    const settings = this.settingsService.requireUsableSettings('Add an OpenAI API key in Settings before analyzing an item.');
    const categories = this.categories.listNames();
    if (!categories.length) throw httpError('Create at least one category before using AI Add Item.', 409);
    const fields = this.fields.listAll();

    const started = Date.now();
    try {
      const { parsed, usage } = await this.openAiClient.createStructuredResponse({
        apiKey: settings.apiKey,
        body: this.requestBody({ settings, image: upload.buffer, mimeType, hint, categories, fields }),
        failureMessage: 'OpenAI could not analyze the image. Try again later.'
      });
      const normalized = normalizeDraft(parsed, categories, fields);
      console.info('AI item analysis', { provider: settings.provider, model: settings.model, durationMs: Date.now() - started, success: true, usage });
      return normalized;
    } catch (error) {
      console.info('AI item analysis', { provider: settings.provider, model: settings.model, durationMs: Date.now() - started, success: false });
      throw error;
    }
  }

  requestBody({ settings, image, mimeType, hint, categories, fields }) {
    return {
      model: settings.model,
      store: false,
      instructions,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: JSON.stringify({ hint: hint || null, inventorySchema: inventorySchema(categories, fields) }) },
          { type: 'input_image', image_url: `data:${mimeType};base64,${image.toString('base64')}`, detail: 'original' }
        ]
      }],
      text: { format: { type: 'json_schema', name: 'inventory_item_draft', strict: true, schema: responseSchema(categories) } }
    };
  }
}
