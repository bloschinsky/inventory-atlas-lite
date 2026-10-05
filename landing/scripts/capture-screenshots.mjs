#!/usr/bin/env node
/*
  Captures the landing page screenshots from the real application. It starts the production server
  (`npm run build` must have produced dist/) on a throwaway data directory, fills it with the
  fictional inventory of sampleInventory.mjs through the public API, photographs the pages in
  Chromium, and writes optimized WebP files to landing/src/assets/screenshots/ and the Open Graph
  image to landing/public/. It never reads or writes data/inventory.sqlite.

  Run it with `npm run landing:screenshots`.
*/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { categories, checklists, items, photoSvg } from './sampleInventory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const screenshotDir = path.join(root, 'landing/src/assets/screenshots');
const publicDir = path.join(root, 'landing/public');
const port = Number(process.env.CAPTURE_PORT) || 4380;
const baseURL = `http://127.0.0.1:${port}`;

if (!fs.existsSync(path.join(root, 'dist/index.html'))) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}

async function api(method, url, body) {
  const options = body instanceof FormData ? { method, body } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const response = await fetch(`${baseURL}${url}`, options);
  if (!response.ok) throw new Error(`${method} ${url} returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`The server exited with code ${server.exitCode}.`);
    try {
      if ((await fetch(`${baseURL}/api/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('The server did not answer /api/health in time.');
}

async function seed() {
  await api('PUT', '/api/database/metadata', { name: 'Home inventory' });
  const fieldIds = new Map();
  const categoryIds = new Map();
  for (const category of categories) {
    const created = await api('POST', '/api/categories', { name: category.name });
    categoryIds.set(category.name, created.id);
    for (const field of category.fields) {
      const createdField = await api('POST', `/api/categories/${created.id}/fields`, field);
      fieldIds.set(`${category.name}/${field.name}`, createdField.id);
    }
  }

  const itemIds = new Map();
  let photoIndex = 0;
  for (const { key, category, in: container, fields = {}, photos = [], ...attributes } of items) {
    const field_values = Object.fromEntries(Object.entries(fields).map(([name, value]) => [fieldIds.get(`${category}/${name}`), value]));
    const item = await api('POST', '/api/items', {
      ...attributes,
      category_id: categoryIds.get(category),
      parent_item_id: container ? itemIds.get(container) : null,
      field_values
    });
    if (key) itemIds.set(key, item.id);
    if (!photos.length) continue;
    const form = new FormData();
    for (const kind of photos) {
      const jpeg = await sharp(Buffer.from(photoSvg(kind, photoIndex++))).jpeg({ quality: 86 }).toBuffer();
      form.append('photos', new Blob([jpeg], { type: 'image/jpeg' }), `${kind}.jpg`);
    }
    await api('POST', `/api/items/${item.id}/photos`, form);
  }

  const created = [];
  for (const { items: keys, ...checklist } of checklists) {
    created.push(await api('POST', '/api/checklists', { ...checklist, items: keys.map(key => ({ item_id: itemIds.get(key) })) }));
  }
  // The office check is completed (it records Last verified); the camping trip is half packed.
  const [camping, office] = created;
  const verification = await api('POST', `/api/checklists/${office.id}/runs`);
  for (const entry of verification.items) {
    await api('PATCH', `/api/checklist-runs/${verification.id}/items/${entry.id}`, { status: 'confirmed' });
  }
  await api('POST', `/api/checklist-runs/${verification.id}/complete`);
  const packing = await api('POST', `/api/checklists/${camping.id}/runs`);
  for (const [index, entry] of packing.items.slice(0, 4).entries()) {
    const change = index === 3 ? { status: 'missing', note: 'Left at the office' } : { status: 'confirmed' };
    await api('PATCH', `/api/checklist-runs/${packing.id}/items/${entry.id}`, change);
  }

  return { itemIds, packingRunId: packing.id };
}

async function save(name, buffer, width) {
  const file = path.join(screenshotDir, `${name}.webp`);
  await sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(file);
  console.log(`${path.relative(root, file)} ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

async function capture({ itemIds, packingRunId }) {
  const browser = await chromium.launch();
  const open = async viewport => {
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 2, colorScheme: 'light', locale: 'en-US' });
    await context.addInitScript(() => localStorage.setItem('inventory-atlas-theme', 'light'));
    return context.newPage();
  };
  // Keeps the folded sidebar closed and lets charts, images, and transitions settle.
  const settle = async page => {
    await page.mouse.move(900, 700);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
  };

  const desktop = await open({ width: 1200, height: 780 });
  // `height` crops a page whose content ends early, so the image carries no empty area.
  const shoot = async (name, url, prepare, height = 780) => {
    await desktop.goto(url);
    await settle(desktop);
    if (prepare) await prepare(desktop);
    await save(name, await desktop.screenshot({ clip: { x: 0, y: 0, width: 1200, height } }), 1600);
  };

  await shoot('dashboard', '/dashboard');
  const og = await desktop.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await sharp(og).resize(1200, 630).png({ compressionLevel: 9, palette: true }).toFile(path.join(publicDir, 'og-image.png'));
  await shoot('items', '/items');
  await shoot('items-search', '/items', async page => {
    await page.getByLabel('Search').fill('camping');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
  }, 540);
  await shoot('item-details', `/items/${itemIds.get('drill')}`);
  await shoot('hierarchy', '/hierarchy', async page => {
    await page.getByRole('button', { name: 'Expand all' }).click();
    await page.waitForTimeout(500);
  });
  await shoot('labels', '/items', async page => {
    const uuids = await Promise.all(['camera', 'drill', 'tent', 'router', 'headphones', 'lantern']
      .map(async key => (await api('GET', `/api/items/${itemIds.get(key)}`)).uuid));
    await page.evaluate(list => window.history.replaceState({ ...window.history.state, uuids: list }, '', '/labels/print'), uuids);
    await page.reload();
    await settle(page);
  }, 700);

  const phone = await open({ width: 390, height: 844 });
  const shootPhone = async (name, url) => {
    await phone.goto(url);
    await settle(phone);
    await save(name, await phone.screenshot(), 780);
  };
  await shootPhone('item-phone', `/items/${itemIds.get('camera')}`);
  await shootPhone('checklist-run-phone', `/checklists/runs/${packingRunId}`);

  await browser.close();
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-atlas-landing-'));
const server = spawn(process.execPath, ['server/src/index.js', '--production'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, DEPLOYMENT_TYPE: 'manual' },
  stdio: ['ignore', 'ignore', 'inherit']
});

try {
  await waitForServer(server);
  fs.mkdirSync(screenshotDir, { recursive: true });
  await capture(await seed());
} finally {
  server.kill();
  await new Promise(resolve => (server.exitCode === null ? server.once('exit', resolve) : resolve()));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
