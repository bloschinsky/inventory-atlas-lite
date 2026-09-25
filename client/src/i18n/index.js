import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import uk from './locales/uk.json';
import * as core from './core.js';

export { SUPPORTED_LOCALES } from './core.js';

/*
  The interface language is a preference of this browser only, in the same style as theme.js: it is
  kept in localStorage and never sent to the server. Without a saved choice the interface is English.
*/
const readStoredLocale = () => {
  try {
    return localStorage.getItem(core.LOCALE_STORAGE_KEY);
  } catch {
    return null; // Storage can be blocked; the default language still works.
  }
};

export const i18n = createI18n(core.createI18nOptions({
  locale: readStoredLocale(),
  messages: { en, uk },
  warn: import.meta.env.DEV
}));

const locale = i18n.global.locale;
document.documentElement.lang = locale.value;

// Applied at once: every translated text and formatted value follows without a page reload.
export function setLocale(value) {
  locale.value = core.resolveLocale(value);
  document.documentElement.lang = locale.value;
  try {
    localStorage.setItem(core.LOCALE_STORAGE_KEY, locale.value);
  } catch {
    // A blocked storage only costs the persistence, not the switch itself.
  }
}

// Server errors and notices arrive as { code, params } and are translated in the active locale.
export const translateError = message => core.translateMessage(i18n.global, message);
export const translateNotice = message => core.translateMessage(i18n.global, message, 'notices');

// Display formatting in the active locale. Reading the locale here keeps every template that calls them reactive.
export const formatDateTime = (value, timeZone) => core.formatDateTime(value, locale.value, timeZone);
export const formatDate = value => core.formatDate(value, locale.value);
export const formatNumber = value => core.formatNumber(value, locale.value);
export const formatMoney = (amount, currency) => core.formatMoney(amount, currency, locale.value);
export const formatFileSize = bytes => core.formatFileSize(bytes, locale.value);
