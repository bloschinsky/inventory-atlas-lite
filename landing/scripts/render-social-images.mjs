#!/usr/bin/env node
/*
  Renders the social preview images of the public site: one 1200 × 630 PNG for each of the Landing,
  Guide, and Demo pages in each landing language, written to landing/public/og/<page>-<locale>.png
  (landing/socialImages.js). The layouts are landing/social/layouts.js and card.css, the copy is
  `social.<page>` in landing/src/locales/<locale>.json, and the pictures are the localized demo
  screenshots already in landing/src/assets/screenshots/ (`npm run landing:screenshots` refreshes
  them) and the section titles of the localized user guide. Chromium renders each card locally with
  the bundled Geist typeface; nothing is fetched or generated remotely.

  Every image is checked after rendering: no copy may overflow its column, and the file must be a PNG
  of the exact size within the size budget. A file whose bytes did not change is left untouched.

  Run it with `npm run landing:social`, or for one language with
  `npm run landing:social -- --locale=uk`.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { SUPPORTED_LOCALES } from '../../client/src/i18n/core.js';
import { buildGuide } from '../guideSource.js';
import { screenshotFile } from '../screenshots.js';
import { cardHtml, cardScreenshots } from '../social/layouts.js';
import { socialImageFile, socialImageMaxBytes, socialImageSize, socialPages } from '../socialImages.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file));
const [width, height] = socialImageSize;

const requested = process.argv.find(arg => arg.startsWith('--locale='))?.slice('--locale='.length);
const locales = requested ? [requested] : SUPPORTED_LOCALES.map(locale => locale.code);
for (const locale of locales) {
  if (!SUPPORTED_LOCALES.some(entry => entry.code === locale)) {
    console.error(`Unsupported locale "${locale}"; use one of ${SUPPORTED_LOCALES.map(entry => entry.code).join(', ')}.`);
    process.exit(1);
  }
}

const dataUrl = (file, type) => `data:${type};base64,${read(file).toString('base64')}`;
// The Latin and Cyrillic subsets of the variable Geist the landing page bundles.
const fonts = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'].map(subset =>
  `@font-face { font-family: 'Geist'; font-weight: 100 900; src: url(${dataUrl(`node_modules/@fontsource-variable/geist/files/geist-${subset}-wght-normal.woff2`, 'font/woff2')}) format('woff2'); }`
).join('\n');
const styles = read('landing/social/card.css').toString();

function documentHtml(page, locale) {
  const copy = JSON.parse(read(`landing/src/locales/${locale}.json`)).social[page];
  const shots = Object.fromEntries(cardScreenshots[page].map(name => [name, dataUrl(screenshotFile(locale, name), 'image/webp')]));
  const guide = page === 'guide' ? buildGuide(locale) : null;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>${fonts}\n${styles}</style></head><body>${cardHtml(page, { copy, shots, guide })}</body></html>`;
}

// Names every piece of copy that is clipped or spills out of the copy column.
const overflowing = () => {
  const column = document.querySelector('.copy').getBoundingClientRect();
  return [...document.querySelectorAll('.copy > *, .manual li span')].filter(element => {
    const box = element.getBoundingClientRect();
    return element.scrollWidth > element.clientWidth + 1 ||
      (element.closest('.copy') && (box.right > column.right + 1 || box.bottom > column.bottom + 1));
  }).map(element => element.textContent.trim());
};

async function render(browserPage, page, locale) {
  await browserPage.setContent(documentHtml(page, locale), { waitUntil: 'load' });
  await browserPage.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  if (!await browserPage.evaluate(() => document.fonts.check('720 56px Geist', document.querySelector('.title').textContent))) {
    throw new Error(`${page}-${locale}: the Geist typeface did not load.`);
  }
  const clipped = await browserPage.evaluate(overflowing);
  if (clipped.length) throw new Error(`${page}-${locale}: the copy does not fit: ${clipped.join(' | ')}`);

  const capture = await browserPage.screenshot({ clip: { x: 0, y: 0, width, height } });
  const png = await sharp(capture).resize(width, height).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const { format, width: actualWidth, height: actualHeight } = await sharp(png).metadata();
  if (format !== 'png' || actualWidth !== width || actualHeight !== height) throw new Error(`${page}-${locale}: not a ${width} × ${height} PNG.`);
  if (png.length > socialImageMaxBytes) throw new Error(`${page}-${locale}: ${Math.round(png.length / 1024)} KB is over the ${socialImageMaxBytes / 1024} KB budget.`);

  const file = path.join(root, socialImageFile(page, locale));
  const unchanged = fs.existsSync(file) && fs.readFileSync(file).equals(png);
  if (!unchanged) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
  }
  console.log(`${path.relative(root, file)} ${Math.round(png.length / 1024)} KB${unchanged ? ' (unchanged)' : ''}`);
}

const browser = await chromium.launch();
try {
  // Rendered at twice the size and scaled down, so text and screenshots stay sharp.
  const browserPage = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  for (const locale of locales) {
    for (const page of socialPages) await render(browserPage, page, locale);
  }
} finally {
  await browser.close();
}
