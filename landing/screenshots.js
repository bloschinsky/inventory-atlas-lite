/*
  The landing screenshots: one set per supported locale in landing/src/assets/screenshots/<locale>/,
  each holding every name below as <name>.webp. landing/scripts/capture-screenshots.mjs writes them
  from the public demo in that language, landing/vite.config.js refuses to build without them, and the
  page shows only the set of the active language.
*/
export const screenshotNames = [
  'items',
  'item-phone',
  'hierarchy',
  'item-details',
  'labels',
  'items-search',
  'checklist-run-phone',
  'dashboard'
];

export const screenshotFile = (locale, name) => `landing/src/assets/screenshots/${locale}/${name}.webp`;
