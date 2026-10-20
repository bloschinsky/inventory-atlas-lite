/*
  The content languages of inventory values: the Preferred Content Language of a database and the
  source and target of an AI translation. They are independent of the interface locales in
  client/src/i18n/core.js: any of these can be chosen under any interface language. Every language is
  a canonical BCP 47 tag from this bounded list, so no free-form text ever reaches a prompt or the
  database. Names come from Intl.DisplayNames in whatever language they are shown in.
*/

// The compact set offered first.
export const COMMON_CONTENT_LANGUAGES = ['en', 'uk', 'es', 'de', 'pl', 'fr', 'pt-BR'];

export const CONTENT_LANGUAGES = [
  ...COMMON_CONTENT_LANGUAGES,
  'af', 'ar', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'el', 'en-GB', 'es-419', 'et', 'eu', 'fa', 'fi', 'fil',
  'fr-CA', 'ga', 'gl', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'ko', 'lt', 'lv', 'mk', 'ms', 'nb',
  'nl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'th', 'tr', 'ur', 'uz', 'vi', 'zh', 'zh-Hans', 'zh-Hant'
];

// The source of a translation that the model detects itself.
export const AUTO_DETECT = 'auto';

const MAX_TAG_LENGTH = 35;
const byLowerCase = new Map(CONTENT_LANGUAGES.map(tag => [tag.toLowerCase(), tag]));

const canonical = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_TAG_LENGTH) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0];
  } catch {
    return null;
  }
};

// The listed tag a value names, in its canonical spelling, or null.
export const normalizeContentLanguage = value => byLowerCase.get(canonical(value)?.toLowerCase()) ?? null;

/*
  The closest listed tag for a language a model reported, such as zh-CN or pt-PT, or null: an exact
  match first, then the script variant of Chinese, then the language alone.
*/
export const closestContentLanguage = value => {
  const tag = canonical(value);
  if (!tag) return null;
  const exact = normalizeContentLanguage(tag);
  if (exact) return exact;
  const locale = new Intl.Locale(tag);
  if (locale.language === 'zh') return locale.maximize().script === 'Hant' ? 'zh-Hant' : 'zh-Hans';
  return normalizeContentLanguage(locale.language);
};

// The name of a listed language in `displayLocale`, or the tag itself when the runtime has no name for it.
export const contentLanguageName = (tag, displayLocale = 'en') => {
  try {
    return new Intl.DisplayNames([displayLocale], { type: 'language' }).of(tag) || tag;
  } catch {
    return tag;
  }
};
