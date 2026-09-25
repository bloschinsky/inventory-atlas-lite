import { expect, test } from '@playwright/test';
import { createCategory, detail, unique } from './helpers.js';

const fields = [{ name: 'Size', type: 'text' }, { name: 'Max weight', type: 'number' }, { name: 'Sealed', type: 'boolean' }];

const createTemplate = async (request, data) => {
  const response = await request.post('/api/item-templates', { data });
  expect(response.ok(), `POST /api/item-templates returned ${response.status()}`).toBeTruthy();
  return response.json();
};

test('creates, edits, uses, and deletes an item template without linking the item to it', async ({ page, request }) => {
  const categoryName = unique('Boxes');
  await createCategory(request, categoryName, fields);
  const templateName = unique('Cardboard box 5 kg');

  await page.goto('/templates');
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Add template' }).click();
  await expect(page.getByText('These values are defaults for future items.')).toBeVisible();
  await page.getByLabel('Template name *').fill(templateName);
  await page.getByLabel('Default item name').fill('Cardboard box');
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByLabel('Location').fill('Garage');
  await page.getByLabel('Size').fill('40x24x21');
  await page.getByLabel('Max weight').fill('5');
  // A yes/no field may stay unset in a template.
  await expect(page.getByLabel('Sealed')).toHaveValue('');
  await page.getByRole('button', { name: 'Save template' }).click();

  await expect(page).toHaveURL('/templates');
  const row = page.getByRole('row').filter({ hasText: templateName });
  await expect(row).toContainText(categoryName);
  await expect(row).toContainText('Cardboard box');

  // Editing keeps the saved values and changes only what the user changes.
  await page.getByRole('link', { name: `Edit ${templateName}` }).click();
  await expect(page.getByLabel('Location')).toHaveValue('Garage');
  await expect(page.getByLabel('Size')).toHaveValue('40x24x21');
  await page.getByLabel('Condition').fill('New');
  await page.getByLabel('Sealed').selectOption('1');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page).toHaveURL('/templates');

  // Using the template opens the regular Add Item form prefilled; nothing is created yet.
  await page.getByRole('link', { name: `Use ${templateName}` }).click();
  await expect(page).toHaveURL(/\/items\/new\?template=\d+$/);
  await expect(page.getByRole('heading', { name: 'Add item' })).toBeVisible();
  await expect(page.getByText(`Prefilled from the template “${templateName}”.`)).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue('Cardboard box');
  await expect(page.getByLabel('Category *')).toHaveValue(/\d+/);
  await expect(page.getByLabel('Condition')).toHaveValue('New');
  await expect(page.getByLabel('Location')).toHaveValue('Garage');
  await expect(page.getByLabel('Size')).toHaveValue('40x24x21');
  await expect(page.getByLabel('Max weight')).toHaveValue('5');
  await expect(page.getByLabel('Sealed')).toHaveValue('1');

  const itemName = unique('Box');
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Location').fill('Attic');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  await expect(detail(page, 'Location')).toHaveText('Attic');
  await expect(detail(page, 'Size')).toHaveText('40x24x21');
  await expect(detail(page, 'Sealed')).toHaveText('Yes');
  const itemUrl = page.url();

  // Deleting the template leaves the created item untouched.
  await page.getByRole('link', { name: 'Templates', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete ${templateName}` }).click();
  await expect(page.getByRole('row').filter({ hasText: templateName })).toHaveCount(0);
  await page.goto(itemUrl);
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  await expect(detail(page, 'Condition')).toHaveText('New');
  await expect(detail(page, 'Max weight')).toHaveText('5');
});

test('the Add item menu offers a blank item and a template, and saves an item as a new template', async ({ page, request }) => {
  const categoryName = unique('Drives');
  const category = await createCategory(request, categoryName, [{ name: 'Capacity', type: 'text' }]);
  const fieldsResponse = await request.get(`/api/categories/${category.id}/fields`);
  const [capacity] = await fieldsResponse.json();
  const templateName = unique('IronWolf 4 TB');
  await createTemplate(request, {
    name: templateName, category_id: category.id, item_name: 'Seagate IronWolf', field_values: { [capacity.id]: '4 TB' }
  });

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'More ways to add an item' }).click();
  await expect(page.getByRole('link', { name: 'Blank item' })).toBeVisible();
  await page.getByRole('button', { name: 'From template…' }).click();
  const picker = page.getByRole('dialog', { name: 'Add item from template' });
  await picker.getByRole('link', { name: new RegExp(templateName) }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('Seagate IronWolf');
  await expect(page.getByLabel('Capacity')).toHaveValue('4 TB');
  const itemName = unique('Drive');
  await page.getByLabel('Name *').fill(itemName);
  await page.getByLabel('Serial Number').fill('ZDH12345');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

  // Save as template opens the editor prefilled from the item and creates nothing until saved.
  await page.getByRole('link', { name: 'Save as template' }).click();
  await expect(page).toHaveURL(/\/templates\/new\?fromItem=\d+$/);
  await expect(page.getByLabel('Template name *')).toHaveValue(itemName);
  await expect(page.getByLabel('Default item name')).toHaveValue(itemName);
  await expect(page.getByLabel('Serial Number')).toHaveValue('ZDH12345');
  await expect(page.getByLabel('Capacity')).toHaveValue('4 TB');
  expect((await (await request.get('/api/item-templates')).json()).some(template => template.name === itemName)).toBe(false);
  const copyName = unique('Drive preset');
  await page.getByLabel('Template name *').fill(copyName);
  await page.getByLabel('Serial Number').fill('');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page).toHaveURL('/templates');
  await page.getByRole('link', { name: `Edit ${copyName}` }).click();
  await expect(page.getByLabel('Serial Number')).toHaveValue('');
  await expect(page.getByLabel('Capacity')).toHaveValue('4 TB');

  // The blank choice keeps the plain Add Item form.
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'More ways to add an item' }).click();
  await page.getByRole('link', { name: 'Blank item' }).click();
  await expect(page).toHaveURL('/items/new');
  await expect(page.getByLabel('Name *')).toHaveValue('');
});

test('a template with a deleted category stays manageable but cannot be used until repaired', async ({ page, request }) => {
  const doomed = await createCategory(request, unique('Temporary'), [{ name: 'Color', type: 'text' }]);
  const target = await createCategory(request, unique('Archive'));
  const templateName = unique('Archive container');
  await createTemplate(request, { name: templateName, category_id: doomed.id });
  expect((await request.delete(`/api/categories/${doomed.id}`)).ok()).toBeTruthy();

  await page.goto('/templates');
  await page.mouse.move(600, 400);
  const row = page.getByRole('row').filter({ hasText: templateName });
  await expect(row).toContainText('Category missing');
  await expect(page.getByRole('button', { name: `Use ${templateName}` })).toBeDisabled();

  // A direct link to the use flow explains why instead of prefilling anything.
  await page.goto('/items/new?template=' + (await (await request.get('/api/item-templates')).json()).find(entry => entry.name === templateName).id);
  await expect(page.getByRole('alert').filter({ hasText: 'The category of this template no longer exists.' })).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue('');

  await page.goto('/templates');
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: `Edit ${templateName}` }).click();
  await expect(page.getByText('Choose a category to repair the template')).toBeVisible();
  await expect(page.getByLabel('Category *')).toHaveValue('');
  await page.getByLabel('Category *').selectOption({ label: target.name });
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByRole('link', { name: `Use ${templateName}` })).toBeVisible();
});
