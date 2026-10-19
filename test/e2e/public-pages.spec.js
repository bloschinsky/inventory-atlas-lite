import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createDemoFixture } from '../../client/src/demo/fixture.js';
import { ogLocales, publicPagePath } from '../../landing/publicPages.js';
import { landingURL } from './environment.js';

/*
  The six public addresses — the product page, the user guide, and the demo, each in English and
  Ukrainian — in the production builds under the Pages-style base path (see playwright.config.js). A
  link preview reads the raw HTML without running scripts, so the metadata is checked in the HTTP
  response itself; the language of each address is then checked in the browser.
*/
const STORAGE_KEY = 'inventory-atlas.locale';
const messages = Object.fromEntries(['en', 'uk'].map(code =>
  [code, JSON.parse(fs.readFileSync(new URL(`../../landing/src/locales/${code}.json`, import.meta.url), 'utf8'))]));
const pages = ['landing', 'guide', 'demo'];
const addresses = pages.flatMap(page => ['en', 'uk'].map(locale => ({ page, locale, url: `${landingURL}${publicPagePath(page, locale)}` })));

const decode = value => value?.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// Every value of one tag attribute in the raw HTML, as a crawler reads it.
const values = (html, tag, name) => [...html.matchAll(new RegExp(`<${tag}[^>]*? ${name}="([^"]*)"`, 'g'))].map(match => decode(match[1]));
const meta = (html, key) => values(html, `meta (?:name|property)="${key}"`, 'content');

for (const { page, locale, url } of addresses) {
  test(`the raw ${locale} ${page} HTML carries its own sharing metadata and image`, async ({ request }) => {
    const copy = messages[locale].meta[page];
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const html = await response.text();

    expect(html).toMatch(new RegExp(`<html lang="${locale}"`));
    expect([...html.matchAll(/<title>([^<]*)<\/title>/g)].map(match => decode(match[1]))).toEqual([copy.title]);
    expect(meta(html, 'description')).toEqual([copy.description]);
    expect(values(html, 'link rel="canonical"', 'href')).toEqual([url]);
    expect(meta(html, 'og:url')).toEqual([url]);
    expect(meta(html, 'og:type')).toEqual([page === 'guide' ? 'article' : 'website']);
    expect(meta(html, 'og:site_name')).toEqual(['Inventory Atlas Lite']);
    expect(meta(html, 'og:title')).toEqual([copy.ogTitle]);
    expect(meta(html, 'og:description')).toEqual([copy.ogDescription]);
    expect(meta(html, 'og:locale')).toEqual([ogLocales[locale]]);
    expect(meta(html, 'og:locale:alternate')).toEqual([ogLocales[locale === 'en' ? 'uk' : 'en']]);
    expect(meta(html, 'og:image:width')).toEqual(['1200']);
    expect(meta(html, 'og:image:height')).toEqual(['630']);
    expect(meta(html, 'og:image:alt')).toEqual([copy.ogImageAlt]);
    expect(meta(html, 'twitter:card')).toEqual(['summary_large_image']);
    expect(meta(html, 'twitter:title')).toEqual([copy.ogTitle]);
    expect(meta(html, 'twitter:description')).toEqual([copy.ogDescription]);
    expect(meta(html, 'twitter:image:alt')).toEqual([copy.ogImageAlt]);

    // Both languages name each other, both ways, and English is the default.
    for (const other of ['en', 'uk']) {
      expect(values(html, `link rel="alternate" hreflang="${other}"`, 'href')).toEqual([`${landingURL}${publicPagePath(page, other)}`]);
    }
    expect(values(html, 'link rel="alternate" hreflang="x-default"', 'href')).toEqual([`${landingURL}${publicPagePath(page, 'en')}`]);

    // The image of this page and language, and nothing else, loads from its absolute address.
    const [image] = meta(html, 'og:image');
    expect(image).toBe(`${landingURL}og/${page}-${locale}.png`);
    expect(meta(html, 'twitter:image')).toEqual([image]);
    const picture = await request.get(image);
    expect(picture.status()).toBe(200);
    expect(picture.headers()['content-type']).toBe('image/png');
    const { format, width, height } = await sharp(await picture.body()).metadata();
    expect([format, width, height]).toEqual(['png', 1200, 630]);
  });
}

