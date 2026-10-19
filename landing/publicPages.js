/*
  The public pages of the Pages site and their address in every supported locale: English, the
  default, keeps the original addresses, and every other locale lives under its code — /uk/,
  /uk/guide/, /uk/demo/. Each page and locale is its own static HTML file whose head carries the
  sharing metadata of that page in that language (pageHead()), so a link preview needs no script.
  The copy comes from `meta.<page>` in landing/src/locales/<locale>.json. A new locale needs its
  messages, its Open Graph locale below, and its social preview images; nothing else names a locale.
*/
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../client/src/i18n/core.js';
import { socialImagePath, socialImageSize } from './socialImages.js';

export const publicPages = { landing: '', guide: 'guide/', demo: 'demo/' };

// Open Graph names a locale with its territory.
export const ogLocales = { en: 'en_US', uk: 'uk_UA' };

const ogTypes = { landing: 'website', guide: 'article', demo: 'website' };

export const siteName = 'Inventory Atlas Lite';

// The address of a page relative to the site address, which always ends with a slash.
export const publicPagePath = (page, locale) => `${locale === DEFAULT_LOCALE ? '' : `${locale}/`}${publicPages[page]}`;
export const publicPageUrl = (site, page, locale) => new URL(publicPagePath(page, locale), site).href;

const escape = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

/*
  The head of one page in one locale: title, description, canonical address, the address of every
  translation (with English as x-default), Open Graph, and the large-image card of X/Twitter.
  Every address is absolute under the site address, which can be a Pages project path.
*/
export function pageHead({ site, page, locale, meta }) {
  const url = publicPageUrl(site, page, locale);
  const image = new URL(socialImagePath(page, locale), site).href;
  const property = (name, content) => `<meta property="${name}" content="${escape(content)}" />`;
  const name = (key, content) => `<meta name="${key}" content="${escape(content)}" />`;
  return [
    `<title>${escape(meta.title)}</title>`,
    name('description', meta.description),
    `<link rel="canonical" href="${url}" />`,
    ...SUPPORTED_LOCALES.map(({ code }) => `<link rel="alternate" hreflang="${code}" href="${publicPageUrl(site, page, code)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${publicPageUrl(site, page, DEFAULT_LOCALE)}" />`,
    property('og:type', ogTypes[page]),
    property('og:site_name', siteName),
    property('og:title', meta.ogTitle),
    property('og:description', meta.ogDescription),
    property('og:url', url),
    property('og:locale', ogLocales[locale]),
    ...SUPPORTED_LOCALES.filter(({ code }) => code !== locale).map(({ code }) => property('og:locale:alternate', ogLocales[code])),
    property('og:image', image),
    property('og:image:type', 'image/png'),
    property('og:image:width', socialImageSize[0]),
    property('og:image:height', socialImageSize[1]),
    property('og:image:alt', meta.ogImageAlt),
    name('twitter:card', 'summary_large_image'),
    name('twitter:title', meta.ogTitle),
    name('twitter:description', meta.ogDescription),
    name('twitter:image', image),
    name('twitter:image:alt', meta.ogImageAlt)
  ].join('\n    ');
}

/*
  Turns the source HTML of a page into its shell in one locale: the document language, and the
  `<title>` placeholder of the source replaced by the whole head of pageHead().
*/
export function localizeShell(html, { site, page, locale, meta }) {
  if (!/<html lang="[^"]*"/.test(html) || !/<title>[^<]*<\/title>/.test(html)) {
    throw new Error(`The ${page} page needs <html lang> and a <title> placeholder to be localized.`);
  }
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${locale}"`)
    .replace(/<title>[^<]*<\/title>/, () => pageHead({ site, page, locale, meta }));
}
