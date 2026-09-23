/*
  Canonical item input rules. The server applies them to every create and update; the batch import
  preview runs the same functions in the browser so its inline errors match what the API enforces.
  They stay plain functions: there is no state, no dependency, and nothing to substitute.
*/

// Refusals carry the HTTP status the API answers with, exactly like the server's httpError.
const invalid = message => Object.assign(new Error(message), { status: 400 });

const currencyCodes = new Set(Intl.supportedValuesOf('currency'));

const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${label} is required.`);
  return value.trim();
};

export const nullableText = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const validatePurchaseDate = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw invalid('Purchase date must be a valid date.');
  const date = value.trim();
  if (!date) return null;
  if (!isIsoDate(date)) throw invalid('Purchase date must be a valid date.');
  return date;
};

export const validatePurchasePrice = value => {
  if (value === null || value === undefined) return { amount: null, currency: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalid('Purchase price must contain an amount and currency.');
  }
  const amount = value.amount === null || value.amount === undefined ? '' : String(value.amount).trim();
  if (!amount) return { amount: null, currency: null };
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(amount)) {
    throw invalid('Purchase price amount must be a non-negative decimal with up to four decimal places.');
  }
  const currency = typeof value.currency === 'string' ? value.currency.trim().toUpperCase() : '';
  if (!currencyCodes.has(currency)) {
    throw invalid('Purchase price currency must be a valid ISO 4217 code.');
  }
  return { amount, currency };
};

// Optional single-line text with the 255-character limit of the short base fields.
const shortText = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > 255) throw invalid(`${label} must be 255 characters or fewer.`);
  return text;
};

export const validateSerialNumber = value => shortText(value, 'Serial number');

export const validateTransferredTo = value => shortText(value, 'Transferred To');

const trueValues = ['true', true, 1, '1'];
const booleanValues = [...trueValues, 'false', false, 0, '0'];
const isNumeric = raw => (typeof raw === 'number' && Number.isFinite(raw))
  || (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));

// A custom field value as it is stored: text, with booleans normalized to "1" or "0". Empty is null.
export const validateFieldValue = (type, raw, label) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  if (type === 'number' && !isNumeric(raw)) throw invalid(`${label} must be a number.`);
  if (type === 'date' && (typeof raw !== 'string' || !isIsoDate(raw.trim()))) throw invalid(`${label} must be a valid date.`);
  if (type === 'boolean' && !booleanValues.includes(raw)) throw invalid(`${label} must be a boolean.`);
  if (type === 'boolean') return trueValues.includes(raw) ? '1' : '0';
  return type === 'date' ? raw.trim() : String(raw);
};
