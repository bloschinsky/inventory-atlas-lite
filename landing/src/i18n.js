import { watch } from 'vue';
import { createI18n } from 'vue-i18n';
import { LOCALE_STORAGE_KEY, createI18nOptions, pickLocale } from '../../client/src/i18n/core.js';
import en from './locales/en.json';
import uk from './locales/uk.json';

/*
  The landing language. The page has its own messages (./locales/), but the locale rules are the
  application's (client/src/i18n/core.js): the same locale codes, language names, English default and
  fallback, and the same browser preference key, so the choice made here also opens the demo, which
  is published on the same origin, in that language.
*/
const readStoredLocale = () => {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null; // Storage can be blocked; the default language still works.
  }
};

export const i18n = createI18n(createI18nOptions({ locale: pickLocale(readStoredLocale()), messages: { en, uk }, warn: import.meta.env.DEV }));
const { locale, t } = i18n.global;

// Applied at once, without a reload; a blocked storage only costs the persistence.
export function setLocale(value) {
  locale.value = pickLocale(value);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale.value);
  } catch {
    // The page still switches.
  }
}

/*
  The document language, title, and sharing descriptions follow the page language. Each page has its
  own metadata messages: `meta` for the product page, `guide.meta` for the user guide.
*/
const setMeta = (selector, value) => document.querySelector(selector)?.setAttribute('content', value);
export function followLocale(meta) {
  watch(locale, value => {
    document.documentElement.lang = value;
    document.title = t(`${meta}.title`);
    setMeta('meta[name="description"]', t(`${meta}.description`));
    setMeta('meta[property="og:title"]', t(`${meta}.ogTitle`));
    setMeta('meta[property="og:description"]', t(`${meta}.ogDescription`));
    setMeta('meta[property="og:image:alt"]', t(`${meta}.ogImageAlt`));
  }, { immediate: true });
}
