import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');

test('uploads a photo with a new item and shows it', async ({ page, request }) => {
  const categoryName = unique('Lenses');
  await createCategory(request, categoryName);
  const itemName = unique('Lens');

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Add photos').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Save item' }).click();

  const photo = page.getByRole('img', { name: 'sample-photo.png' });
  await expect(photo).toBeVisible();
  // The image is served back from SQLite, so it must actually decode in the browser.
  await expect.poll(() => photo.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(itemName);
  await expect(page.getByRole('img', { name: itemName })).toBeVisible();
});

const photoBytes = fs.readFileSync(fixture);
const upload = (request, itemId, name) =>
  request.post(`/api/items/${itemId}/photos`, { multipart: { photos: { name, mimeType: 'image/png', buffer: photoBytes } } });

// Item with photos named photo-1.png … photo-<count>.png, so every slide is identifiable.
async function itemWithPhotos(request, count) {
  const category = await createCategory(request, unique('Optics'));
  const item = await createItem(request, { name: unique('Telescope'), category_id: category.id });
  for (let number = 1; number <= count; number++) {
    const response = await upload(request, item.id, `photo-${number}.png`);
    expect(response.ok(), `photo ${number} was not stored`).toBeTruthy();
  }
  return item;
}

const slide = (page, number) => page.getByRole('img', { name: `photo-${number}.png` });
const indicator = (page, number, total) => page.getByRole('button', { name: `Show photo ${number} of ${total}` });

// Deleting a photo is confirmed by the parent page before the request is sent.
async function deleteCurrentPhoto(page) {
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete photo' }).click();
}

// Pointer drag across the photo: a negative distance moves forward, a positive one back.
async function dragPhoto(page, number, distance) {
  const box = await slide(page, number).boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width / 2;
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move(from + distance / 2, y);
  await page.mouse.move(from + distance, y);
  await page.mouse.up();
}

test('a single photo is shown without carousel controls', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 1);

  await page.goto(`/items/${item.id}`);
  await expect(slide(page, 1)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next photo' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Previous photo' })).toBeHidden();
  await expect(indicator(page, 1, 1)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Delete photo' })).toBeVisible();
});

test('several photos are browsed with the carousel arrows and indicators', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 3);

  await page.goto(`/items/${item.id}`);
  // The pointer is kept away from the folded-hover sidebar before any control is used.
  await page.mouse.move(600, 400);
  await expect(slide(page, 1)).toBeVisible();
  await expect(page.getByText('1 / 3')).toBeVisible();

  const next = page.getByRole('button', { name: 'Next photo' });
  const previous = page.getByRole('button', { name: 'Previous photo' });
  await next.click();
  await expect(slide(page, 2)).toBeVisible();
  await expect(slide(page, 1)).toBeHidden();
  await expect(page.getByText('2 / 3')).toBeVisible();

  await previous.click();
  await expect(slide(page, 1)).toBeVisible();

  // Navigation stays cyclic in both directions.
  await previous.click();
  await expect(slide(page, 3)).toBeVisible();
  await next.click();
  await expect(slide(page, 1)).toBeVisible();

  // An indicator jumps straight to its own photo and marks itself as the current slide.
  await indicator(page, 3, 3).click();
  await expect(slide(page, 3)).toBeVisible();
  await expect(indicator(page, 3, 3)).toHaveAttribute('aria-current', 'true');
  await indicator(page, 2, 3).click();
  await expect(slide(page, 2)).toBeVisible();
  await expect(page.getByText('2 / 3')).toBeVisible();
});

test('dragging the photo with the mouse moves between slides', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 3);

  await page.goto(`/items/${item.id}`);
  await page.mouse.move(600, 400);
  await expect(slide(page, 1)).toBeVisible();

  await dragPhoto(page, 1, -120);
  await expect(slide(page, 2)).toBeVisible();

  await dragPhoto(page, 2, 120);
  await expect(slide(page, 1)).toBeVisible();

  // A small accidental movement is not a swipe.
  await dragPhoto(page, 1, -10);
  await expect(slide(page, 1)).toBeVisible();
});

test('deleting photos keeps the carousel on a valid slide', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 4);

  await page.goto(`/items/${item.id}`);
  await page.mouse.move(600, 400);

  // Deleting the first photo moves to the one that took its place.
  await deleteCurrentPhoto(page);
  await expect(slide(page, 2)).toBeVisible();
  await expect(page.getByText('1 / 3')).toBeVisible();

  // Deleting a middle photo keeps the same position, now holding the following photo.
  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(slide(page, 3)).toBeVisible();
  await deleteCurrentPhoto(page);
  await expect(slide(page, 4)).toBeVisible();
  await expect(page.getByText('2 / 2')).toBeVisible();

  // Deleting the last photo falls back to the nearest remaining one and leaves single-photo mode.
  await deleteCurrentPhoto(page);
  await expect(slide(page, 2)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next photo' })).toBeHidden();
  await expect(indicator(page, 1, 1)).toBeHidden();

  // Deleting the only photo shows the empty state again.
  await deleteCurrentPhoto(page);
  await expect(page.getByText('No photos for this item yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete photo' })).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a touch swipe moves between photos', async ({ page, request }) => {
    const item = await itemWithPhotos(request, 2);

    await page.goto(`/items/${item.id}`);
    await expect(slide(page, 1)).toBeVisible();

    const track = page.locator('.carousel-inner');
    const box = await track.boundingBox();
    const y = box.y + box.height / 2;
    const swipe = async (from, to) => {
      await track.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: from, clientY: y });
      await track.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, clientX: to, clientY: y });
    };

    await swipe(box.x + box.width - 40, box.x + 40);
    await expect(slide(page, 2)).toBeVisible();

    await swipe(box.x + 40, box.x + box.width - 40);
    await expect(slide(page, 1)).toBeVisible();

    // The arrows stay available, so swiping is never the only way to navigate.
    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(slide(page, 2)).toBeVisible();
  });
});

