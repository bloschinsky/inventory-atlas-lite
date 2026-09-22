import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const openQrDialog = async page => {
  await page.getByRole('button', { name: 'QR Code' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'QR Code' })).toBeVisible();
  return dialog;
};

test('opens the QR code of an item from its details page without using the network', async ({ page, request }) => {
  const category = await createCategory(request, unique('Boxes'));
  const item = await createItem(request, { name: unique('Parts box'), category_id: category.id });
  const payload = `ial:item:v1:${item.uuid}`;

  await page.goto(`/items/${item.id}`);
  await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
  // The folded sidebar overlays the page controls while the pointer rests at (0, 0).
  await page.mouse.move(600, 400);

  // The code is generated in the browser: opening the dialog must not request anything at all.
  const requests = [];
  page.on('request', sent => requests.push(sent.url()));
  const dialog = await openQrDialog(page);

  await expect(dialog.getByText(item.name, { exact: true })).toBeVisible();
  await expect(dialog.getByText(payload, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('img', { name: `QR code for ${payload}` })).toBeVisible();
  expect(requests, 'the QR code must be generated locally').toEqual([]);

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
});

test('shows the QR code of the item currently open when moving between item pages', async ({ page, request }) => {
  const category = await createCategory(request, unique('Storage'));
  const box = await createItem(request, { name: unique('Crate'), category_id: category.id });
  const cable = await createItem(request, { name: unique('Cable'), category_id: category.id, parent_item_id: box.id });

  await page.goto(`/items/${cable.id}`);
  await page.mouse.move(600, 400);
  const cableDialog = await openQrDialog(page);
  await expect(cableDialog.getByRole('img', { name: `QR code for ial:item:v1:${cable.uuid}` })).toBeVisible();
  await cableDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('link', { name: box.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: box.name })).toBeVisible();
  const boxDialog = await openQrDialog(page);
  await expect(boxDialog.getByRole('img', { name: `QR code for ial:item:v1:${box.uuid}` })).toBeVisible();
  await expect(boxDialog.getByText(`ial:item:v1:${cable.uuid}`)).toBeHidden();
});
