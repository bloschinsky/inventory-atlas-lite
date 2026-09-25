import { expect, test } from '@playwright/test';
import { createCategory, detail, unique } from './helpers.js';

test('batch add from JSON previews, edits, and creates a category batch', async ({ page, request }) => {
  const categoryName = unique('Network Gear');
  await createCategory(request, categoryName, [
    { name: 'Brand', type: 'text' },
    { name: 'Ports', type: 'number' },
    { name: 'Working', type: 'boolean' }
  ]);
  const [router, modem, spare] = [unique('Router'), unique('Modem'), unique('Spare')];

  await page.goto('/items');
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar.
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption({ label: categoryName });
  await page.getByRole('button', { name: 'Batch Add from JSON' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Batch Add Items from JSON for ${categoryName}` })).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert Template' }).click();

  // The template is generated from the selected category's current fields.
  const editor = dialog.getByLabel('Item import JSON');
  await expect(editor).toHaveValue(/"Ports": null/);
  const template = JSON.parse(await editor.inputValue());
  expect(template.category).toBe(categoryName);
  expect(Object.keys(template.items[0].customFields)).toEqual(['Brand', 'Ports', 'Working']);

  const blank = template.items[0];
  template.items = [
    { ...blank, name: router, location: 'Rack', purchasePrice: { amount: 1500, currency: 'UAH' }, serialNumber: 'RT-77',
      customFields: { Brand: 'MikroTk', Ports: 5, Working: true } },
    { ...blank, name: modem, customFields: { Brand: 'ZyXEL', Ports: 'four', Working: false } },
    { ...blank, name: spare }
  ];
  await editor.fill(JSON.stringify(template, null, 2));
  await dialog.getByRole('button', { name: 'Preview' }).click();

  const draft = number => dialog.getByRole('region', { name: `Proposed item ${number}` });
  await expect(draft(1).getByLabel('Name *')).toHaveValue(router);
  await expect(draft(3).getByLabel('Name *')).toHaveValue(spare);

  // The invalid number is shown inline and blocks creation until it is corrected.
  await expect(draft(2).getByText('Field "Ports" must be a number.')).toBeVisible();
  const createButton = dialog.getByRole('button', { name: /^Create \d+ Items?$/ });
  await expect(createButton).toBeDisabled();
  await draft(2).getByLabel('Ports').fill('4');
  await draft(1).getByLabel('Brand').fill('MikroTik');

  await dialog.getByRole('button', { name: 'Remove proposed item 3 from the batch' }).click();
  await expect(dialog.getByRole('region', { name: /^Proposed item/ })).toHaveCount(2);
  await expect(createButton).toHaveText('Create 2 Items');
  await createButton.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText(`Created 2 items in ${categoryName}.`);
  await expect(page.getByRole('link', { name: modem, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: spare, exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: router, exact: true }).click();
  await expect(detail(page, 'Location')).toHaveText('Rack');
  await expect(detail(page, 'Purchase Price')).toHaveText('UAH 1,500.00');
  await expect(detail(page, 'Serial Number')).toHaveText('RT-77');
  await expect(detail(page, 'Brand')).toHaveText('MikroTik');
  await expect(detail(page, 'Ports')).toHaveText('5');
  await expect(detail(page, 'Working')).toHaveText('Yes');
});
