import { COLOR_PRESETS, customColor, encodeColor, normalizeHex, presetColor } from './colors.js';
import { validateFieldValue } from './itemValidation.js';

/*
  Deterministic matching of the attributes found on a product page to the existing custom fields of
  one category, shared by the server preview and the review dialog (which matches again when the
  user picks another category). A field matches an attribute of the same name or of a known alias
  (Brand and Manufacturer, Color and Colour, ...). The value must convert cleanly to the field's type
  and pass the same validation as a saved item; a value that does not, or several different values
  for one field, leave the field unmatched. Nothing here creates a field or guesses a value.
*/
const ALIASES = [
  ['brand', 'manufacturer', 'make', 'maker', 'бренд', 'виробник', 'марка', 'торгова марка'],
  ['model', 'model number', 'model name', 'model no', 'модель'],
  ['sku', 'article', 'article number', 'item number', 'артикул', 'код товару'],
  ['mpn', 'manufacturer part number', 'part number'],
  ['gtin', 'ean', 'upc', 'barcode', 'isbn', 'штрихкод'],
  ['color', 'colour', 'колір'],
  ['material', 'матеріал'],
  ['weight', 'вага'],
  ['size', 'розмір']
];

const COLOR_NAMES = {
  black: 'black', white: 'white', gray: 'gray', grey: 'gray', silver: 'gray', brown: 'brown', beige: 'beige', red: 'red',
  orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', navy: 'blue', purple: 'purple', violet: 'purple', pink: 'pink',
  'чорний': 'black', 'білий': 'white', 'сірий': 'gray', 'коричневий': 'brown', 'бежевий': 'beige', 'червоний': 'red',
  'помаранчевий': 'orange', 'жовтий': 'yellow', 'зелений': 'green', 'синій': 'blue', 'блакитний': 'blue', 'фіолетовий': 'purple',
  'рожевий': 'pink'
};
const presetKeys = new Set(COLOR_PRESETS.map(preset => preset.key));

const normalize = name => String(name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const aliasGroup = name => ALIASES.findIndex(group => group.includes(normalize(name)));
const sameMeaning = (attribute, field) => {
  if (normalize(attribute) === normalize(field)) return true;
  const group = aliasGroup(field);
  return group >= 0 && group === aliasGroup(attribute);
};

// The product's own identity values join its other attributes under their usual names.
export const productAttributes = (product, provenance = {}) => [
  ...[['Brand', 'brand'], ['Model', 'model'], ['SKU', 'sku'], ['MPN', 'mpn'], ['GTIN', 'gtin']]
    .filter(([, key]) => product[key])
    .map(([name, key]) => ({ name, value: product[key], source: provenance[key] })),
  ...(product.attributes ?? [])
];

function convert(type, raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let candidate = value;
  if (type === 'number') {
    if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) return null;
    candidate = value.replace(',', '.');
  } else if (type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  } else if (type === 'boolean') {
    const word = normalize(value);
    if (['yes', 'true', '1', 'так'].includes(word)) candidate = '1';
    else if (['no', 'false', '0', 'ні'].includes(word)) candidate = '0';
    else return null;
  } else if (type === 'color') {
    const hex = normalizeHex(value);
    const key = COLOR_NAMES[normalize(value)];
    if (hex) candidate = encodeColor(customColor(hex));
    else if (key && presetKeys.has(key)) candidate = encodeColor(presetColor(key));
    else return null;
  }
  try {
    return validateFieldValue(type, candidate, '');
  } catch {
    return null;
  }
}

/*
  `fields` are the category's custom fields ({ id, name, type }). Returns the matched fields with the
  attribute each came from, and the names of fields that several different values competed for.
*/
export function matchCustomFields(attributes, fields) {
  const matches = [];
  const ambiguous = [];
  for (const field of fields) {
    const found = attributes
      .filter(attribute => sameMeaning(attribute.name, field.name))
      .map(attribute => ({ attribute, value: convert(field.type, attribute.value) }))
      .filter(entry => entry.value !== null);
    const values = new Set(found.map(entry => entry.value));
    if (values.size === 1) {
      const [{ attribute, value }] = found;
      matches.push({ fieldId: field.id, name: field.name, type: field.type, value, attribute: attribute.name, source: attribute.source ?? null });
    } else if (values.size > 1) {
      ambiguous.push(field.name);
    }
  }
  return { matches, ambiguous };
}
