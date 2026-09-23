import { httpError } from '../httpError.js';

// Pure input rules shared by the item and category use cases. They stay plain functions: there is
// no state, no dependency, and nothing to substitute.

const currencyCodes = new Set(Intl.supportedValuesOf('currency'));

export const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw httpError(`${label} is required.`);
  return value.trim();
};

export const nullableText = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const validatePurchaseDate = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw httpError('Purchase date must be a valid date.');
  const date = value.trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw httpError('Purchase date must be a valid date.');
  }
  return date;
};

export const validatePurchasePrice = value => {
  if (value === null || value === undefined) return { amount: null, currency: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw httpError('Purchase price must contain an amount and currency.');
  }
  const amount = value.amount === null || value.amount === undefined ? '' : String(value.amount).trim();
  if (!amount) return { amount: null, currency: null };
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(amount)) {
    throw httpError('Purchase price amount must be a non-negative decimal with up to four decimal places.');
  }
  const currency = typeof value.currency === 'string' ? value.currency.trim().toUpperCase() : '';
  if (!currencyCodes.has(currency)) {
    throw httpError('Purchase price currency must be a valid ISO 4217 code.');
  }
  return { amount, currency };
};

// Optional single-line text with the 255-character limit of the short base fields.
const shortText = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw httpError(`${label} must be text.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > 255) throw httpError(`${label} must be 255 characters or fewer.`);
  return text;
};

export const validateSerialNumber = value => shortText(value, 'Serial number');

export const validateTransferredTo = value => shortText(value, 'Transferred To');
