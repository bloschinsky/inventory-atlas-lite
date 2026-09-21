/*
  Application-level field-definition format shared by the batch editor, the API, and later
  import/export or AI generators. It describes a category field in product terms and stays
  independent of the SQLite columns used to store it.
*/

export const FIELD_DEFINITION_VERSION = 1;
export const MAX_BATCH_FIELDS = 50;
export const MAX_FIELD_NAME_LENGTH = 60;

export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' }
];
const supportedTypes = new Set(FIELD_TYPES.map(type => type.value));
export const fieldTypeLabel = value => FIELD_TYPES.find(type => type.value === value)?.label || value;

const documentProperties = ['version', 'fields'];
const fieldProperties = ['name', 'type', 'required'];

// Attributes every item already has, so a custom field may not shadow them.
export const RESERVED_FIELD_NAMES = [
  'Name', 'Description', 'Category', 'Condition', 'Location',
  'Purchase Date', 'Purchase Price', 'Serial Number', 'Photos'
];
const reservedNames = new Set(RESERVED_FIELD_NAMES.map(name => name.toLowerCase()));

export const STATUS_LABELS = {
  new: 'New',
  exists: 'Already exists',
  duplicate: 'Duplicate in batch',
  'invalid-type': 'Invalid type',
  invalid: 'Invalid configuration'
};

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const key = name => name.trim().toLowerCase();

/*
  Structural checks only: everything a user can fix inside the preview editor is left to
  reviewFieldDefinitions so invalid rows stay visible and editable instead of failing the import.
*/
export function readFieldDefinitionDocument(document) {
  if (!isPlainObject(document)) throw new Error('The document must be a JSON object with a "fields" array.');
  const unknown = Object.keys(document).find(property => !documentProperties.includes(property));
  if (unknown) throw new Error(`Unsupported document property "${unknown}". Supported properties: ${documentProperties.join(', ')}.`);
  if (document.version !== undefined && document.version !== FIELD_DEFINITION_VERSION) {
    throw new Error(`Unsupported document version: ${JSON.stringify(document.version)}. Expected ${FIELD_DEFINITION_VERSION}.`);
  }
  if (!Array.isArray(document.fields)) throw new Error('The document must contain a "fields" array.');
  if (!document.fields.length) throw new Error('The document does not contain any fields.');
  if (document.fields.length > MAX_BATCH_FIELDS) {
    throw new Error(`A batch accepts at most ${MAX_BATCH_FIELDS} fields; the document contains ${document.fields.length}.`);
  }
  return document.fields.map((field, index) => {
    const position = `Field ${index + 1}`;
    if (!isPlainObject(field)) throw new Error(`${position} must be a JSON object.`);
    const unsupported = Object.keys(field).find(property => !fieldProperties.includes(property));
    if (unsupported) throw new Error(`${position} has an unsupported property "${unsupported}". Supported properties: ${fieldProperties.join(', ')}.`);
    if (field.name !== undefined && typeof field.name !== 'string') throw new Error(`${position} name must be text.`);
    if (field.type !== undefined && typeof field.type !== 'string') throw new Error(`${position} type must be text.`);
    if (field.required !== undefined && typeof field.required !== 'boolean') throw new Error(`${position} "required" must be true or false.`);
    return { name: field.name ?? '', type: field.type ?? '', required: field.required ?? false };
  });
}

export function parseFieldDefinitionDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`, { cause: error });
  }
  return readFieldDefinitionDocument(document);
}

const reviewOne = (draft, existing, seen) => {
  const name = String(draft.name ?? '').trim();
  if (!name) return { status: 'invalid', message: 'Field name is required.' };
  if (name.length > MAX_FIELD_NAME_LENGTH) return { status: 'invalid', message: `Field name must be ${MAX_FIELD_NAME_LENGTH} characters or fewer.` };
  if (reservedNames.has(key(name))) return { status: 'invalid', message: `"${name}" is a built-in item attribute and cannot be a custom field.` };
  if (!supportedTypes.has(draft.type)) return { status: 'invalid-type', message: `Unsupported field type: ${draft.type || '(missing)'}.` };
  if (draft.required) return { status: 'invalid', message: `Required custom fields are not supported yet; use "required": false for "${name}".` };
  if (existing.has(key(name))) return { status: 'exists', message: `Field "${name}" already exists in this category.` };
  if (seen.has(key(name))) return { status: 'duplicate', message: `Field "${name}" appears more than once in this batch.` };
  return { status: 'new', message: '' };
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
