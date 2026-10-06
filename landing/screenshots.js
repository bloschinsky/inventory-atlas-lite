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

/*
  The pixel size of each screenshot, the same in every locale. The page gives it to the image, so the
  browser reserves the space before a lazy screenshot loads and a guide anchor stays where it landed;
  test/landing.test.js checks it against the captured files.
*/
export const screenshotSizes = {
  items: [1600, 1040],
  'item-phone': [780, 1688],
  hierarchy: [1600, 1040],
  'item-details': [1600, 1040],
  labels: [1600, 933],
  'items-search': [1600, 720],
  'checklist-run-phone': [780, 1688],
  dashboard: [1600, 1040]
};