test('the two demo pages load one shared bundle, and every page script and style loads', async ({ request }) => {
  const assetsOf = async url => {
    const html = await (await request.get(url)).text();
    return [...html.matchAll(/<(?:script|link)[^>]*? (?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => new URL(match[1], url).href);
  };
  const english = await assetsOf(`${landingURL}demo/`);
  expect(english.length).toBeGreaterThan(0);
  expect(await assetsOf(`${landingURL}uk/demo/`)).toEqual(english);
  for (const asset of english) expect(new URL(asset).pathname.startsWith(`${new URL(landingURL).pathname}demo/assets/`)).toBe(true);
  for (const { url } of addresses) {
    for (const asset of await assetsOf(url)) expect((await request.get(asset)).status(), asset).toBe(200);
  }
});

test.describe('the address is the language', () => {
  const ukDemo = createDemoFixture('uk');
  // Every page opens in the language of its address, never in the one this browser saved before.
  const expectations = {
    landing: { en: page => page.getByRole('heading', { level: 2, name: 'Everything has a place' }), uk: page => page.getByRole('heading', { level: 2, name: messages.uk.sections.hierarchy.title }) },
    guide: { en: page => page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite — Quick How-To' }), uk: page => page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite — короткий посібник' }) },
    demo: { en: page => page.getByRole('heading', { level: 1, name: 'Dashboard' }), uk: page => page.getByRole('heading', { level: 1, name: 'Панель' }) }
  };

  for (const { page: name, locale, url } of addresses) {
    test(`the ${locale} ${name} opens in its language over a saved ${locale === 'en' ? 'Ukrainian' : 'English'} choice`, async ({ page }) => {
      const failures = [];
      page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, locale === 'en' ? 'uk' : 'en']);
      await page.goto(name === 'demo' ? `${url}#/dashboard` : url);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(expectations[name][locale](page)).toBeVisible();
      if (name === 'demo') {
        await expect(page.getByRole('link', { name: locale === 'uk' ? `Активна база даних: ${ukDemo.databaseName}` : /^Active database:/ })).toBeVisible();
      } else {
        // The screenshots follow the address too.
        const image = page.locator('main img').first();
        expect(new URL(await image.getAttribute('src'), url).pathname).toContain(`/screenshots/${locale}/`);
      }
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(expectations[name][locale](page)).toBeVisible();
      expect(failures).toEqual([]);
    });
  }

  test('the Ukrainian demo keeps its address and page through Reset demo and a language change', async ({ page }) => {
    const photos = [];
    page.on('response', response => { if (response.url().endsWith('.webp')) photos.push(response); });
    await page.goto(`${landingURL}uk/demo/#/hierarchy`);
    await page.mouse.move(600, 400);
    await expect(page.getByRole('heading', { level: 1, name: 'Ієрархія' })).toBeVisible();
    // The demo photos come from the one bundle under demo/.
    expect(photos.length).toBeGreaterThan(0);
    for (const photo of photos) {
      expect(photo.ok()).toBe(true);
      expect(new URL(photo.url()).pathname.startsWith(`${new URL(landingURL).pathname}demo/assets/`)).toBe(true);
    }

    await page.getByRole('button', { name: 'Скинути демо' }).click();
    await expect(page).toHaveURL(`${landingURL}uk/demo/#/dashboard`);
    await expect(page.getByRole('heading', { level: 1, name: 'Панель' })).toBeVisible();

    await page.mouse.move(600, 400);
    await page.getByRole('link', { name: 'Предмети', exact: true }).click();
    await page.getByRole('link', { name: 'Налаштування', exact: true }).click();
    await page.mouse.move(600, 400);
    await page.getByLabel('Мова').selectOption('en');
    await expect(page).toHaveURL(new RegExp(`^${landingURL}demo/#/settings`));
    // Closing Settings goes back in the history to the Items page opened in Ukrainian; it stays English.
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page).toHaveURL(`${landingURL}demo/#/items`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'Items' })).toBeVisible();
  });
});
