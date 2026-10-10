import { httpError } from '../httpError.js';
import { detectImageMime } from '../imageMime.js';
import { CONDITION_GRADES, isConditionGrade } from '../../../shared/conditionGrades.js';
import { COLOR_PRESETS, customColor, encodeColor, normalizeHex, presetColor, readColor } from '../../../shared/colors.js';

const baseFieldNames = [
  'name', 'description', 'condition_notes', 'location', 'purchase_date',
  'purchase_price_amount', 'purchase_price_currency', 'serial_number'
];
const nullableString = { type: ['string', 'null'] };
// The New flag is the one boolean base field; it is described to the model next to the text fields.
const IS_NEW = 'is_new';
// The structured Condition: one of the fixed grade keys, or null when the evidence does not settle it.
const CONDITION_GRADE = 'condition_grade';
const extraBaseFields = [IS_NEW, CONDITION_GRADE];

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
        required: [...baseFieldNames, ...extraBaseFields],
        properties: {
          ...Object.fromEntries(baseFieldNames.map(name => [name, nullableString])),
          [IS_NEW]: { type: 'boolean' },
          [CONDITION_GRADE]: { type: ['string', 'null'], enum: [null, ...CONDITION_GRADES] }
        }
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

// The categories the model may choose from and the fields of each one: names, ids, and types only.
export function categorySchema(categories, fields) {
  const byCategory = new Map(categories.map(category => [category.id, { id: category.id, name: category.name, fields: [] }]));
  for (const field of fields) byCategory.get(field.category_id)?.fields.push({ id: field.id, name: field.name, type: field.type });
  return [...byCategory.values()];
}

// The inventory the model may choose from: the base fields, the categories, and their fields.
function inventorySchema(categories, fields) {
  return { baseFields: [...baseFieldNames, ...extraBaseFields], categories: categorySchema(categories, fields) };
}

const instructions = `Create a conservative inventory draft from the supplied evidence. The user may supply an item photo, a written description, or both; work with whatever is present.
When an image is supplied, first record important visible branding, product labels, model numbers, part numbers, and serial numbers in observedMarkings, preserving their useful wording. When no image is supplied, leave observedMarkings empty and set needsDetailedImageAnalysis to false.
For name, use the most specific commercial product name that can be reliably identified from the supplied evidence. Prioritize exact product branding, family names, and model names visibly printed on the item or explicitly stated by the user. Visible printed text is direct evidence, not speculation. Do not replace a specific visible product name with a generic item type.
Distinguish the commercial product name from model numbers, part numbers, serial numbers, and generic item types. If a specific product name is visible or stated, use it in name. Use observedMarkings when mapping name, model or part number fields, serial number, and other supported fields.
Treat facts the user states in the description and clearly readable markings in the image as supported evidence. When both sources agree, combine them. When they add different details, merge the supported facts. When they conflict, do not silently choose one: use the most strongly supported value and add a warning that names the conflict so the user can resolve it during review.
Set is_new to true only when the evidence explicitly establishes that the item is new or unused: the user says so, or readable labeling or context states it. Never infer it from a box, clean packaging, a pristine look, or the absence of visible wear; otherwise set is_new to false. Never derive is_new from the condition, or the condition from is_new.
Set condition_grade only when the evidence clearly supports one grade: excellent (works correctly, no significant damage, at most very small signs of use), good (works correctly, visible signs of normal use), fair (works, significant wear or minor defects), poor (serious defects, works only partly or needs repair), or broken (does not work correctly, needs repair or replacement). Otherwise set condition_grade to null; never guess it. Put specific details of the physical state, such as scratches, defects, wear, missing parts, or battery state, in condition_notes, and never write New, Used, or a similar lifecycle state there.
For a field of type color, return the lowercase preset name (${COLOR_PRESETS.map(preset => preset.key).join(', ')}) when the item's main color clearly belongs to that group; return an exact #RRGGBB value only when a specific shade is clearly established and no preset name fits; otherwise return null.
Use only supported facts. Never invent unsupported values, serial numbers, purchase prices, purchase dates, locations, exact model or part numbers, or hidden technical specifications. Explicit user-provided values and visible image markings may be used. Use null when a value is unknown. Choose only a supplied category and only its field IDs. Return JSON only.`;

/*
  The model may name a preset group, give an exact #RRGGBB shade, or return a full color value. A
  clear preset name maps to that preset, a valid HEX is kept as a custom color and never moved to a
  preset, and anything else (free text, an invalid HEX, or contradictory JSON) leaves the field unset.
*/
export function aiColorValue(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (COLOR_PRESETS.some(preset => preset.key === text)) return encodeColor(presetColor(text));
  if (normalizeHex(text)) return encodeColor(customColor(text));
  const color = readColor(value);
  return color ? encodeColor(color) : null;
}

export function cleanString(value, maximum = 5000) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null;
}

