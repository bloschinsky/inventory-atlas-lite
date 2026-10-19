import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import uk from './locales/uk.json';
import * as core from './core.js';

export { SUPPORTED_LOCALES } from './core.js';

/*
  The interface language is a preference of this browser only, in the same style as theme.js: it is
  kept in localStorage and never sent to the server. Without a saved choice the interface is English.

  The public demo takes its language from its address instead, so a shared link always opens in the
  language it names: the demo is published once per locale (demo/, uk/demo/, see landing/publicPages.js),
  each shell names its language in <html lang>, and an older ?lang= link is an explicit choice over it.
*/
const readStoredLocale = () => {
  try {
    return localStorage.getItem(core.LOCALE_STORAGE_KEY);
  } catch {
    return null; // Storage can be blocked; the default language still works.
  }
};
const readDemoLocale = () => [new URLSearchParams(window.location.search).get('lang'), document.documentElement.lang];

export const i18n = createI18n(core.createI18nOptions({
  locale: core.pickLocale(...(__DEMO__ ? readDemoLocale() : [readStoredLocale()])),
  messages: { en, uk },
  warn: import.meta.env.DEV
}));

const locale = i18n.global.locale;
document.documentElement.lang = locale.value;

/*
  The demo address names the shown language, so a reload or a copied link opens it again: the address
  of the demo shell in that language (its hreflang link), keeping the #/route. A ?lang= link moves to
  it too. Without such a link (the development server) or on another origin, ?lang= names it instead.
*/
function showDemoLocaleInAddress() {
  const url = new URL(window.location.href);
  const shell = document.querySelector(`link[rel="alternate"][hreflang="${locale.value}"]`);
  const target = shell && new URL(shell.href);
  if (target?.origin === url.origin) {
    target.hash = url.hash;
    window.history.replaceState(window.history.state, '', target);
  } else {
    url.searchParams.set('lang', locale.value);
    window.history.replaceState(window.history.state, '', url);
  }
}
if (__DEMO__) {
  if (new URLSearchParams(window.location.search).has('lang')) showDemoLocaleInAddress();
  // Back and Forward can return to an entry made before a language change (closing Settings does).
  window.addEventListener('popstate', showDemoLocaleInAddress);
}

// Applied at once: every translated text and formatted value follows without a page reload.
export function setLocale(value) {
  locale.value = core.resolveLocale(value);
  document.documentElement.lang = locale.value;
  try {
    localStorage.setItem(core.LOCALE_STORAGE_KEY, locale.value);
  } catch {
    // A blocked storage only costs the persistence, not the switch itself.
  }
  if (__DEMO__) showDemoLocaleInAddress();
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
