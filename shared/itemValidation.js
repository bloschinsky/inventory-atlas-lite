/*
  Canonical item input rules. The server applies them to every create and update; the batch import
  preview runs the same functions in the browser so its inline errors match what the API enforces.
  They stay plain functions: there is no state, no dependency, and nothing to substitute.
  Refusals are AppErrors with a stable code and the 400 status the API answers with.
*/
import { AppError } from './appError.js';

const invalid = (code, params) => new AppError(code, params, 400);

const currencyCodes = new Set(Intl.supportedValuesOf('currency'));

const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// `code` names what is missing, such as ITEM_NAME_REQUIRED.
export const requiredText = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) throw invalid(code);
  return value.trim();
};

export const nullableText = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const validatePurchaseDate = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw invalid('INVALID_PURCHASE_DATE');
  const date = value.trim();
  if (!date) return null;
  if (!isIsoDate(date)) throw invalid('INVALID_PURCHASE_DATE');
  return date;
};

export const validatePurchasePrice = value => {
  if (value === null || value === undefined) return { amount: null, currency: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('INVALID_PURCHASE_PRICE');
  }
  const amount = value.amount === null || value.amount === undefined ? '' : String(value.amount).trim();
  if (!amount) return { amount: null, currency: null };
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(amount)) {
    throw invalid('INVALID_PURCHASE_PRICE_AMOUNT');
  }
  const currency = typeof value.currency === 'string' ? value.currency.trim().toUpperCase() : '';
  if (!currencyCodes.has(currency)) {
    throw invalid('INVALID_PURCHASE_PRICE_CURRENCY');
  }
  return { amount, currency };
};

const MAX_SHORT_TEXT = 255;

// Optional single-line text with the 255-character limit of the short base fields.
const shortText = (value, codes) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw invalid(codes.invalid);
  const text = value.trim();
  if (!text) return null;
  if (text.length > MAX_SHORT_TEXT) throw invalid(codes.tooLong, { max: MAX_SHORT_TEXT });
  return text;
};

export const validateSerialNumber = value => shortText(value, { invalid: 'INVALID_SERIAL_NUMBER', tooLong: 'SERIAL_NUMBER_TOO_LONG' });

export const validateTransferredTo = value => shortText(value, { invalid: 'INVALID_TRANSFERRED_TO', tooLong: 'TRANSFERRED_TO_TOO_LONG' });

// The optional base attributes shared by items and item templates, validated the same way for both.
export const readItemDetails = body => {
  const purchaseDate = validatePurchaseDate(body.purchase_date);
  const purchasePrice = validatePurchasePrice(body.purchase_price);
  return {
    description: nullableText(body.description),
    condition: nullableText(body.condition),
    location: nullableText(body.location),
    purchaseDate,
    purchasePriceAmount: purchasePrice.amount,
    purchasePriceCurrency: purchasePrice.currency,
    serialNumber: validateSerialNumber(body.serial_number),
    transferredTo: validateTransferredTo(body.transferred_to)
  };
};

const trueValues = ['true', true, 1, '1'];
const booleanValues = [...trueValues, 'false', false, 0, '0'];
const isNumeric = raw => (typeof raw === 'number' && Number.isFinite(raw))
  || (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));

/*
  A custom field value as it is stored: text, with booleans normalized to "1" or "0". Empty is null.
  Refusals name the field, which is user data and is shown exactly as it was entered.
*/
export const validateFieldValue = (type, raw, field) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  if (type === 'number' && !isNumeric(raw)) throw invalid('INVALID_CUSTOM_FIELD_NUMBER', { field });
  if (type === 'date' && (typeof raw !== 'string' || !isIsoDate(raw.trim()))) throw invalid('INVALID_CUSTOM_FIELD_DATE', { field });
  if (type === 'boolean' && !booleanValues.includes(raw)) throw invalid('INVALID_CUSTOM_FIELD_BOOLEAN', { field });
  if (type === 'boolean') return trueValues.includes(raw) ? '1' : '0';
  return type === 'date' ? raw.trim() : String(raw);
};

// Custom field values keyed by field id, checked against `fields`, the fields of the chosen category.
export const readFieldValues = (values = {}, fields) => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw invalid('FIELD_VALUES_NOT_OBJECT');
  const allowed = new Map(fields.map(field => [String(field.id), field]));
  return Object.entries(values).map(([fieldId, raw]) => {
    const field = allowed.get(String(fieldId));
    if (!field) throw invalid('FIELD_NOT_IN_CATEGORY', { fieldId: String(fieldId) });
    return [Number(fieldId), validateFieldValue(field.type, raw, field.name)];
  });
};