// The photo order shown in the item form, read from the previews' alternative text.
const formOrder = page => page.getByRole('list', { name: 'Photos' }).getByRole('img').evaluateAll(images => images.map(image => image.alt));
const tile = (page, name) => page.getByRole('list', { name: 'Photos' }).getByRole('listitem').filter({ has: page.getByRole('img', { name }) });
const photoIds = async (request, item) => (await (await request.get(`/api/items/${item.id}`)).json()).photos.map(photo => photo.id);

async function editPhotos(page, item) {
  await page.goto(`/items/${item.id}/edit`);
  await page.mouse.move(600, 400);
  await expect(page.getByRole('list', { name: 'Photos' }).getByRole('img')).not.toHaveCount(0);
}

test('the cover is chosen and photos are reordered in the item form', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 3);
  const [, , third] = await photoIds(request, item);

  await editPhotos(page, item);
  await expect.poll(() => formOrder(page)).toEqual(['photo-1.png', 'photo-2.png', 'photo-3.png']);
  await expect(tile(page, 'photo-1.png')).toContainText('Cover');
  await expect(page.getByRole('button', { name: 'Make photo-1.png the cover photo' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Move photo photo-1.png left' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move photo photo-3.png right' })).toBeDisabled();

  await page.getByRole('button', { name: 'Make photo-3.png the cover photo' }).click();
  await expect.poll(() => formOrder(page)).toEqual(['photo-3.png', 'photo-1.png', 'photo-2.png']);
  await expect(tile(page, 'photo-3.png')).toContainText('Cover');
  await expect(tile(page, 'photo-1.png')).not.toContainText('Cover');
  await page.getByRole('button', { name: 'Save item' }).click();

  // The details carousel opens on the new cover, and the Items list shows it as the thumbnail.
  await expect(page).toHaveURL(`/items/${item.id}`);
  await expect(slide(page, 3)).toBeVisible();
  await expect(page.getByText('1 / 3')).toBeVisible();
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(slide(page, 1)).toBeVisible();
  await page.goto('/items');
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(item.name);
  await expect(page.getByRole('img', { name: item.name })).toHaveAttribute('src', `/api/photos/${third}`);

  // Left and right moves, also from the keyboard, persist across a reload.
  await editPhotos(page, item);
  await page.getByRole('button', { name: 'Move photo photo-2.png left' }).click();
  await expect.poll(() => formOrder(page)).toEqual(['photo-3.png', 'photo-2.png', 'photo-1.png']);
  await expect(page.getByRole('button', { name: 'Move photo photo-2.png left' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => formOrder(page)).toEqual(['photo-2.png', 'photo-3.png', 'photo-1.png']);
  await page.getByRole('button', { name: 'Move photo photo-3.png right' }).click();
  await expect.poll(() => formOrder(page)).toEqual(['photo-2.png', 'photo-1.png', 'photo-3.png']);
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(`/items/${item.id}`);
  await expect(slide(page, 2)).toBeVisible();
  await page.reload();
  await expect(slide(page, 2)).toBeVisible();
  await editPhotos(page, item);
  await expect.poll(() => formOrder(page)).toEqual(['photo-2.png', 'photo-1.png', 'photo-3.png']);
});

test('a newly selected photo can become the cover before it is uploaded', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 2);

  await editPhotos(page, item);
  await page.getByLabel('Add photos').setInputFiles({ name: 'photo-9.png', mimeType: 'image/png', buffer: photoBytes });
  await expect(page.getByText('1 photo ready to upload.')).toBeVisible();
  await expect(tile(page, 'photo-9.png')).toContainText('Not saved');
  await page.getByRole('button', { name: 'Make photo-9.png the cover photo' }).click();
  await expect.poll(() => formOrder(page)).toEqual(['photo-9.png', 'photo-1.png', 'photo-2.png']);
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page).toHaveURL(`/items/${item.id}`);
  await expect(slide(page, 9)).toBeVisible();
  await expect(page.getByText('1 / 3')).toBeVisible();
});

test('deleting the cover makes the next photo the cover', async ({ page, request }) => {
  const item = await itemWithPhotos(request, 3);

  await editPhotos(page, item);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete photo photo-1.png' }).click();
  await expect(tile(page, 'photo-1.png')).toHaveCount(0);
  await expect(tile(page, 'photo-2.png')).toContainText('Cover');
  await expect(page.getByRole('button', { name: 'Move photo photo-2.png left' })).toBeDisabled();

  await page.goto(`/items/${item.id}`);
  await expect(slide(page, 2)).toBeVisible();
  await expect(page.getByText('1 / 2')).toBeVisible();
});
