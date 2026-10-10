import { AppError, errorBody } from './appError.js';
import {
  requiredText, validateConditionGrade, validateFieldValue, validatePurchaseDate, validatePurchasePrice, validateSerialNumber,
  validateSourceUrl, validateTransferredTo
} from './itemValidation.js';

/*
  Application-level item import format shared by the batch editor and the API. It describes items in
  product terms: custom fields are keyed by their names, and nothing the server owns (IDs, UUIDs,
  timestamps, containment) can be expressed in it. Refusals are AppErrors whose parameters carry the
  1-based item position and the property or field concerned.
*/

export const ITEM_IMPORT_VERSION = 1;
export const MAX_BATCH_ITEMS = 100;

const documentProperties = ['version', 'category', 'items'];
const textProperties = ['name', 'conditionGrade', 'conditionNotes', 'location', 'description', 'transferredTo', 'purchaseDate', 'serialNumber', 'sourceUrl'];
/*
  `new` is the item's New flag. Version 1 documents without it stay valid: the flag is then false.
  `condition` is the legacy free-text Condition of older version 1 documents. It is still accepted and
  read as Condition Notes, never as a grade; the structured grade only comes from `conditionGrade`.
*/
const LEGACY_CONDITION = 'condition';
const itemProperties = [...textProperties, 'new', 'purchasePrice', 'customFields', LEGACY_CONDITION];
const priceProperties = ['amount', 'currency'];

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const key = name => name.trim().toLowerCase();
const refuse = (code, params) => new AppError(code, params, 400);

// Built from the category's current fields on every call, so the template can never drift from them.
export function itemImportTemplate(category, fields) {
  const blank = () => ({
    name: '',
    new: false,
    conditionGrade: null,
    conditionNotes: '',
    location: '',
    description: '',
    transferredTo: '',
    purchaseDate: null,
    purchasePrice: { amount: null, currency: 'UAH' },
    serialNumber: '',
    sourceUrl: '',
    customFields: Object.fromEntries(fields.map(field => [field.name, field.type === 'text' ? '' : null]))
  });
  return { version: ITEM_IMPORT_VERSION, category: category.name, items: [blank(), blank()] };
}

/*
  Preview values are strings bound to form controls. Booleans become the "1"/"0" the item form uses,
  and colors (a { key, hex } object or its JSON text) their canonical JSON text; anything unreadable
  is kept as text so it stays visible next to its inline error.
*/
const draftFieldValue = (type, value) => {
  if (value === null || value === undefined) return '';
  if (type !== 'boolean' && type !== 'color') return String(value);
  try {
    return validateFieldValue(type, value, '');
  } catch {
    return isPlainObject(value) ? JSON.stringify(value) : String(value);
  }
};

const readItem = (item, index, fieldsByKey) => {
  const position = index + 1;
  if (!isPlainObject(item)) throw refuse('IMPORT_ITEM_NOT_OBJECT', { index: position });
  const unsupported = Object.keys(item).find(property => !itemProperties.includes(property));
  if (unsupported) {
    throw refuse('IMPORT_ITEM_UNSUPPORTED_PROPERTY', { index: position, property: unsupported, supported: itemProperties.join(', ') });
  }
  for (const property of [...textProperties, LEGACY_CONDITION]) {
    if (item[property] !== undefined && item[property] !== null && typeof item[property] !== 'string') {
      throw refuse('IMPORT_ITEM_TEXT_EXPECTED', { index: position, property });
    }
  }
  // Two Condition Notes would leave no single value to keep, so the document has to choose one.
  if (item[LEGACY_CONDITION] && item.conditionNotes) {
    throw refuse('IMPORT_ITEM_CONDITION_CONFLICT', { index: position });
  }
  // Only a real boolean is accepted; "yes", 1, or null are refused rather than guessed.
  if (item.new !== undefined && typeof item.new !== 'boolean') {
    throw refuse('IMPORT_ITEM_BOOLEAN_EXPECTED', { index: position, property: 'new' });
  }

  const price = item.purchasePrice ?? {};
  if (!isPlainObject(price)) throw refuse('IMPORT_PRICE_NOT_OBJECT', { index: position });
  const unsupportedPrice = Object.keys(price).find(property => !priceProperties.includes(property));
  if (unsupportedPrice) {
    throw refuse('IMPORT_PRICE_UNSUPPORTED_PROPERTY', { index: position, property: unsupportedPrice, supported: priceProperties.join(', ') });
  }
  if (!['number', 'string', 'undefined'].includes(typeof price.amount) && price.amount !== null) {
    throw refuse('IMPORT_PRICE_AMOUNT_TYPE', { index: position });
  }
  if (!['string', 'undefined'].includes(typeof price.currency) && price.currency !== null) {
    throw refuse('IMPORT_PRICE_CURRENCY_TYPE', { index: position });
  }

  const values = item.customFields ?? {};
  if (!isPlainObject(values)) throw refuse('IMPORT_CUSTOM_FIELDS_NOT_OBJECT', { index: position });
  const customFields = Object.fromEntries([...fieldsByKey.values()].map(field => [field.name, '']));
  const seen = new Set();
  for (const [name, value] of Object.entries(values)) {
    const field = fieldsByKey.get(key(name));
    if (!field) {
      const known = [...fieldsByKey.values()].map(known => known.name).join(', ') || '—';
      throw refuse('IMPORT_UNKNOWN_CUSTOM_FIELD', { index: position, field: name, known });
    }
    if (seen.has(field.id)) throw refuse('IMPORT_DUPLICATE_CUSTOM_FIELD', { index: position, field: field.name });
    seen.add(field.id);
    // Only a color may be written as an object: its { key, hex } form.
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value) && !(field.type === 'color' && isPlainObject(value))) {
      throw refuse('IMPORT_CUSTOM_FIELD_VALUE_TYPE', { index: position, field: field.name });
    }
    customFields[field.name] = draftFieldValue(field.type, value);
  }

  return {
    ...Object.fromEntries(textProperties.map(property => [property, item[property] ?? ''])),
    conditionGrade: item.conditionGrade || null,
    conditionNotes: item.conditionNotes || item[LEGACY_CONDITION] || '',
    new: item.new ?? false,
    purchasePrice: {
      amount: price.amount === null || price.amount === undefined ? '' : String(price.amount),
      currency: price.currency ?? ''
    },
    customFields
  };
};

