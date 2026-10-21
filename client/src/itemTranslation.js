import { TRANSLATABLE_CORE_FIELDS, TRANSLATION_LIMITS } from '../../shared/translationFields.js';

/*
  Translate Item with AI: the candidate texts of the unsaved item form and the bounds of the one
  request that translates them. Only text fields that hold text are offered, as the translation API
  names them: a core key or `field:<id>` for a custom text field of the form's current category.
  Everything else of the item — category, codes, dates, price, condition, status, photos — is never
  a candidate.
*/
const CORE_LABELS = {
  name: 'items.fields.name',
  description: 'items.fields.description',
  condition_notes: 'items.fields.conditionNotes',
  location: 'items.fields.location',
  location_detail: 'items.fields.locationDetail',
  transferred_to: 'items.fields.transferredTo'
};
const LEADING = ['name', 'description', 'condition_notes'];
const TRAILING = ['location', 'location_detail', 'transferred_to'];

/*
  Custom fields whose name says they hold a brand, a model, or a product code, in English or
  Ukrainian, and values that are a single code (WM-FX195) or carry no words at all. They are offered
  but start unselected, so an identifier is translated only when the user asks for it.
*/
const IDENTIFIER_NAME = /\b(?:brand|make|model|sku|mpn|gtin|ean|upc|isbn|asin|serial|part\s*(?:no|number|#)|barcode|article)\b|бренд|марка|модель|артикул|серійн|штрих/iu;
const looksLikeCode = text => !/\p{L}{2,}/u.test(text) || (!/\s/.test(text) && /\d/.test(text));

const customId = key => (key.startsWith('field:') ? key.slice('field:'.length) : null);

// The form's current value of a translation key.
export const formValue = (form, key) => String((customId(key) ? form.field_values[customId(key)] : form[key]) ?? '');

/*
  The rows of the selection step, in form order. `selected` is the default choice: the item's own
  texts are on, places and people (`explicitOnly`) and identifier-like custom values are off, and a
  text over its field's limit cannot be chosen at all.
*/
export function translationCandidates(form, fields, t) {
  const row = (key, label, maxLength, { explicitOnly = false, identifier = false } = {}) => {
    const text = formValue(form, key).trim();
    if (!text) return null;
    const tooLong = text.length > maxLength;
    const note = tooLong ? 'tooLong' : explicitOnly ? 'place' : identifier ? 'identifier' : null;
    return { key, label, text, maxLength, note, disabled: tooLong, selected: !note };
  };
  const core = key => row(key, t(CORE_LABELS[key]), TRANSLATABLE_CORE_FIELDS[key].maxLength, TRANSLATABLE_CORE_FIELDS[key]);
  const custom = fields.filter(field => field.type === 'text').map(field => {
    const text = formValue(form, `field:${field.id}`).trim();
    return row(`field:${field.id}`, field.name, TRANSLATION_LIMITS.text, { identifier: IDENTIFIER_NAME.test(field.name) || looksLikeCode(text) });
  });
  return [...LEADING.map(core), ...custom, ...TRAILING.map(core)].filter(Boolean);
}

// Why the chosen rows cannot go out as one request, as an error { code, params }, or null.
export function selectionProblem(rows) {
  if (rows.length > TRANSLATION_LIMITS.fields) return { code: 'TRANSLATION_TOO_MANY_FIELDS', params: { max: TRANSLATION_LIMITS.fields } };
  if (rows.reduce((total, row) => total + row.text.length, 0) > TRANSLATION_LIMITS.totalText) {
    return { code: 'TRANSLATION_REQUEST_TOO_LARGE', params: { max: TRANSLATION_LIMITS.totalText } };
  }
  return null;
}

// Applies approved translations, by key, to the form; nothing else in it changes.
export function applyTranslations(form, translations) {
  for (const [key, text] of Object.entries(translations)) {
    if (customId(key)) form.field_values[customId(key)] = text;
    else form[key] = text;
  }
}
