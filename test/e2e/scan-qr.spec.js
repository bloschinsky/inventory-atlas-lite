import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { createCategory, createItem, unique } from './helpers.js';

const photoWithoutCode = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample-photo.png');

// A real QR image of any text, generated locally, so the scanner decodes genuine pixels.
const qrDataUrl = text => {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(8, 4);
};
const qrFile = text => ({
  name: 'label.gif',
  mimeType: 'image/gif',
  buffer: Buffer.from(qrDataUrl(text).split(',')[1], 'base64')
});

/*
  Replaces the camera with a repainted canvas stream, since the test browser has no camera. The canvas
  shows `text` as a QR code (or nothing), `window.showOnCamera` changes it later, and every track and
  request is recorded so the tests can check which camera was asked for and that it was released.
  Router pushes are counted as well, to prove that repeated frames never navigate twice.
*/
async function fakeCamera(page, text) {
  await page.addInitScript(initialImage => {
    window.cameraRequests = [];
    window.cameraTracks = [];
    window.routerPushes = 0;
    const pushState = history.pushState;
    history.pushState = function (...args) {
      window.routerPushes += 1;
      return pushState.apply(this, args);
    };
    let image = null;
    window.showOnCamera = async url => {
      if (!url) {
        image = null;
        return;
      }
      const next = new Image();
      next.src = url;
      await next.decode();
      image = next;
    };
    const ready = window.showOnCamera(initialImage);
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.cameraRequests.push(constraints);
      await ready;
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const context = canvas.getContext('2d');
      // A captured canvas only emits frames while it keeps being painted.
      const paint = () => {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (image) context.drawImage(image, (canvas.width - image.width) / 2, (canvas.height - image.height) / 2);
      };
      paint();
      setInterval(paint, 100);
      const stream = canvas.captureStream(10);
      window.cameraTracks.push(...stream.getVideoTracks());
      return stream;
    };
  }, text ? qrDataUrl(text) : null);
}

const cameraReleased = page => page.evaluate(() =>
  window.cameraTracks.length > 0 && window.cameraTracks.every(track => track.readyState === 'ended'));

async function scanImageFile(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Scan from image' }).click();
  await (await chooser).setFiles(file);
}

async function openScanner(page) {
  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Scan QR', level: 1 })).toBeVisible();
  // The folded sidebar overlays the page controls while the pointer rests at (0, 0).
  await page.mouse.move(600, 400);
}

test('Scan QR is reachable from the navigation and asks for the rear camera', async ({ page }) => {
  await fakeCamera(page, null);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Scan QR' }).click();

  await expect(page).toHaveURL('/scan');
  await expect(page.getByRole('heading', { name: 'Scan QR', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scan QR' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Point the camera at an Inventory Atlas label.')).toBeVisible();
  await expect(page.getByLabel('Camera preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan from image' })).toBeEnabled();
  expect(await page.evaluate(() => window.cameraRequests)).toEqual([
    { video: { facingMode: { ideal: 'environment' } }, audio: false }
  ]);
});

test('a scanned item code opens that item exactly once and releases the camera', async ({ page, request }) => {
  const category = await createCategory(request, unique('Boxes'));
  const item = await createItem(request, { name: unique('Scanned box'), category_id: category.id });
  await fakeCamera(page, `ial:item:v1:${item.uuid}`);

  await page.goto('/scan');
  await expect(page).toHaveURL(`/items/${item.uuid}`);
  await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
  // The camera kept showing the same code, yet only one navigation happened and the stream stopped.
  expect(await page.evaluate(() => window.routerPushes)).toBe(1);
  expect(await cameraReleased(page)).toBe(true);
});

test('a QR code with an external URL is rejected and the scanner can retry without a reload', async ({ page, request }) => {
  const category = await createCategory(request, unique('Tools'));
  const item = await createItem(request, { name: unique('Drill'), category_id: category.id });
  await fakeCamera(page, 'https://example.com/items/42');

  await openScanner(page);
  await expect(page.getByRole('alert')).toHaveText('This is not an Inventory Atlas QR code.');
  await expect(page).toHaveURL('/scan');
  expect(await cameraReleased(page)).toBe(true);

  await page.evaluate(url => window.showOnCamera(url), qrDataUrl(`ial:item:v1:${item.uuid}`));
  await page.getByRole('button', { name: 'Scan again' }).click();
  await expect(page).toHaveURL(`/items/${item.uuid}`);
  await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
});

