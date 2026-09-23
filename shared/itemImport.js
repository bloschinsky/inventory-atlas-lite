import {
  requiredText, validateFieldValue, validatePurchaseDate, validatePurchasePrice, validateSerialNumber,
  validateTransferredTo
} from './itemValidation.js';

/*
  Application-level item import format shared by the batch editor and the API. It describes items in
  product terms: custom fields are keyed by their names, and nothing the server owns (IDs, UUIDs,
  timestamps, containment) can be expressed in it.
*/

export const ITEM_IMPORT_VERSION = 1;
export const MAX_BATCH_ITEMS = 100;

const documentProperties = ['version', 'category', 'items'];
const textProperties = ['name', 'condition', 'location', 'description', 'transferredTo', 'purchaseDate', 'serialNumber'];
const itemProperties = [...textProperties, 'purchasePrice', 'customFields'];
const priceProperties = ['amount', 'currency'];

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const key = name => name.trim().toLowerCase();
// Custom field messages name the field, both in the preview and in API errors.
export const fieldLabel = name => `Field "${name}"`;

// Built from the category's current fields on every call, so the template can never drift from them.
export function itemImportTemplate(category, fields) {
  const blank = () => ({
    name: '',
    condition: '',
    location: '',
    description: '',
    transferredTo: '',
    purchaseDate: null,
    purchasePrice: { amount: null, currency: 'UAH' },
    serialNumber: '',
    customFields: Object.fromEntries(fields.map(field => [field.name, field.type === 'text' ? '' : null]))
  });
  return { version: ITEM_IMPORT_VERSION, category: category.name, items: [blank(), blank()] };
}

// Preview values are strings bound to form controls. Booleans become the "1"/"0" the item form uses;
// anything unreadable is kept as text so it stays visible next to its inline error.
const draftFieldValue = (type, value) => {
  if (value === null || value === undefined) return '';
  if (type !== 'boolean') return String(value);
  try {
    return validateFieldValue(type, value, '');
  } catch {
    return String(value);
  }
};

const readItem = (item, index, fieldsByKey) => {
  const position = `Item ${index + 1}`;
  if (!isPlainObject(item)) throw new Error(`${position} must be a JSON object.`);
  const unsupported = Object.keys(item).find(property => !itemProperties.includes(property));
  if (unsupported) throw new Error(`${position} has an unsupported property "${unsupported}". Supported properties: ${itemProperties.join(', ')}.`);
  for (const property of textProperties) {
    if (item[property] !== undefined && item[property] !== null && typeof item[property] !== 'string') {
      throw new Error(`${position} "${property}" must be text or null.`);
    }
  }

  const price = item.purchasePrice ?? {};
  if (!isPlainObject(price)) throw new Error(`${position} "purchasePrice" must be an object with "amount" and "currency".`);
  const unsupportedPrice = Object.keys(price).find(property => !priceProperties.includes(property));
  if (unsupportedPrice) throw new Error(`${position} "purchasePrice" has an unsupported property "${unsupportedPrice}". Supported properties: ${priceProperties.join(', ')}.`);
  if (!['number', 'string', 'undefined'].includes(typeof price.amount) && price.amount !== null) {
    throw new Error(`${position} purchase price amount must be a number, text, or null.`);
  }
  if (!['string', 'undefined'].includes(typeof price.currency) && price.currency !== null) {
    throw new Error(`${position} purchase price currency must be text or null.`);
  }

  const values = item.customFields ?? {};
  if (!isPlainObject(values)) throw new Error(`${position} "customFields" must be an object keyed by field name.`);
  const customFields = Object.fromEntries([...fieldsByKey.values()].map(field => [field.name, '']));
  const seen = new Set();
  for (const [name, value] of Object.entries(values)) {
    const field = fieldsByKey.get(key(name));
    if (!field) {
      const known = [...fieldsByKey.values()].map(known => known.name).join(', ') || 'none';
      throw new Error(`${position} has an unknown custom field "${name}". Fields of this category: ${known}.`);
    }
    if (seen.has(field.id)) throw new Error(`${position} sets custom field "${field.name}" more than once.`);
    seen.add(field.id);
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`${position} custom field "${field.name}" must be text, a number, true/false, or null.`);
    }
    customFields[field.name] = draftFieldValue(field.type, value);
  }

  return {
    ...Object.fromEntries(textProperties.map(property => [property, item[property] ?? ''])),
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
  if (!isPlainObject(document)) throw new Error('The document must be a JSON object with "version", "category", and "items".');
  const unknown = Object.keys(document).find(property => !documentProperties.includes(property));
  if (unknown) throw new Error(`Unsupported document property "${unknown}". Supported properties: ${documentProperties.join(', ')}.`);
  if (document.version === undefined) throw new Error(`The document must declare "version": ${ITEM_IMPORT_VERSION}.`);
  if (document.version !== ITEM_IMPORT_VERSION) {
    throw new Error(`Unsupported document version: ${JSON.stringify(document.version)}. Expected ${ITEM_IMPORT_VERSION}.`);
  }
  if (typeof document.category !== 'string' || !document.category.trim()) throw new Error('The document must name its "category".');
  if (key(document.category) !== key(categoryName)) {
    throw new Error(`The document is for category "${document.category.trim()}", but "${categoryName}" is selected.`);
  }
  if (!Array.isArray(document.items)) throw new Error('The document must contain an "items" array.');
  if (!document.items.length) throw new Error('The document does not contain any items.');
  if (document.items.length > MAX_BATCH_ITEMS) {
    throw new Error(`A batch accepts at most ${MAX_BATCH_ITEMS} items; the document contains ${document.items.length}.`);
  }
  const fieldsByKey = new Map(fields.map(field => [key(field.name), field]));
  return document.items.map((item, index) => readItem(item, index, fieldsByKey));
}

export function parseItemImportDocument(text, context) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`, { cause: error });
  }
  return readItemImportDocument(document, context);
}

// The same document shape travels back to the API, so the server re-reads exactly what was previewed.
export const itemImportDocument = (categoryName, items) => ({ version: ITEM_IMPORT_VERSION, category: categoryName, items });

const check = (errors, property, work) => {
  try {
    work();
  } catch (error) {
    errors[property] = error.message;
  }
};

// Inline errors of one draft, produced by the canonical item rules the API applies on create.
export function reviewItemDraft(draft, fields) {
  const errors = {};
  check(errors, 'name', () => requiredText(draft.name, 'Item name'));
  check(errors, 'purchaseDate', () => validatePurchaseDate(draft.purchaseDate));
  check(errors, 'purchasePrice', () => validatePurchasePrice(draft.purchasePrice));
  check(errors, 'serialNumber', () => validateSerialNumber(draft.serialNumber));
  check(errors, 'transferredTo', () => validateTransferredTo(draft.transferredTo));
  const fieldErrors = {};
  for (const field of fields) {
    check(fieldErrors, field.name, () => validateFieldValue(field.type, draft.customFields[field.name], fieldLabel(field.name)));
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
  condition: draft.condition,
  location: draft.location,
  transferred_to: draft.transferredTo,
  purchase_date: draft.purchaseDate,
  purchase_price: draft.purchasePrice,
  serial_number: draft.serialNumber,
  field_values: Object.fromEntries(fields.map(field => [field.id, draft.customFields[field.name]]))
});

