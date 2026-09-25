import { expect, test } from '@playwright/test';
import { createCategory, detail, unique } from './helpers.js';

const fields = [{ name: 'Brand', type: 'text' }, { name: 'Year', type: 'number' }, { name: 'Insured', type: 'boolean' }];

test('creates an item, finds it in the list, and edits its values', async ({ page, request }) => {
  const categoryName = unique('Cameras');
  await createCategory(request, categoryName, fields);
  const itemName = unique('Rangefinder');

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Condition').fill('Good');
  await page.getByLabel('Location').fill('Shelf A');
  await page.getByLabel('Purchase Date').fill('2024-11-18');
  await page.getByLabel('Purchase Price', { exact: true }).fill('49.99');
  await page.getByLabel('Purchase Price currency').selectOption('USD');
  await page.getByLabel('Serial Number').fill('000123ABC-09');
  await page.getByLabel('Description').fill('Bought second hand.');
  await page.getByLabel('Brand').fill('Nikon');
  await page.getByLabel('Year').fill('1985');
  await page.getByLabel('Insured').selectOption('1');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

  // Find the saved item again through the list search and the category filter.
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill('000123ABC-09');
  await expect(page.getByRole('link', { name: itemName, exact: true })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);

  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill('');
  await page.getByLabel('Category').selectOption({ label: categoryName });
  await expect(page.getByRole('link', { name: itemName, exact: true })).toBeVisible();

  await page.getByRole('link', { name: itemName, exact: true }).click();
  await expect(detail(page, 'Condition')).toHaveText('Good');
  await expect(detail(page, 'Location')).toHaveText('Shelf A');
  await expect(detail(page, 'Purchase Date')).toContainText('2024');
  await expect(detail(page, 'Purchase Price')).toHaveText('$49.99');
  await expect(detail(page, 'Serial Number')).toHaveText('000123ABC-09');
  await expect(detail(page, 'Description')).toHaveText('Bought second hand.');
  await expect(detail(page, 'Brand')).toHaveText('Nikon');
  await expect(detail(page, 'Year')).toHaveText('1985');
  await expect(detail(page, 'Insured')).toHaveText('Yes');

  const renamed = `${itemName} restored`;
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue(itemName);
  await page.getByLabel('Name *').fill(renamed);
  await page.getByLabel('Condition').fill('Excellent');
  await page.getByLabel('Purchase Price', { exact: true }).fill('39.50');
  await page.getByLabel('Purchase Price currency').selectOption('EUR');
  await page.getByLabel('Serial Number').fill('12A/9382-B');
  await page.getByLabel('Year').fill('1987');
  await page.getByLabel('Insured').selectOption('0');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: renamed })).toBeVisible();
  await expect(detail(page, 'Condition')).toHaveText('Excellent');
  await expect(detail(page, 'Purchase Price')).toHaveText('€39.50');
  await expect(detail(page, 'Serial Number')).toHaveText('12A/9382-B');
  await expect(detail(page, 'Year')).toHaveText('1987');
  await expect(detail(page, 'Insured')).toHaveText('No');
});

test('deletes an item and removes it from the list', async ({ page, request }) => {
  const categoryName = unique('Tools');
  const category = await createCategory(request, categoryName);
  const itemName = unique('Drill');
  await request.post('/api/items', { data: { name: itemName, category_id: category.id } });

  await page.goto('/items');
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(itemName);
  await page.getByRole('link', { name: itemName, exact: true }).click();
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL('/items');
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(itemName);
  await expect(page.getByText('No matching items')).toBeVisible();
});

test('records where an item was transferred, suggests it again, and clears it', async ({ page, request }) => {
  const categoryName = unique('Tools');
  await createCategory(request, categoryName);
  const itemName = unique('Drill');
  const person = unique('Vasyl');
  const badge = page.getByText(`Transferred to: ${person}`);

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Location').fill('Garage');
  await page.getByLabel('Transferred To').fill(person);
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  await expect(badge).toBeVisible();
  await expect(detail(page, 'Location')).toHaveText('Garage');

  // The item list shows the same badge, and the normal search finds the item by that value.
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(person);
  await expect(page.getByRole('link', { name: itemName, exact: true })).toBeVisible();
  await expect(badge.filter({ visible: true })).toBeVisible();

  // Another item is offered the saved value, and picking it is optional.
  await page.goto('/items/new');
  await page.getByLabel('Transferred To').click();
  await page.getByLabel('Transferred To').fill(person.slice(0, 8));
  await expect(page.getByRole('option', { name: person })).toBeVisible();
  await page.keyboard.press('Escape');

  // Clearing the field removes the badge and leaves the location untouched.
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(itemName);
  await page.getByRole('link', { name: `Edit ${itemName}` }).filter({ visible: true }).click();
  await expect(page.getByLabel('Transferred To')).toHaveValue(person);
  await page.getByLabel('Transferred To').fill('');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  await expect(page.getByText('Transferred to:')).toHaveCount(0);
  await expect(detail(page, 'Location')).toHaveText('Garage');
});
