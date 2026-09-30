import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const phone = { width: 390, height: 844 };
const pageWidth = page => page.locator('body').evaluate(body => body.ownerDocument.documentElement.scrollWidth);

async function createChecklist(request, data) {
  const response = await request.post('/api/checklists', { data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('creates a checklist, runs it, completes it, and runs it again without touching the history', async ({ page, request }) => {
  const prefix = unique('Trip');
  const category = await createCategory(request, unique('Film cameras'));
  const [camera, lens, flash] = await Promise.all(['Nikon F100', '50mm lens', 'SB-28 flash']
    .map(name => createItem(request, { name: `${prefix} ${name}`, category_id: category.id, location: 'Shelf A' })));
  const checklistName = unique('Film Trip Kit');

  await page.goto('/checklists');
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Add checklist' }).click();
  await page.getByLabel('Name *').fill(checklistName);
  await page.getByLabel('Description').fill('Weekend in the mountains');
  await page.getByText('Packing', { exact: true }).click();

  // Several items are added from one search without leaving the form; the context tells them apart.
  await page.getByLabel('Add inventory items').fill(prefix);
  await expect(page.getByRole('button', { name: `Add ${camera.name}` })).toBeVisible();
  await expect(page.getByText(`${category.name} · Shelf A`).first()).toBeVisible();
  for (const item of [camera, lens, flash]) await page.getByRole('button', { name: `Add ${item.name}` }).click();
  await expect(page.getByRole('button', { name: `Add ${camera.name}` })).toBeDisabled();
  // Reordering with the keyboard-accessible move buttons.
  await page.getByRole('button', { name: `Move ${flash.name} up` }).click();
  const selected = page.getByRole('list', { name: 'Checklist items' }).getByRole('listitem');
  await expect(selected).toHaveCount(3);
  await expect(selected.nth(1)).toContainText(flash.name);
  await page.getByRole('button', { name: 'Save checklist' }).click();

  await expect(page.getByRole('heading', { name: checklistName, level: 1 })).toBeVisible();
  const expected = page.getByRole('region', { name: 'Expected items' }).getByRole('listitem');
  await expect(expected).toHaveText([new RegExp(camera.name), new RegExp(flash.name), new RegExp(lens.name)]);
  await page.reload();
  await expect(expected).toHaveText([new RegExp(camera.name), new RegExp(flash.name), new RegExp(lens.name)]);
  await expect(page.getByText('This checklist has not been run yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/\/checklists\/runs\/\d+$/);
  const firstRunUrl = page.url();
  await expect(page.getByText('0 / 3 checked')).toBeVisible();
  await page.getByRole('button', { name: `Mark ${camera.name} as Packed` }).click();
  await page.getByRole('button', { name: `Mark ${flash.name} as Missing` }).click();
  // A mistake is corrected before completion.
  await page.getByRole('button', { name: `Mark ${flash.name} as Packed` }).click();
  await page.getByRole('button', { name: `Mark ${flash.name} as Missing` }).click();
  await page.getByLabel(`Note for ${flash.name}`).fill('Left at home');
  await page.getByLabel(`Note for ${flash.name}`).press('Enter');
  await expect(page.getByText('2 / 3 checked')).toBeVisible();

  // Every change is already saved: a reload shows the same progress.
  await page.reload();
  await expect(page.getByText('2 / 3 checked')).toBeVisible();
  await expect(page.getByRole('button', { name: `Mark ${camera.name} as Packed` })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: `Mark ${flash.name} as Missing` })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(`Note for ${flash.name}`)).toHaveValue('Left at home');
  await expect(page.getByText('Packed: 1')).toBeVisible();
  await expect(page.getByText('Missing: 1')).toBeVisible();
  await expect(page.getByText('Pending: 1')).toBeVisible();

  // Pending items are confirmed explicitly; dismissing keeps the run open.
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Complete checklist' }).click();
  await expect(page.getByRole('button', { name: 'Complete checklist' })).toBeVisible();
  let message = '';
  page.once('dialog', dialog => { message = dialog.message(); dialog.accept(); });
  await page.getByRole('button', { name: 'Complete checklist' }).click();
  await expect(page.getByText(/This run is completed/)).toBeVisible();
  expect(message).toBe('1 item is still pending.\nComplete this run anyway?');
  await expect(page.getByRole('button', { name: `Mark ${camera.name} as Packed` })).toHaveCount(0);
  await expect(page.getByText('Note: Left at home')).toBeVisible();

  // The history lists the completed run with its result.
  await page.getByRole('link', { name: 'Back to checklist' }).click();
  const history = page.getByRole('region', { name: 'Run history' });
  await expect(history.getByRole('row')).toHaveCount(2);
  await expect(history.getByText('Completed')).toBeVisible();
  await expect(history.getByText('Packed: 1')).toBeVisible();
  await expect(history.getByText('Missing: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(page).toHaveURL(/\/checklists\/runs\/\d+$/);
  expect(page.url()).not.toBe(firstRunUrl);
  await expect(page.getByText('0 / 3 checked')).toBeVisible();
  await expect(page.getByRole('button', { name: `Mark ${camera.name} as Pending` })).toHaveAttribute('aria-pressed', 'true');

  // The earlier run is still exactly as it was completed.
  await page.goto(firstRunUrl);
  await expect(page.getByText('2 / 3 checked')).toBeVisible();
  await expect(page.getByText(/This run is completed/)).toBeVisible();

  await page.goto('/checklists');
  await page.mouse.move(600, 400);
  const card = page.getByRole('article', { name: checklistName });
  await expect(card.getByText('Packing')).toBeVisible();
  await expect(card.getByText('3 items')).toBeVisible();
  await expect(card.getByText('In progress')).toBeVisible();
});

test('verification runs say Present, deleted items stay visible, and deleted checklists keep their runs', async ({ page, request }) => {
  const category = await createCategory(request, unique('Shelf'));
  const tripod = await createItem(request, { name: unique('Tripod'), category_id: category.id });
  const meter = await createItem(request, { name: unique('Light meter'), category_id: category.id });
  const checklist = await createChecklist(request, {
    name: unique('Camera shelf'), mode: 'verification', items: [{ item_id: tripod.id }, { item_id: meter.id }]
  });

  await page.goto(`/checklists/${checklist.id}`);
  await page.mouse.move(600, 400);
  await expect(page.getByText('Verification', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: `Mark ${tripod.name} as Present` }).click();
  await expect(page.getByRole('button', { name: `Mark ${tripod.name} as Present` })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Present: 1')).toBeVisible();
  const runUrl = page.url();

  // Deleting an inventory item is not blocked by the checklist, which then shows it as deleted.
  expect((await request.delete(`/api/items/${meter.id}`)).ok()).toBeTruthy();
  await page.goto(`/checklists/${checklist.id}`);
  const expected = page.getByRole('region', { name: 'Expected items' });
  await expect(expected.getByRole('listitem').nth(1)).toContainText(meter.name);
  await expect(expected.getByRole('listitem').nth(1).getByText('Deleted item', { exact: true })).toBeVisible();
  await expect(page.getByText('Deleted items are skipped when a run starts.')).toBeVisible();
  // The run keeps the deleted item under its snapshot name.
  await page.goto(runUrl);
  await expect(page.getByText(meter.name)).toBeVisible();
  await expect(page.getByText('Deleted from inventory')).toBeVisible();

  // Deleting the checklist keeps the run as history of a deleted checklist.
  await page.goto('/checklists');
  await page.mouse.move(600, 400);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete ${checklist.name}` }).click();
  await expect(page.getByRole('article', { name: checklist.name })).toHaveCount(0);
  const orphaned = page.getByRole('region', { name: 'Runs of deleted checklists' });
  await expect(orphaned.getByText(checklist.name)).toBeVisible();
  await orphaned.getByRole('row').filter({ hasText: checklist.name }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: checklist.name, level: 1 })).toBeVisible();
  await expect(page.getByText('The checklist of this run was deleted; the run is kept as history.')).toBeVisible();
});

test('audits a container and records Last verified only for Present items', async ({ page, request }) => {
  const category = await createCategory(request, unique('Audit gear'));
  const box = await createItem(request, { name: unique('Box B4'), category_id: category.id, location: 'Garage' });
  const inside = name => createItem(request, { name: `${box.name} ${name}`, category_id: category.id, parent_item_id: box.id });
  const [camera, lens, pouch] = [await inside('Camera'), await inside('Lens'), await inside('Pouch')];
  const cable = await createItem(request, { name: `${box.name} Cable`, category_id: category.id, parent_item_id: pouch.id });

  await page.goto(`/items/${camera.id}`);
  await page.mouse.move(600, 400);
  await expect(detail(page, 'Last verified')).toHaveText('Never');

  await page.goto(`/items/${box.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'Audit contents' }).click();
  const dialog = page.getByRole('dialog', { name: `Audit ${box.name}` });
  // Direct contents is preselected; the nested scope adds the cable inside the pouch.
  await expect(dialog.getByLabel('Direct contents')).toBeChecked();
  await expect(dialog.getByText('3 items will be checked.')).toBeVisible();
  await dialog.getByLabel('All nested contents').check();
  await expect(dialog.getByText('4 items will be checked.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Start audit' }).click();

  await expect(page).toHaveURL(/\/checklists\/runs\/\d+$/);
  await expect(page.getByRole('heading', { name: `Audit: ${box.name}`, level: 1 })).toBeVisible();
  await expect(page.getByText('Verification · All nested contents')).toBeVisible();
  await expect(page.getByText('0 / 4 checked')).toBeVisible();
  for (const item of [camera, pouch, cable]) await page.getByRole('button', { name: `Mark ${item.name} as Present` }).click();
  await page.getByRole('button', { name: `Mark ${lens.name} as Missing` }).click();
  await expect(page.getByText('4 / 4 checked')).toBeVisible();
  await page.getByRole('button', { name: 'Complete checklist' }).click();
  await expect(page.getByText(/This run is completed/)).toBeVisible();

  await page.getByRole('link', { name: 'Back to container' }).click();
  await expect(page.getByRole('heading', { name: box.name, level: 1 })).toBeVisible();
  const recent = page.getByRole('region', { name: 'Recent audits' });
  await expect(recent.getByText('Completed')).toBeVisible();
  await expect(recent.getByText('Present: 3')).toBeVisible();
  await expect(recent.getByText('Missing: 1')).toBeVisible();

  // Present items show the localized verification time; a Missing item stays never verified.
  await page.goto(`/items/${camera.id}`);
  await expect(detail(page, 'Last verified')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s[AP]M$/);
  await page.goto(`/items/${lens.id}`);
  await expect(detail(page, 'Last verified')).toHaveText('Never');

  // The audit is history, not a reusable checklist.
  await page.goto('/checklists');
  await page.mouse.move(600, 400);
  await expect(page.getByRole('region', { name: 'Audit history' }).getByText(`Audit: ${box.name} · All nested contents`)).toBeVisible();
  await expect(page.getByRole('article', { name: new RegExp(box.name) })).toHaveCount(0);
});

test.describe('narrow screens', () => {
  test.use({ viewport: phone });

  test('an active run is usable at phone width without sideways scrolling', async ({ page, request }) => {
    const category = await createCategory(request, unique('Bag'));
    const item = await createItem(request, { name: unique('Head torch with a rather long descriptive name'), category_id: category.id });
    const checklist = await createChecklist(request, { name: unique('Hiking bag'), mode: 'packing', items: [{ item_id: item.id }] });
    const run = await (await request.post(`/api/checklists/${checklist.id}/runs`)).json();

    await page.goto(`/checklists/runs/${run.id}`);
    const packed = page.getByRole('button', { name: `Mark ${item.name} as Packed` });
    await expect(packed).toBeVisible();
    const box = await packed.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);
    await packed.click();
    await expect(packed).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 / 1 checked')).toBeVisible();
    // Completing a run without pending items asks nothing.
    await page.getByRole('button', { name: 'Complete checklist' }).click();
    await expect(page.getByText(/This run is completed/)).toBeVisible();
    expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);

    await page.goto('/checklists');
    expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);
  });
});
