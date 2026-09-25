import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');
const photoUpload = { name: 'sample-photo.png', mimeType: 'image/png', buffer: fs.readFileSync(fixture) };
const phone = { width: 390, height: 844 };

// Width of the whole document, which must never exceed the viewport on a phone.
const pageWidth = page => page.locator('body').evaluate(body => body.ownerDocument.documentElement.scrollWidth);

test.describe('narrow screens', () => {
  test.use({ viewport: phone });

  test('the offcanvas menu reaches every page, closes, and restores focus', async ({ page }) => {
    await page.goto('/items');
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(menu).toBeVisible();
    // The desktop sidebar is not rendered at this width, not even for assistive technology.
    await expect(page.getByRole('link', { name: 'Categories & Fields' })).toBeHidden();

    await menu.click();
    const panel = page.getByRole('dialog', { name: 'Main navigation' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeFocused();

    await panel.getByRole('link', { name: 'Categories & Fields' }).click();
    await expect(page).toHaveURL('/categories');
    await expect(panel).toBeHidden();

    await menu.click();
    await expect(page.getByRole('link', { name: 'Categories & Fields' })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await page.getByRole('link', { name: 'Data / Backup' }).click();
    await expect(page).toHaveURL('/data');
    await expect(page.getByRole('heading', { name: 'Data / Backup' })).toBeVisible();
  });

  test('the items page shows touch-friendly cards instead of the desktop table', async ({ page, request }) => {
    const category = await createCategory(request, unique('Torches'));
    const itemName = unique('Head torch');
    await createItem(request, { name: itemName, category_id: category.id, condition: 'Good', location: 'Shelf B' });

    await page.goto('/items');
    await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(itemName);
    // Each row action carries the item name, so the plain name link is matched exactly.
    await expect(page.getByRole('link', { name: itemName, exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toBeHidden();
    // Nothing in the layout may make the page scroll sideways on a phone.
    expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);

    await page.getByRole('link', { name: `View ${itemName}` }).click();
    await expect(page).toHaveURL(/\/items\/\d+$/);
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  });

  test('the item name comes before the photo and the photo before the details', async ({ page, request }) => {
    const category = await createCategory(request, unique('Optics'));
    const itemName = unique('Binoculars');
    const item = await createItem(request, { name: itemName, category_id: category.id, description: 'Left in the hallway.' });
    for (let i = 0; i < 2; i++) {
      const response = await request.post(`/api/items/${item.id}/photos`, { multipart: { photos: photoUpload } });
      expect(response.ok()).toBeTruthy();
    }

    await page.goto(`/items/${item.id}`);
    const heading = page.getByRole('heading', { name: itemName });
    const photo = page.getByRole('img', { name: 'sample-photo.png' });
    const details = page.getByRole('heading', { name: 'Details' });
    await expect(photo).toBeVisible();

    const [headingBox, photoBox, detailsBox] = await Promise.all([heading.boundingBox(), photo.boundingBox(), details.boundingBox()]);
    expect(headingBox.y).toBeLessThan(photoBox.y);
    expect(photoBox.y).toBeLessThan(detailsBox.y);
    expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);

    // Several photos are browsed in place, without a thumbnail strip.
    await expect(page.getByText('1 / 2')).toBeVisible();
    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(page.getByText('2 / 2')).toBeVisible();
    await page.getByRole('button', { name: 'Previous photo' }).click();
    await expect(page.getByText('1 / 2')).toBeVisible();

    // Deleting one photo keeps the viewer on the remaining one.
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete photo' }).click();
    await expect(photo).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next photo' })).toBeHidden();
  });

  test('an item without photos keeps the detail layout intact', async ({ page, request }) => {
    const category = await createCategory(request, unique('Cables'));
    const itemName = unique('Patch cable');
    const item = await createItem(request, { name: itemName, category_id: category.id });

    await page.goto(`/items/${item.id}`);
    await expect(page.getByText('No photos for this item yet.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Record information' })).toBeVisible();
    // Storage is only shown for items that really take part in the nesting.
    await expect(page.getByRole('heading', { name: 'Storage' })).toBeHidden();
  });
});
