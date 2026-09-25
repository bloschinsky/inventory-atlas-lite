/*
  Application-level field-definition format shared by the batch editor, the API, and later
  import/export or AI generators. It describes a category field in product terms and stays
  independent of the SQLite columns used to store it.
*/

import { AppError } from './appError.js';

export const FIELD_DEFINITION_VERSION = 1;
export const MAX_BATCH_FIELDS = 50;
export const MAX_FIELD_NAME_LENGTH = 60;

// The interface shows each type through its translation key fieldTypes.<value>.
export const FIELD_TYPES = [{ value: 'text' }, { value: 'number' }, { value: 'date' }, { value: 'boolean' }];
const supportedTypes = new Set(FIELD_TYPES.map(type => type.value));

const documentProperties = ['version', 'fields'];
const fieldProperties = ['name', 'type', 'required'];

// Attributes every item already has, so a custom field may not shadow them.
export const RESERVED_FIELD_NAMES = [
  'Name', 'Description', 'Category', 'Condition', 'Location',
  'Purchase Date', 'Purchase Price', 'Serial Number', 'Photos'
];
const reservedNames = new Set(RESERVED_FIELD_NAMES.map(name => name.toLowerCase()));

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const key = name => name.trim().toLowerCase();
const refuse = (code, params) => new AppError(code, params, 400);

/*
  Structural checks only: everything a user can fix inside the preview editor is left to
  reviewFieldDefinitions so invalid rows stay visible and editable instead of failing the import.
*/
export function readFieldDefinitionDocument(document) {
  if (!isPlainObject(document)) throw refuse('FIELDS_DOCUMENT_NOT_OBJECT');
  const unknown = Object.keys(document).find(property => !documentProperties.includes(property));
  if (unknown) throw refuse('UNSUPPORTED_DOCUMENT_PROPERTY', { property: unknown, supported: documentProperties.join(', ') });
  if (document.version !== undefined && document.version !== FIELD_DEFINITION_VERSION) {
    throw refuse('UNSUPPORTED_DOCUMENT_VERSION', { version: JSON.stringify(document.version), expected: FIELD_DEFINITION_VERSION });
  }
  if (!Array.isArray(document.fields)) throw refuse('FIELDS_MISSING');
  if (!document.fields.length) throw refuse('FIELDS_NONE');
  if (document.fields.length > MAX_BATCH_FIELDS) {
    throw refuse('FIELDS_TOO_MANY', { max: MAX_BATCH_FIELDS, count: document.fields.length });
  }
  return document.fields.map((field, index) => {
    const position = index + 1;
    if (!isPlainObject(field)) throw refuse('FIELD_DEFINITION_NOT_OBJECT', { index: position });
    const unsupported = Object.keys(field).find(property => !fieldProperties.includes(property));
    if (unsupported) {
      throw refuse('FIELD_DEFINITION_UNSUPPORTED_PROPERTY', { index: position, property: unsupported, supported: fieldProperties.join(', ') });
    }
    if (field.name !== undefined && typeof field.name !== 'string') throw refuse('FIELD_DEFINITION_NAME_TYPE', { index: position });
    if (field.type !== undefined && typeof field.type !== 'string') throw refuse('FIELD_DEFINITION_TYPE_TYPE', { index: position });
    if (field.required !== undefined && typeof field.required !== 'boolean') throw refuse('FIELD_DEFINITION_REQUIRED_TYPE', { index: position });
    return { name: field.name ?? '', type: field.type ?? '', required: field.required ?? false };
  });
}

export function parseFieldDefinitionDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    // The parser's wording comes from the JavaScript engine; it is kept as diagnostic context.
    throw Object.assign(refuse('INVALID_JSON', { detail: error.message }), { cause: error });
  }
  return readFieldDefinitionDocument(document);
}

// A blocked row carries its reason as { code, params }, the same body the API refuses the batch with.
const blocked = (status, code, params = {}) => ({ status, error: { code, params } });

const reviewOne = (draft, existing, seen) => {
  const name = String(draft.name ?? '').trim();
  if (!name) return blocked('invalid', 'FIELD_NAME_REQUIRED');
  if (name.length > MAX_FIELD_NAME_LENGTH) return blocked('invalid', 'FIELD_NAME_TOO_LONG', { max: MAX_FIELD_NAME_LENGTH });
  if (reservedNames.has(key(name))) return blocked('invalid', 'FIELD_NAME_RESERVED', { name });
  if (!supportedTypes.has(draft.type)) return blocked('invalid-type', 'UNSUPPORTED_FIELD_TYPE', { type: draft.type || '—' });
  if (draft.required) return blocked('invalid', 'REQUIRED_FIELD_UNSUPPORTED', { name });
  if (existing.has(key(name))) return blocked('exists', 'FIELD_ALREADY_EXISTS', { name });
  if (seen.has(key(name))) return blocked('duplicate', 'FIELD_DUPLICATE_IN_BATCH', { name });
  return { status: 'new', error: null };
};

// Every draft keeps its own status so the preview can flag rows and recalculate after each edit.
export function reviewFieldDefinitions(drafts, existingFieldNames = []) {
  const existing = new Set(existingFieldNames.map(key));
  const seen = new Set();
  return drafts.map(draft => {
    const review = reviewOne(draft, existing, seen);
    const name = String(draft.name ?? '').trim();
    if (name) seen.add(key(name));
    return { name, type: draft.type ?? '', required: draft.required ?? false, ...review };
  });
}

export const creatableFields = rows => rows
  .filter(row => row.status === 'new')
  .map(({ name, type, required }) => ({ name, type, required }));

export const blockingRows = rows => rows.filter(row => row.status !== 'new');

export const fieldDefinitionDocument = fields => ({ version: FIELD_DEFINITION_VERSION, fields });
