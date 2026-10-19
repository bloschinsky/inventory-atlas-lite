import { createI18n } from 'vue-i18n';
import { createI18nOptions, pickLocale } from '../../client/src/i18n/core.js';
import en from './locales/en.json';
import uk from './locales/uk.json';

/*
  The landing language. The page has its own messages (./locales/), but the locale rules are the
  application's (client/src/i18n/core.js): the same locale codes, language names, English default and
  fallback. Every public page is published once per locale (../publicPages.js), and the shell names its
  language in <html lang>, with its title and sharing metadata already in that language. So the address
  is the language: a shared /uk/ link always opens in Ukrainian and / in English, whatever this browser
  chose before. The saved interface language (inventory-atlas.locale) belongs to the application; the
  landing and the guide neither read nor write it, and the public demo only writes it from Settings.
*/
export const pageLocale = pickLocale(document.documentElement.lang);

export const i18n = createI18n(createI18nOptions({ locale: pageLocale, messages: { en, uk }, warn: import.meta.env.DEV }));
