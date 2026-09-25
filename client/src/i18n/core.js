/*
  The locale rules of the interface without any browser or bundler dependency, so the Node.js tests
  exercise exactly what the client runs: the supported locales, the vue-i18n options, and the
  display formatting of dates, numbers, money, and file sizes. Stored values and API formats never
  pass through here; only what is shown on screen does.
*/
export const DEFAULT_LOCALE = 'en';
export const LOCALE_STORAGE_KEY = 'inventory-atlas.locale';

// Language names are always written in their own language, so each one stays recognizable.
export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' }
];

export const resolveLocale = value => (SUPPORTED_LOCALES.some(locale => locale.code === value) ? value : DEFAULT_LOCALE);

// Ukrainian messages list their plural forms as "one | few | many", in the order CLDR names them.
const UKRAINIAN_FORMS = { one: 0, few: 1, many: 2, other: 1 };
const ukrainianRules = new Intl.PluralRules('uk');
export const ukrainianPlural = (choice, choicesLength) =>
  Math.min(UKRAINIAN_FORMS[ukrainianRules.select(Math.abs(choice))], choicesLength - 1);

/*
  English is both the default and the fallback: a key missing from another locale renders its
  English text instead of an empty string, and development builds warn about it.
*/
export const createI18nOptions = ({ locale, messages, warn = false }) => ({
  legacy: false,
  locale: resolveLocale(locale),
  fallbackLocale: DEFAULT_LOCALE,
  messages,
  pluralRules: { uk: ukrainianPlural },
  missingWarn: warn,
  fallbackWarn: warn
});

// SQLite stores timestamps as "YYYY-MM-DD HH:MM:SS" in UTC; ISO strings and epoch numbers pass through.
const toDate = value => new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value);

export function formatDateTime(value, locale, timeZone) {
  if (value === null || value === undefined || value === '') return '';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone && { timeZone }) }).format(date);
}

// A calendar date such as a purchase date has no time zone: it is shown as the same day everywhere.
export function formatDate(value, locale) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export const formatNumber = (value, locale) => new Intl.NumberFormat(locale).format(value);

// Every stored decimal stays visible: 12.3456 USD is not rounded to 12.35 for display.
export function formatMoney(amount, currency, locale) {
  const value = Number(amount);
  if (amount === '' || amount === null || amount === undefined || !Number.isFinite(value)) return '';
  const decimals = String(amount).split('.')[1]?.length ?? 0;
  try {
    const standard = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions();
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: standard.minimumFractionDigits,
      maximumFractionDigits: Math.max(decimals, standard.maximumFractionDigits)
    }).format(value);
  } catch {
    // A code Intl does not know is still shown next to the amount rather than lost.
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value)} ${currency}`;
  }
}

const SIZE_UNITS = ['kilobyte', 'megabyte', 'gigabyte'];

export function formatFileSize(bytes, locale) {
  if (bytes < 1024) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte', unitDisplay: 'short' }).format(bytes);
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) { size /= 1024; unit += 1; }
  const digits = size >= 10 || unit === 0 ? 0 : 1;
  return new Intl.NumberFormat(locale, {
    style: 'unit', unit: SIZE_UNITS[unit], unitDisplay: 'short', maximumFractionDigits: digits, minimumFractionDigits: digits
  }).format(size);
}
