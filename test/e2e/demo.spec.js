import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { byKey, createDemoFixture, demoItemUuid, photoFiles } from '../../client/src/demo/fixture.js';
import { demoURL } from './environment.js';

/*
  The public demo, built with `vite build --mode demo` into the landing page and served under the
  same Pages-style base path (see playwright.config.js). No API server is involved: every request a
  demo page makes must stay inside the static site.
*/
const { items } = createDemoFixture('en');
const ukrainian = createDemoFixture('uk');
const uuidOf = demoItemUuid;
const search = page => page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…');

// Every request of a demo page, so a test can prove that nothing reached a server API.
const watchRequests = page => {
  const urls = [];
  page.on('request', request => urls.push(request.url()));
  return urls;
};

async function open(page, hash = '#/dashboard') {
  await page.goto(`${demoURL}${hash}`);
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar over the page.
  await page.mouse.move(600, 400);
}

test('the demo opens the real interface on the canonical inventory without any server', async ({ page }) => {
  const requests = watchRequests(page);
  await open(page);

  const banner = page.getByRole('complementary', { name: 'Demo mode' });
  await expect(banner).toContainText('Changes are not saved');
  await expect(banner.getByRole('button', { name: 'Reset demo' })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Get Inventory Atlas Lite' })).toHaveAttribute('href', 'https://github.com/bloschinsky/inventory-atlas-lite');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(String(items.length), { exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await search(page).fill('Nikon');
  await expect(page.getByRole('link', { name: 'Nikon F65', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cordless drill', exact: true })).toHaveCount(0);

  const origin = new URL(demoURL).origin;
  const outside = requests.filter(url => !url.startsWith(demoURL) && !url.startsWith('blob:') && !url.startsWith('data:'));
  expect(outside, 'the demo requested something outside its own static files').toEqual([]);
  expect(requests.some(url => url.startsWith(`${origin}/api/`))).toBe(false);
});

test('item details show the seeded data and the photo bundled with the demo', async ({ page }) => {
  await open(page, `#/items/${uuidOf('cordless-drill')}`);

  await expect(page.getByRole('heading', { name: 'Cordless drill' })).toBeVisible();
  await expect(page.getByText('CD18-449201')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tool Cabinet' }).first()).toBeVisible();
  const photo = page.getByRole('img', { name: /cordless-drill\.webp|Cordless drill/ }).first();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('every generated photo is served from the static demo assets', async ({ page }) => {
  const photos = [];
  page.on('response', response => { if (response.url().endsWith('.webp')) photos.push(response); });
  await open(page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  for (const name of photoFiles) {
    const response = photos.find(candidate => new URL(candidate.url()).pathname.includes(`/demo/assets/${name.replace('.webp', '')}-`));
    expect(response, `${name} was loaded from the demo assets`).toBeTruthy();
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/webp');
  }
});

test('changes stay in the page, and Reset demo returns to the canonical inventory', async ({ page }) => {
  await open(page, '#/items/new');
  await page.getByLabel('Name *').fill('Visitor lantern');
  await page.getByLabel('Category *').selectOption({ label: 'Travel & Outdoor' });
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Visitor lantern' })).toBeVisible();

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await search(page).fill('Visitor');
  await expect(page.getByRole('link', { name: 'Visitor lantern', exact: true }).first()).toBeVisible();

  // Editing a seeded item works too.
  await open(page, `#/items/${uuidOf('flashlight')}/edit`);
  await page.getByLabel('Name *').fill('Compact flashlight (blue)');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Compact flashlight (blue)' })).toBeVisible();

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page).toHaveURL(`${demoURL}#/dashboard`);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await search(page).fill('Visitor');
  await expect(page.getByText('No matching items')).toBeVisible();
  await open(page, `#/items/${uuidOf('flashlight')}`);
  await expect(page.getByRole('heading', { name: 'Compact flashlight', exact: true })).toBeVisible();
});

test('a deep link to a demo page survives a reload', async ({ page }) => {
  await open(page, '#/hierarchy');
  await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();
  for (const location of ['Home / Office', 'Home / Storage', 'Workshop', 'Travel gear']) {
    await expect(page.getByText(location, { exact: true }).first()).toBeVisible();
  }
});

test('server-only features explain that they are not part of the demo', async ({ page }) => {
  await open(page, '#/data');
  await expect(page.getByRole('heading', { name: 'Not available in the public demo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download Backup' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Danger Zone' })).toHaveCount(0);

  for (const section of ['cloud-backup', 'ai']) {
    await open(page, `#/settings/${section}`);
    await expect(page.getByRole('heading', { name: 'Not available in the public demo' })).toBeVisible();
  }
  // AI entry points stay hidden: the demo reports AI as not configured.
  await open(page, '#/items');
  await expect(page.getByRole('link', { name: /AI/ })).toHaveCount(0);
  // URL import needs the server's network access, so the demo never offers it.
  await page.getByRole('button', { name: 'More ways to add an item' }).click();
  await expect(page.getByRole('link', { name: 'Blank item' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'From URL' })).toHaveCount(0);
});

test('the built demo contains no API key or cloud credential', () => {
  const root = new URL('../../dist-landing/demo/', import.meta.url);
  const files = fs.readdirSync(new URL('assets/', root)).filter(name => /\.(js|css|html)$/.test(name));
  const secrets = [/sk-[A-Za-z0-9_-]{16,}/, /AIza[0-9A-Za-z_-]{30,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /BEGIN [A-Z ]*PRIVATE KEY/, /e2e-dropbox/];
  for (const name of files) {
    const text = fs.readFileSync(new URL(`assets/${name}`, root), 'utf8');
    for (const pattern of secrets) expect(text, `${name} matches ${pattern}`).not.toMatch(pattern);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the demo strip wraps without sideways scrolling and the menu still works', async ({ page }) => {
    await open(page, '#/items');
    await expect(page.getByRole('complementary', { name: 'Demo mode' }).getByRole('button', { name: 'Reset demo' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('dialog', { name: 'Main navigation' }).getByRole('link', { name: 'Hierarchy' }).click();
    await expect(page).toHaveURL(`${demoURL}#/hierarchy`);
    await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();
  });
});

test.describe('in every language', () => {
  const STORAGE_KEY = 'inventory-atlas.locale';
  const banner = page => page.getByRole('complementary', { name: /^(Demo mode|Демо-режим)$/ });

  test('?lang= opens the demo in that language, with the demo inventory in it, over the saved choice', async ({ page }) => {
    await page.addInitScript(key => localStorage.setItem(key, 'en'), STORAGE_KEY);
    await open(page, '?lang=uk#/hierarchy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.getByRole('heading', { name: 'Ієрархія', level: 1 })).toBeVisible();
    for (const location of Object.values(ukrainian.locations)) await expect(page.getByText(location, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Home / Office', { exact: true })).toHaveCount(0);

    // A reload of a shared deep link keeps its language.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ієрархія', level: 1 })).toBeVisible();
    await open(page, `?lang=uk#/items/${uuidOf('nikon-f65')}`);
    await expect(page.getByRole('heading', { name: 'Nikon F65' })).toBeVisible();
    await expect(page.getByText('F65-2481937')).toBeVisible();
    await expect(page.getByRole('link', { name: byKey(ukrainian.items, 'camera-bag').name }).first()).toBeVisible();
    await expect(page.getByText(byKey(ukrainian.categories, 'photography').fields[1].name, { exact: true })).toBeVisible();

    await open(page, '?lang=en#/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('an unsupported ?lang= falls back safely to English', async ({ page }) => {
    await open(page, '?lang=fr#/items');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Items', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Camera Bag', exact: true }).first()).toBeVisible();
  });

  test('a language change seeds the demo again in the new language, without mixing two', async ({ page }) => {
    await open(page, '#/items/new');
    await page.getByLabel('Name *').fill('Visitor lantern');
    await page.getByLabel('Category *').selectOption({ label: 'Travel & Outdoor' });
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page.getByRole('heading', { name: 'Visitor lantern' })).toBeVisible();

    // In the same page, so the visitor's change is still in the demo database.
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.mouse.move(600, 400);
    await page.getByLabel('Language').selectOption('uk');
    await expect(page.getByRole('heading', { name: 'Налаштування', level: 1 })).toBeVisible();
    // The address names the shown language, so a reload or a copied link opens it again.
    expect(new URL(page.url()).searchParams.get('lang')).toBe('uk');
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('uk');
    // Settings is a dialog over the page; the demo strip under it reports the new data once it closes.
    await page.getByRole('button', { name: 'Закрити налаштування' }).click();
    await expect(banner(page)).toContainText('Демо-дані оновлено українською мовою.');

    await page.getByRole('link', { name: 'Предмети', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Предмети', level: 1 })).toBeVisible();
    for (const key of ['camera-bag', 'cordless-drill']) {
      await expect(page.getByRole('link', { name: byKey(ukrainian.items, key).name, exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Camera Bag', exact: true })).toHaveCount(0);
    await page.getByLabel('Пошук').fill('Visitor');
    await expect(page.getByText('Немає відповідних предметів')).toBeVisible();
    await page.getByRole('link', { name: 'Налаштування', exact: true }).click();
    await page.mouse.move(600, 400);
    await page.getByRole('link', { name: 'База даних' }).click();
    await expect(page.getByLabel('Назва бази даних')).toHaveValue(ukrainian.databaseName);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await page.mouse.move(600, 400);

    await open(page, `?lang=uk#/items/${uuidOf('cordless-drill')}`);
    await expect(page.getByRole('heading', { name: byKey(ukrainian.items, 'cordless-drill').name })).toBeVisible();
    await open(page, '?lang=uk#/settings/interface');
    await page.getByLabel('Мова').selectOption('en');
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(banner(page)).toContainText('Demo data was reset in English.');
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Camera Bag', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: byKey(ukrainian.items, 'camera-bag').name, exact: true })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('lang')).toBe('en');
  });
});
