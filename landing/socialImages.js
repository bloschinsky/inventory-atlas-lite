/*
  The social preview images: one 1200 × 630 PNG per public page and supported locale, published at
  og/<page>-<locale>.png under the site address. landing/scripts/render-social-images.mjs renders them
  from the layouts in landing/social/ and test/landing.test.js checks the published set.
*/
export const socialPages = ['landing', 'guide', 'demo'];

export const socialImageSize = [1200, 630];

// Large enough for the screenshots they carry, small enough to load quickly in a link preview.
export const socialImageMaxBytes = 400 * 1024;

export const socialImagePath = (page, locale) => `og/${page}-${locale}.png`;

export const socialImageFile = (page, locale) => `landing/public/${socialImagePath(page, locale)}`;
