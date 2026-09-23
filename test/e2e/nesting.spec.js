import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

test('stores an item inside another one and links both directions', async ({ page, request }) => {
  const categoryName = unique('Storage');
  const category = await createCategory(request, categoryName);
  const boxName = unique('Box');
  await createItem(request, { name: boxName, category_id: category.id });
  const cableName = unique('Cable');

  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(cableName);
  await page.getByLabel('Category *').selectOption({ label: categoryName });
  await page.getByPlaceholder('Search an item to store this one in…').fill(boxName);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: boxName }).click();
  await expect(page.getByText(boxName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: cableName })).toBeVisible();
  await expect(detail(page, 'Stored inside')).toHaveText(boxName);

  // Following the parent link shows the child under the container's contents.
  await detail(page, 'Stored inside').getByRole('link').click();
  await expect(page.getByRole('heading', { name: boxName })).toBeVisible();
  await expect(page.getByRole('link', { name: cableName })).toBeVisible();

  await page.getByRole('link', { name: cableName }).click();
  await expect(page.getByRole('heading', { name: cableName })).toBeVisible();

  // The items list names the container on the contained item's row and links to it.
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByPlaceholder('Search name, description, serial number or transferred to…').fill(cableName);
  const row = page.getByRole('row').filter({ hasText: cableName });
  await expect(row.getByRole('link', { name: boxName, exact: true })).toBeVisible();
  await row.getByRole('link', { name: boxName, exact: true }).click();
  await expect(page.getByRole('heading', { name: boxName })).toBeVisible();
});

test('displays the location inherited from the container and restores the own one', async ({ page, request }) => {
  const categoryName = unique('Inherited');
  const category = await createCategory(request, categoryName);
  const shelfLocation = unique('Home');
  const ownLocation = unique('Garage');
  const boxName = unique('Crate');
  const box = await createItem(request, { name: boxName, category_id: category.id, location: shelfLocation });
  const lensName = unique('Lens');
  const lens = await createItem(request, {
    name: lensName, category_id: category.id, location: ownLocation, parent_item_id: box.id
  });

  await page.goto(`/items/${lens.id}`);
  await expect(detail(page, 'Location')).toContainText(shelfLocation);
  await expect(detail(page, 'Location')).toContainText('inherited from the parent container');

  // The items list shows the same inherited location on the contained item's row.
  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByPlaceholder('Search name, description, serial number or transferred to…').fill(lensName);
  await expect(page.getByRole('row').filter({ hasText: lensName })).toContainText(shelfLocation);

  // Editing still works on the item's own saved location, and removing the container shows it again.
  await page.goto(`/items/${lens.id}/edit`);
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue(ownLocation);
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: lensName })).toBeVisible();
  await expect(detail(page, 'Location')).toContainText(ownLocation);
  await expect(detail(page, 'Location')).not.toContainText('inherited from the parent container');
});