/*
  Structural checks only: value problems a user can fix in the preview are left to reviewItemDraft,
  so those drafts stay visible and editable instead of failing the whole document.
*/
export function readItemImportDocument(document, { categoryName, fields }) {
  if (!isPlainObject(document)) throw refuse('IMPORT_DOCUMENT_NOT_OBJECT');
  const unknown = Object.keys(document).find(property => !documentProperties.includes(property));
  if (unknown) throw refuse('UNSUPPORTED_DOCUMENT_PROPERTY', { property: unknown, supported: documentProperties.join(', ') });
  if (document.version === undefined) throw refuse('DOCUMENT_VERSION_MISSING', { expected: ITEM_IMPORT_VERSION });
  if (document.version !== ITEM_IMPORT_VERSION) {
    throw refuse('UNSUPPORTED_DOCUMENT_VERSION', { version: JSON.stringify(document.version), expected: ITEM_IMPORT_VERSION });
  }
  if (typeof document.category !== 'string' || !document.category.trim()) throw refuse('IMPORT_CATEGORY_MISSING');
  if (key(document.category) !== key(categoryName)) {
    throw refuse('IMPORT_CATEGORY_MISMATCH', { document: document.category.trim(), selected: categoryName });
  }
  if (!Array.isArray(document.items)) throw refuse('IMPORT_ITEMS_MISSING');
  if (!document.items.length) throw refuse('IMPORT_NO_ITEMS');
  if (document.items.length > MAX_BATCH_ITEMS) {
    throw refuse('IMPORT_TOO_MANY_ITEMS', { max: MAX_BATCH_ITEMS, count: document.items.length });
  }
  const fieldsByKey = new Map(fields.map(field => [key(field.name), field]));
  return document.items.map((item, index) => readItem(item, index, fieldsByKey));
}

export function parseItemImportDocument(text, context) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    // The parser's wording comes from the JavaScript engine; it is kept as diagnostic context.
    throw Object.assign(refuse('INVALID_JSON', { detail: error.message }), { cause: error });
  }
  return readItemImportDocument(document, context);
}

// The same document shape travels back to the API, so the server re-reads exactly what was previewed.
export const itemImportDocument = (categoryName, items) => ({ version: ITEM_IMPORT_VERSION, category: categoryName, items });

const check = (errors, property, work) => {
  try {
    work();
  } catch (error) {
    errors[property] = errorBody(error);
  }
};

// Inline errors of one draft as { code, params }, from the canonical item rules the API applies on create.
export function reviewItemDraft(draft, fields) {
  const errors = {};
  check(errors, 'name', () => requiredText(draft.name, 'ITEM_NAME_REQUIRED'));
  check(errors, 'conditionGrade', () => validateConditionGrade(draft.conditionGrade));
  check(errors, 'purchaseDate', () => validatePurchaseDate(draft.purchaseDate));
  check(errors, 'purchasePrice', () => validatePurchasePrice(draft.purchasePrice));
  check(errors, 'serialNumber', () => validateSerialNumber(draft.serialNumber));
  check(errors, 'transferredTo', () => validateTransferredTo(draft.transferredTo));
  check(errors, 'sourceUrl', () => validateSourceUrl(draft.sourceUrl));
  const fieldErrors = {};
  for (const field of fields) {
    check(fieldErrors, field.name, () => validateFieldValue(field.type, draft.customFields[field.name], field.name));
  }
  if (Object.keys(fieldErrors).length) errors.customFields = fieldErrors;
  return errors;
}

export const hasDraftErrors = errors => Object.keys(errors).length > 0;

// The item API body of one reviewed draft. Custom fields are resolved from names to their IDs here.
export const itemImportRequestBody = (draft, categoryId, fields) => ({
  name: draft.name,
  category_id: categoryId,
  description: draft.description,
  is_new: draft.new,
  condition_grade: draft.conditionGrade,
  condition_notes: draft.conditionNotes,
  location: draft.location,
  transferred_to: draft.transferredTo,
  purchase_date: draft.purchaseDate,
  purchase_price: draft.purchasePrice,
  serial_number: draft.serialNumber,
  source_url: draft.sourceUrl,
  field_values: Object.fromEntries(fields.map(field => [field.id, draft.customFields[field.name]]))
});