/*
  The model output is untrusted input: its shape is verified, unknown categories and fields are
  dropped, and every value is normalized to what the item form can actually accept.
*/
function normalizeDraft(raw, categories, fields, hasImage) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError(502, 'AI_INVALID_RESPONSE');
  const topLevelNames = ['observedMarkings', 'categoryId', 'confidence', 'needsDetailedImageAnalysis', 'baseFields', 'dynamicFields', 'warnings'];
  if (Object.keys(raw).some(name => !topLevelNames.includes(name)) ||
      (raw.categoryId !== null && !Number.isInteger(raw.categoryId)) ||
      !Number.isFinite(raw.confidence) || typeof raw.needsDetailedImageAnalysis !== 'boolean' ||
      !Array.isArray(raw.observedMarkings) || raw.observedMarkings.some(value => typeof value !== 'string') ||
      !raw.baseFields || typeof raw.baseFields !== 'object' || Array.isArray(raw.baseFields) ||
      !Array.isArray(raw.dynamicFields) || !Array.isArray(raw.warnings)) {
    throw httpError(502, 'AI_INVALID_RESPONSE');
  }
  const unknownBase = Object.keys(raw.baseFields || {}).filter(name => !extraBaseFields.includes(name) && !baseFieldNames.includes(name));
  if (unknownBase.length) throw httpError(502, 'AI_INVALID_RESPONSE');
  // A missing or null New flag is read as "not new"; any other non-boolean is a malformed response.
  if (![undefined, null, true, false].includes(raw.baseFields[IS_NEW])) throw httpError(502, 'AI_INVALID_RESPONSE');
  if (baseFieldNames.some(name => !(name in raw.baseFields) || (raw.baseFields[name] !== null && typeof raw.baseFields[name] !== 'string'))) {
    throw httpError(502, 'AI_INVALID_RESPONSE');
  }
  if (raw.dynamicFields.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).some(name => !['fieldId', 'value'].includes(name)) || !Number.isInteger(entry.fieldId) ||
      (!['string', 'boolean'].includes(typeof entry.value) && entry.value !== null)) ||
      raw.warnings.some(value => typeof value !== 'string')) {
    throw httpError(502, 'AI_INVALID_RESPONSE');
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
    } else if (field.type === 'color') {
      const color = aiColorValue(entry.value);
      if (!color) continue;
      dynamicFields[field.id] = color;
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
    condition_notes: cleanString(source.condition_notes),
    location: cleanString(source.location, 255),
    purchase_date: /^\d{4}-\d{2}-\d{2}$/.test(source.purchase_date || '') ? source.purchase_date : null,
    purchase_price: purchaseAmount && currency && Intl.supportedValuesOf('currency').includes(currency) ? { amount: purchaseAmount, currency } : null,
    serial_number: cleanString(source.serial_number, 255)
  };
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter(value => typeof value === 'string').map(value => value.slice(0, 500)) : [];
  const usable = category || Object.values(baseFields).some(Boolean) || Object.keys(dynamicFields).length;
  if (!usable) throw httpError(422, 'AI_NO_ITEM_DETAILS');
  // Only an explicit true makes the draft new; the flag alone never makes a draft usable.
  baseFields.is_new = source[IS_NEW] === true;
  // A grade outside the fixed scale is dropped rather than mapped to a near one.
  baseFields.condition_grade = isConditionGrade(source[CONDITION_GRADE]) ? source[CONDITION_GRADE] : null;
  return {
    categoryId: category?.id ?? null,
    confidence: Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : null,
    // Without an image there is nothing to inspect more closely, whatever the model claims.
    needsDetailedImageAnalysis: hasImage && raw.needsDetailedImageAnalysis === true,
    baseFields,
    dynamicFields,
    warnings
  };
}

export class AiItemAnalysisService {
  constructor({ aiProviderService, categoryRepository, customFieldRepository }) {
    this.ai = aiProviderService;
    this.categories = categoryRepository;
    this.fields = customFieldRepository;
  }

  /*
    `upload` is the multer file of the submitted image; only its bytes and declared type are used.
    A photo, a description, or both may be supplied, and at least one of them is required.
  */
  async analyze(upload, rawDescription) {
    const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
    if (!upload && !description) throw httpError(400, 'AI_ITEM_INPUT_REQUIRED');
    let mimeType = null;
    if (upload) {
      mimeType = detectImageMime(upload.buffer);
      if (!mimeType || mimeType !== upload.mimetype) {
        throw httpError(400, 'INVALID_IMAGE');
      }
    }
    if (description.length > 2000) throw httpError(400, 'DESCRIPTION_TOO_LONG', { max: 2000 });

    this.ai.assertReady();
    const categories = this.categories.listNames();
    if (!categories.length) throw httpError(409, 'AI_NO_CATEGORIES');
    const fields = this.fields.listAll();

    const { data } = await this.ai.generateStructuredData({
      purpose: 'item analysis',
      instructions,
      input: JSON.stringify({ description: description || null, inventorySchema: inventorySchema(categories, fields) }),
      image: upload ? { buffer: upload.buffer, mimeType } : null,
      schemaName: 'inventory_item_draft',
      schema: responseSchema(categories),
      task: 'create the item draft'
    });
    return normalizeDraft(data, categories, fields, Boolean(upload));
  }
}