test('malformed Inventory Atlas codes and images without a code are reported', async ({ page }) => {
  await fakeCamera(page, null);
  await openScanner(page);

  const invalid = 'This Inventory Atlas QR code is invalid or uses an unsupported format.';
  await scanImageFile(page, qrFile('ial:item:v1:not-a-uuid'));
  await expect(page.getByRole('alert')).toHaveText(invalid);
  await scanImageFile(page, qrFile(`ial:item:v9:${randomUUID()}`));
  await expect(page.getByRole('alert')).toHaveText(invalid);
  await scanImageFile(page, photoWithoutCode);
  await expect(page.getByRole('alert')).toHaveText('No QR code was found in this image.');
  await expect(page).toHaveURL('/scan');
});

test('a valid code for an item that does not exist says so', async ({ page }) => {
  await fakeCamera(page, `ial:item:v1:${randomUUID()}`);
  await openScanner(page);
  await expect(page.getByRole('alert')).toHaveText('Item not found.');
  await expect(page).toHaveURL('/scan');
  await expect(page.getByRole('button', { name: 'Scan again' })).toBeVisible();
});

test('leaving the page stops the camera', async ({ page }) => {
  await fakeCamera(page, null);
  await openScanner(page);
  await expect(page.getByText('Point the camera at an Inventory Atlas label.')).toBeVisible();
  expect(await page.evaluate(() => window.cameraTracks[0].readyState)).toBe('live');

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await expect(page).toHaveURL('/items');
  expect(await cameraReleased(page)).toBe(true);
});

test('with the camera denied, a code is read from an image locally without uploading it', async ({ page, request }) => {
  const category = await createCategory(request, unique('Lenses'));
  const item = await createItem(request, { name: unique('Lens'), category_id: category.id });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });

  await openScanner(page);
  await expect(page.getByRole('heading', { name: 'Camera unavailable' })).toBeVisible();
  await expect(page.getByText('Camera access was denied.')).toBeVisible();

  const requests = [];
  page.on('request', sent => requests.push(sent));
  await scanImageFile(page, qrFile(`ial:item:v1:${item.uuid}`));
  await expect(page).toHaveURL(`/items/${item.uuid}`);
  await expect(page.getByRole('heading', { name: item.name })).toBeVisible();

  // Only read-only lookups of the decoded item happened; the image itself never left the browser.
  expect(requests.length).toBeGreaterThan(0);
  for (const sent of requests) {
    expect(sent.method(), sent.url()).toBe('GET');
    expect(sent.postData(), sent.url()).toBeNull();
  }
});

test('without a secure context the page explains why and keeps the image fallback', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cables'));
  const item = await createItem(request, { name: unique('Cable'), category_id: category.id });
  // This is what a browser shows a page opened over plain HTTP on a LAN address.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => undefined });
    Object.defineProperty(window, 'isSecureContext', { get: () => false });
  });

  await openScanner(page);
  await expect(page.getByText('The live camera only works when the application is opened over HTTPS or on localhost.')).toBeVisible();
  await expect(page.getByLabel('Camera preview')).toHaveCount(0);

  await scanImageFile(page, qrFile(`ial:item:v1:${item.uuid}`));
  await expect(page).toHaveURL(`/items/${item.uuid}`);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the scanner opens from the mobile menu and fits the screen', async ({ page, request }) => {
    const category = await createCategory(request, unique('Shelves'));
    const item = await createItem(request, { name: unique('Tape'), category_id: category.id });
    await fakeCamera(page, null);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('dialog', { name: 'Main navigation' }).getByRole('link', { name: 'Scan QR' }).click();
    await expect(page).toHaveURL('/scan');
    await expect(page.getByLabel('Camera preview')).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);

    await page.evaluate(url => window.showOnCamera(url), qrDataUrl(`ial:item:v1:${item.uuid}`));
    await expect(page).toHaveURL(`/items/${item.uuid}`);
  });
});
