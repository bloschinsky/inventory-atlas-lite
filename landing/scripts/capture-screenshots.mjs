#!/usr/bin/env node
/*
  Captures the landing page screenshots from the public demo, once per landing language. It serves
  the demo build (`npm run demo:build` must have produced dist-landing/demo/), opens it in Chromium in
  each language through its ?lang= address, photographs the pages of the localized demo inventory
  (client/src/demo/fixture.js), and writes optimized WebP files to
  landing/src/assets/screenshots/<locale>/ and the Open Graph image (English) to landing/public/.
  The demo runs entirely in the browser on its invented inventory, so no real or private data can
  reach the public page; the demo strip and the tour launcher are hidden for the photographs.

  Run it with `npm run landing:screenshots`, or for one language with
  `npm run landing:screenshots -- --locale=uk`.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { preview } from 'vite';
import { byKey, createDemoFixture, demoItemUuid } from '../../client/src/demo/fixture.js';
import { SUPPORTED_LOCALES } from '../../client/src/i18n/core.js';
import { screenshotFile, screenshotNames } from '../screenshots.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const demoDir = path.join(root, 'dist-landing/demo');
const publicDir = path.join(root, 'landing/public');
const port = Number(process.env.CAPTURE_PORT) || 4380;
const baseURL = `http://127.0.0.1:${port}/`;

const requested = process.argv.find(arg => arg.startsWith('--locale='))?.slice('--locale='.length);
const locales = requested ? [requested] : SUPPORTED_LOCALES.map(locale => locale.code);
for (const locale of locales) {
  if (!SUPPORTED_LOCALES.some(entry => entry.code === locale)) {
    console.error(`Unsupported locale "${locale}"; use one of ${SUPPORTED_LOCALES.map(entry => entry.code).join(', ')}.`);
    process.exit(1);
  }
}
if (!fs.existsSync(path.join(demoDir, 'index.html'))) {
  console.error('dist-landing/demo/ is missing: run `npm run demo:build` first.');
  process.exit(1);
}

// The product, not the demo: the strip and the tour launcher stay out of the photographs.
const HIDE_DEMO_CHROME = '.demo-banner, .demo-tour-launcher { display: none !important; } .demo-tour-ready .page-body { padding-bottom: var(--tblr-page-padding-y, 1.5rem) !important; }';

async function save(locale, name, buffer, width) {
  const file = path.join(root, screenshotFile(locale, name));
  await sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(file);
  console.log(`${path.relative(root, file)} ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

async function capture(browser, locale) {
  const fixture = createDemoFixture(locale);
  const messages = JSON.parse(fs.readFileSync(path.join(root, `client/src/i18n/locales/${locale}.json`), 'utf8'));
  fs.mkdirSync(path.dirname(path.join(root, screenshotFile(locale, 'items'))), { recursive: true });
  const captured = new Set();

  const open = async viewport => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', locale });
    await context.addInitScript(({ code, css }) => {
      localStorage.setItem('inventory-atlas-theme', 'light');
      localStorage.setItem('inventory-atlas.locale', code);
      document.addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: css })));
    }, { code: locale, css: HIDE_DEMO_CHROME });
    return context.newPage();
  };
  // Every photograph starts from a fresh load, so the demo inventory is the canonical one.
  const visit = async (page, route) => {
    await page.goto('about:blank');
    await page.goto(`${baseURL}?lang=${locale}#${route}`);
    // Keeps the folded sidebar closed.
    await page.mouse.move(900, 700);
    await page.locator('main h1').first().waitFor();
  };
  // Lets charts, images, and transitions settle.
  const settle = page => page.waitForTimeout(900);

  const desktop = await open({ width: 1200, height: 780 });
  // `height` crops a page whose content ends early, so the image carries no empty area.
  const shoot = async (name, route, prepare, height = 780) => {
    await visit(desktop, route);
    if (prepare) await prepare(desktop);
    await settle(desktop);
    await save(locale, name, await desktop.screenshot({ clip: { x: 0, y: 0, width: 1200, height } }), 1600);
    captured.add(name);
  };

  await shoot('dashboard', '/dashboard');
  if (locale === 'en') {
    const og = await desktop.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await sharp(og).resize(1200, 630).png({ compressionLevel: 9, palette: true }).toFile(path.join(publicDir, 'og-image.png'));
  }
  await shoot('items', '/items');
  await shoot('items-search', '/items', async page => {
    await page.locator('#items-search').fill('Nikon');
    // The film rolls are the one Photography item without "Nikon" in any of its values.
    await page.locator('[data-tour="item-results"]').getByText(byKey(fixture.items, 'film-rolls').name, { exact: true }).first().waitFor({ state: 'detached' });
  }, 540);
  await shoot('item-details', `/items/${demoItemUuid('cordless-drill')}`);
  await shoot('hierarchy', '/hierarchy', async page => {
    await page.getByRole('button', { name: messages.hierarchy.expandAll }).click();
  });
  await shoot('labels', '/items', async page => {
    const uuids = ['nikon-f65', 'nikkor-50mm', 'cordless-drill', 'multimeter', 'handheld-radio', 'portable-ssd'].map(demoItemUuid);
    await page.evaluate(list => window.history.replaceState({ ...window.history.state, uuids: list }, '', '#/labels/print'), uuids);
    await page.reload();
    await page.locator('main h1').first().waitFor();
    await page.mouse.move(900, 700);
    await page.locator('.label-sheet').first().waitFor();
  }, 700);

  const phone = await open({ width: 390, height: 844 });
  const shootPhone = async (name, route, prepare) => {
    await visit(phone, route);
    if (prepare) await prepare(phone);
    await settle(phone);
    await save(locale, name, await phone.screenshot(), 780);
    captured.add(name);
  };
  await shootPhone('item-phone', `/items/${demoItemUuid('nikon-f65')}`);
  // A packing run in progress: three items packed and one missing.
  await shootPhone('checklist-run-phone', '/checklists', async page => {
    const checklist = byKey(fixture.checklists, 'weekend-photo-walk').name;
    await page.getByRole('article', { name: checklist }).getByRole('heading').getByRole('link').click();
    await page.locator('[data-tour="checklist-start"]').click();
    const items = page.locator('[data-tour="checklist-run-item"]');
    await items.first().waitFor();
    for (const [index, state] of [[0, 0], [1, 0], [2, 0], [3, 1]]) {
      const button = items.nth(index).locator('[aria-pressed]').nth(state);
      await button.click();
      await page.waitForFunction(element => element.getAttribute('aria-pressed') === 'true', await button.elementHandle());
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await desktop.context().close();
  await phone.context().close();
  const missing = screenshotNames.filter(name => !captured.has(name));
  if (missing.length) throw new Error(`No ${locale} screenshot was captured for ${missing.join(', ')}.`);
}

const server = await preview({
  configFile: false,
  root,
  build: { outDir: demoDir },
  preview: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'warn'
});
const browser = await chromium.launch();
try {
  for (const locale of locales) await capture(browser, locale);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
