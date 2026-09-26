import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

test('replaces one exact field value after a reviewed preview and confirmation', async ({ page, request }) => {
  const categoryName = unique('Workshop');
  const category = await createCategory(request, categoryName, [{ name: 'Brand', type: 'text' }]);
  const [brand] = await (await request.get(`/api/categories/${category.id}/fields`)).json();
  const from = unique('Garage');
  const to = unique('KP Garage');
  const partial = `TP ${from}`;
  const add = data => createItem(request, { category_id: category.id, name: unique('Item'), ...data });
  const box = await add({ name: unique('Box'), location: from });
  const camera = await add({ name: unique('Camera'), parent_item_id: box.id });
  const drill = await add({ name: unique('Drill'), location: from.toUpperCase() });
  const lamp = await add({ name: unique('Lamp'), location: partial });
  const tent = await add({ name: unique('Tent'), location: to });
  const speaker = await add({ name: unique('Speaker'), field_values: { [brand.id]: 'Creative' } });

  await page.goto('/data');
  await page.mouse.move(600, 400);
  const card = page.getByRole('region', { name: 'Replace field value' });
  await expect(card.getByLabel('Field', { exact: true })).toHaveValue('core:location');

  // The current value is picked from the saved values, each shown with how many items use it. A value
  // typed in full is not offered back, so only the start of it is typed.
  const current = card.getByLabel('Current value');
  await current.fill(from.slice(0, -1));
  await card.getByRole('option', { name: `${from} 2`, exact: true }).click();
  await expect(current).toHaveValue(from);
  await card.getByLabel('New value').fill(to);
  await card.getByRole('button', { name: 'Preview changes' }).click();

  // The preview names every affected item, warns about the existing target, and changes nothing yet.
  const preview = card.getByRole('region', { name: 'Preview' });
  await expect(preview.getByText('2 items will be changed.')).toBeVisible();
  await expect(preview.getByText(`"${to}" is already used by 1 item.`)).toBeVisible();
  const rows = preview.getByRole('table', { name: 'Affected items' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: box.name })).toContainText(categoryName);
  await expect(rows.filter({ hasText: drill.name })).toContainText(from.toUpperCase());
  await expect(rows.filter({ hasText: lamp.name })).toHaveCount(0);
  expect((await (await request.get(`/api/items/${box.id}`)).json()).location).toBe(from);

  await preview.getByRole('button', { name: 'Replace in 2 items' }).click();
  await expect(card.getByRole('status')).toHaveText('The value was replaced in 2 items.');
  await expect(preview).toBeHidden();

  const saved = async item => (await request.get(`/api/items/${item.id}`)).json();
  expect((await saved(box)).location).toBe(to);
  expect((await saved(drill)).location).toBe(to);
  expect((await saved(lamp)).location).toBe(partial);
  // The item inside the box follows the box without its own row being rewritten.
  const inside = await saved(camera);
  expect(inside.location).toBeNull();
  expect(inside.effective_location).toBe(to);

  // A custom field is chosen together with its category, and a value no item has cannot be applied.
  await card.getByLabel('Field', { exact: true }).selectOption({ label: `Brand (${categoryName})` });
  await card.getByLabel('Current value').fill('Nikon');
  await card.getByLabel('New value').fill('Canon');
  await card.getByRole('button', { name: 'Preview changes' }).click();
  await expect(preview.getByText(`Only the Brand field of the ${categoryName} category`)).toBeVisible();
  await expect(preview.getByText('No items have this value, so nothing would be changed.')).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Replace in 0 items' })).toBeDisabled();

  await card.getByLabel('Current value').fill('creative');
  await card.getByRole('button', { name: 'Preview changes' }).click();
  await preview.getByRole('button', { name: 'Replace in 1 item' }).click();
  await expect(card.getByRole('status')).toHaveText('The value was replaced in 1 item.');
  expect((await saved(speaker)).fields.find(field => field.id === brand.id).value).toBe('Canon');

  // The suite shares one database: removing this category and its items keeps the Dashboard
  // category ranking that later specs rely on unchanged.
  for (const item of [camera, box, drill, lamp, tent, speaker]) {
    expect((await request.delete(`/api/items/${item.id}`)).ok()).toBeTruthy();
  }
  expect((await request.delete(`/api/categories/${category.id}`)).ok()).toBeTruthy();
});
