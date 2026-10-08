import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const historyCard = page => page.getByRole('region', { name: 'History' });

test('a box move shows in the history of the camera inside it, and taking the camera out asks where it is', async ({ page, request }) => {
  const category = await createCategory(request, unique('History'));
  const garage = unique('Garage');
  const attic = unique('Attic');
  const boxName = unique('Box');
  const box = await createItem(request, { name: boxName, category_id: category.id, location: garage });
  const cameraName = unique('Camera');
  const camera = await createItem(request, { name: cameraName, category_id: category.id, parent_item_id: box.id, location: 'Stale desk' });

  // Move the box to a new location through its form.
  await page.goto(`/items/${box.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByLabel('Location', { exact: true }).fill(attic);
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: boxName })).toBeVisible();
  await expect(historyCard(page).getByText(`${garage} → ${attic}`)).toBeVisible();

  // The camera moved with the box; its history says so and links to the box.
  await page.goto(`/items/${camera.id}`);
  const preview = historyCard(page);
  await expect(preview.getByRole('heading', { name: 'Location changed' })).toBeVisible();
  await expect(preview.getByText(`${garage} → ${attic}`)).toBeVisible();
  await expect(preview.getByText(`Moved together with ${boxName}`)).toBeVisible();

  // Taking the camera out of the box requires choosing its physical location.
  await page.goto(`/items/${camera.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByText('Where is this item now?')).toBeVisible();
  await expect(page.getByRole('radio', { name: `Where it was: ${attic}` })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Its own saved location: Stale desk' })).toBeVisible();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Edit item' })).toBeVisible();
  await page.getByRole('radio', { name: 'No location' }).check();
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: cameraName })).toBeVisible();
  await expect(detail(page, 'Location')).toHaveText('—');
  const entry = historyCard(page).getByRole('listitem').first();
  await expect(entry.getByRole('heading', { name: 'Container changed' })).toBeVisible();
  await expect(entry.getByText(`${boxName} → Top level`)).toBeVisible();
  await expect(entry.getByText(`${attic} → No location`)).toBeVisible();
});

test('lend to Volodia, mark as returned, and lend again; the full history filters transfers', async ({ page, request }) => {
  const category = await createCategory(request, unique('Loans'));
  const cameraName = unique('Camera');
  const camera = await createItem(request, { name: cameraName, category_id: category.id, location: 'Office' });

  await page.goto(`/items/${camera.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Transfer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Recipient').fill('Volodia');
  await dialog.getByLabel('Note').fill('With the charger');
  await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(dialog).toBeHidden();

  const loan = page.getByRole('region', { name: 'Loan' });
  await expect(loan.getByText('On loan to Volodia')).toBeVisible();
  await expect(page.getByText('Transferred to: Volodia')).toBeVisible();
  await expect(historyCard(page).getByText('Lent to Volodia')).toBeVisible();
  await expect(historyCard(page).getByText('Still on loan')).toBeVisible();
  // The loan does not move the item.
  await expect(detail(page, 'Location')).toContainText('Office');

  await loan.getByRole('button', { name: 'Mark as returned' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as returned' }).click();
  await expect(loan).toBeHidden();
  await expect(page.getByText('Transferred to: Volodia')).toBeHidden();
  await expect(historyCard(page).getByText('Returned from Volodia')).toBeVisible();
  await expect(historyCard(page).getByText(/Returned after \d+ minutes?/)).toBeVisible();

  await page.getByRole('button', { name: 'Transfer', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Recipient').fill('Olena');
  await page.getByRole('dialog').getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Loan' }).getByText('On loan to Olena')).toBeVisible();

  await historyCard(page).getByRole('link', { name: 'View full history' }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  const timeline = page.getByRole('list', { name: 'History' });
  await expect(timeline.getByRole('heading')).toHaveText(['Lent to Olena', 'Returned from Volodia', 'Lent to Volodia']);
  await page.getByText('Locations', { exact: true }).click();
  await expect(page.getByText('No changes of this kind recorded yet.')).toBeVisible();
  await page.getByText('Transfers', { exact: true }).click();
  await expect(timeline.getByRole('heading')).toHaveCount(3);
  await expect(page.getByText(/Changes made before History was installed are not shown/)).toBeVisible();
});

test('the history timeline on a phone in Ukrainian', async ({ page, request }) => {
  const category = await createCategory(request, unique('Phone'));
  const boxName = unique('Box');
  const box = await createItem(request, { name: boxName, category_id: category.id, location: 'Гараж' });
  const camera = await createItem(request, { name: unique('Camera'), category_id: category.id, parent_item_id: box.id });
  const moved = await request.put(`/api/items/${box.id}`, { data: { name: boxName, category_id: category.id, location: 'Горище' } });
  expect(moved.ok()).toBeTruthy();

  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/items/${camera.id}/history`);
  await expect(page.getByRole('heading', { name: 'Історія' })).toBeVisible();
  const timeline = page.getByRole('list', { name: 'Історія' });
  await expect(timeline.getByRole('heading', { name: 'Місце змінено' })).toBeVisible();
  await expect(timeline.getByText('Гараж → Горище')).toBeVisible();
  await expect(timeline.getByText(`Переміщено разом із «${boxName}»`)).toBeVisible();
  // The timeline fits the phone screen without horizontal scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
