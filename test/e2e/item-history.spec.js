import { expect, test } from './fixtures.js';
import { createCategory, createItem, detail, openItemActions, unique } from './helpers.js';

const historyCard = page => page.getByRole('region', { name: 'History' });
// Makes the item page taller than a 500 px window. PUT replaces the item, so a test that edits the
// item must send it again, or the page becomes short and stops scrolling.
const longDescription = 'A long description. '.repeat(120);

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
  await expect(page.getByRole('dialog', { name: 'Item History' })).toBeVisible();
  const timeline = page.getByRole('list', { name: 'History' });
  await expect(timeline.getByRole('heading')).toHaveText(['Lent to Olena', 'Returned from Volodia', 'Lent to Volodia']);
  await page.getByText('Locations', { exact: true }).click();
  await expect(page.getByText('No changes of this kind recorded yet.')).toBeVisible();
  await page.getByText('Transfers', { exact: true }).click();
  await expect(timeline.getByRole('heading')).toHaveCount(3);
  await expect(page.getByText(/Earlier changes are not shown/)).toBeVisible();
});

test('an item on loan is returned before it is retired, and History shows the retirement and restoration', async ({ page, request }) => {
  const category = await createCategory(request, unique('Lifecycle'));
  const garage = unique('Garage');
  const boxName = unique('Box');
  const box = await createItem(request, { name: boxName, category_id: category.id, location: garage });
  const drillName = unique('Drill');
  const drill = await createItem(request, { name: drillName, category_id: category.id, parent_item_id: box.id });
  const lent = await request.post(`/api/items/${drill.id}/transfers`, { data: { recipient: 'Volodia' } });
  expect(lent.status()).toBe(201);

  // A container with something on loan inside it is not retired.
  await page.goto(`/items/${box.id}`);
  await page.mouse.move(600, 400);
  await openItemActions(page);
  await page.getByRole('button', { name: 'Retire item' }).click();
  const boxDialog = page.getByRole('dialog', { name: `Retire ${boxName}` });
  await boxDialog.getByLabel('Reason').selectOption({ label: 'Sold' });
  await boxDialog.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(boxDialog.getByRole('alert')).toHaveText('1 item here is still on loan. Mark it as returned before retiring it.');
  await boxDialog.getByRole('button', { name: 'Cancel' }).click();

  // The loaned item itself says why, and offers no confirmation until the loan is closed.
  await page.goto(`/items/${drill.id}`);
  await page.mouse.move(600, 400);
  await openItemActions(page);
  await page.getByRole('button', { name: 'Retire item' }).click();
  const drillDialog = page.getByRole('dialog', { name: `Retire ${drillName}` });
  await expect(drillDialog.getByRole('alert')).toHaveText('This item is on loan to Volodia. Mark it as returned before retiring it.');
  await expect(drillDialog.getByRole('button', { name: 'Retire', exact: true })).toBeDisabled();
  await drillDialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('region', { name: 'Loan' }).getByRole('button', { name: 'Mark as returned' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as returned' }).click();
  await expect(page.getByRole('region', { name: 'Loan' })).toBeHidden();

  await openItemActions(page);
  await page.getByRole('button', { name: 'Retire item' }).click();
  await drillDialog.getByLabel('Reason').selectOption({ label: 'Lost' });
  await drillDialog.getByRole('button', { name: 'Retire', exact: true }).click();
  await expect(drillDialog).toBeHidden();
  const retired = historyCard(page).getByRole('listitem').first();
  await expect(retired.getByRole('heading', { name: 'Retired: Lost' })).toBeVisible();
  await expect(retired.getByText(`Last location: ${garage}`)).toBeVisible();
  await expect(retired.getByText(`Taken out of ${boxName}`)).toBeVisible();
  // A retired item is not lent.
  await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toHaveCount(0);

  await openItemActions(page);
  await page.getByRole('button', { name: 'Restore to inventory' }).click();
  const restore = page.getByRole('dialog', { name: `Restore ${drillName}` });
  await restore.getByRole('button', { name: 'Restore to inventory' }).click();
  await expect(restore).toBeHidden();
  await expect(historyCard(page).getByRole('listitem').first().getByRole('heading', { name: 'Restored to inventory' })).toBeVisible();

  await historyCard(page).getByRole('link', { name: 'View full history' }).click();
  await page.getByText('Lifecycle', { exact: true }).click();
  await expect(page.getByRole('list', { name: 'History' }).getByRole('heading')).toHaveText(['Restored to inventory', 'Retired: Lost']);
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
  await expect(page.getByRole('dialog', { name: 'Історія предмета' })).toBeVisible();
  const timeline = page.getByRole('list', { name: 'Історія' });
  await expect(timeline.getByRole('heading', { name: 'Місце змінено' })).toBeVisible();
  await expect(timeline.getByText('Гараж → Горище')).toBeVisible();
  await expect(timeline.getByText(`Переміщено разом із «${boxName}»`)).toBeVisible();
  // The four filters and the timeline fit the phone screen without horizontal scrolling.
  const lastFilter = await page.getByText('Списання', { exact: true }).boundingBox();
  expect(lastFilter.x + lastFilter.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('putting an item to use and regrading it shows one grouped entry and the Condition & Usage filter', async ({ page, request }) => {
  const category = await createCategory(request, unique('Usage'));
  const cameraName = unique('Camera');
  const camera = await createItem(request, { name: cameraName, category_id: category.id, location: 'Office', is_new: true, condition_grade: 'excellent' });

  // Creating the item records nothing: its first state is not a transition.
  await page.goto(`/items/${camera.id}`);
  await page.mouse.move(600, 400);
  await expect(historyCard(page).getByText('No changes recorded yet.')).toBeVisible();

  // One save changes both values: the preview shows one entry with both changes and their badges.
  await page.goto(`/items/${camera.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByRole('checkbox', { name: 'New', exact: true }).uncheck();
  await page.getByLabel('Condition', { exact: true }).selectOption('good');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: cameraName })).toBeVisible();
  const entry = historyCard(page).getByRole('listitem');
  await expect(entry).toHaveCount(1);
  await expect(entry.getByRole('heading')).toHaveText(['Condition changed', 'Usage status changed']);
  await expect(entry.getByText('New → Used')).toBeVisible();
  await expect(entry.getByText('Excellent → Good')).toBeVisible();
  await expect(entry.locator('.badge', { hasText: 'Good' })).toHaveClass(/\bcondition-badge-blue\b/);

  // Notes-only and unchanged saves add nothing.
  await page.goto(`/items/${camera.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByLabel('Condition Notes').fill('Small scuff on the grip');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: cameraName })).toBeVisible();
  await expect(historyCard(page).getByRole('listitem')).toHaveCount(1);

  // Clearing the grade and moving the item in one save stays one entry.
  const moved = await request.put(`/api/items/${camera.id}`, {
    data: { name: cameraName, category_id: category.id, location: 'Attic', is_new: false, condition_grade: null, condition_notes: 'Small scuff on the grip' }
  });
  expect(moved.ok()).toBeTruthy();
  await historyCard(page).getByRole('link', { name: 'View full history' }).click();
  const timeline = page.getByRole('list', { name: 'History' });
  await expect(timeline.getByRole('listitem')).toHaveCount(2);
  await expect(timeline.getByRole('listitem').first().getByRole('heading')).toHaveText(['Condition changed', 'Location changed']);
  await expect(timeline.getByText('Good → Not set')).toBeVisible();

  await page.getByText('Condition & Usage', { exact: true }).click();
  await expect(timeline.getByRole('heading')).toHaveText(['Condition changed', 'Condition changed', 'Usage status changed']);
  await page.getByText('Locations', { exact: true }).click();
  await expect(timeline.getByRole('heading')).toHaveText(['Location changed']);
  await page.getByText('Lifecycle', { exact: true }).click();
  await expect(page.getByText('No changes of this kind recorded yet.')).toBeVisible();
});

test('Load more keeps the events of one save together across a page boundary', async ({ page, request }) => {
  const category = await createCategory(request, unique('Pages'));
  const name = unique('Lens');
  const lens = await createItem(request, { name, category_id: category.id, is_new: true });
  // One save that changes both values, then 19 condition-only saves: the first save's two events
  // straddle the boundary of the 20-event page.
  const both = await request.put(`/api/items/${lens.id}`, { data: { name, category_id: category.id, is_new: false, condition_grade: 'fair' } });
  expect(both.ok()).toBeTruthy();
  for (let index = 0; index < 19; index++) {
    const grade = index % 2 ? 'fair' : 'good';
    const saved = await request.put(`/api/items/${lens.id}`, { data: { name, category_id: category.id, is_new: false, condition_grade: grade } });
    expect(saved.ok()).toBeTruthy();
  }

  await page.goto(`/items/${lens.id}/history`);
  await page.mouse.move(600, 400);
  const timeline = page.getByRole('list', { name: 'History' });
  await expect(timeline.getByRole('listitem')).toHaveCount(20);
  await expect(timeline.getByRole('listitem').last().getByRole('heading')).toHaveText(['Condition changed']);
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden();
  // 21 events from 20 saves: still 20 entries, the oldest joined again with both of its changes.
  await expect(timeline.getByRole('listitem')).toHaveCount(20);
  const oldest = timeline.getByRole('listitem').last();
  await expect(oldest.getByRole('heading')).toHaveText(['Condition changed', 'Usage status changed']);
  await expect(oldest.getByText('Not set → Fair')).toBeVisible();
  await expect(oldest.getByText('New → Used')).toBeVisible();
});

test('Condition and New/Used changes on a phone in Ukrainian, in dark mode', async ({ page, request }) => {
  const category = await createCategory(request, unique('Phone usage'));
  const name = unique('Drill');
  const drill = await createItem(request, { name, category_id: category.id, is_new: true });
  const saved = await request.put(`/api/items/${drill.id}`, { data: { name, category_id: category.id, is_new: false, condition_grade: 'fair' } });
  expect(saved.ok()).toBeTruthy();

  await page.addInitScript(() => {
    localStorage.setItem('inventory-atlas.locale', 'uk');
    localStorage.setItem('inventory-atlas-theme', 'dark');
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/items/${drill.id}/history`);
  const timeline = page.getByRole('list', { name: 'Історія' });
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await expect(timeline.getByRole('heading')).toHaveText(['Стан змінено', 'Статус використання змінено']);
  await expect(timeline.getByText('Новий → Вживаний')).toBeVisible();
  await expect(timeline.getByText('Не вказано → Задовільний')).toBeVisible();
  await page.getByText('Стан і використання', { exact: true }).click();
  await expect(timeline.getByRole('heading')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'Стан і використання' })).toBeChecked();
  // Five filters wrap instead of overflowing the narrowest phone.
  for (const label of ['Усе', 'Місця', 'Передачі', 'Списання', 'Стан і використання']) {
    const box = await page.getByText(label, { exact: true }).boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('View full history opens a dialog over the item page that Back, Forward, Escape, and Close follow', async ({ page, request }) => {
  const category = await createCategory(request, unique('Dialog'));
  const shelfName = unique('Shelf');
  const shelf = await createItem(request, { name: shelfName, category_id: category.id, location: 'Garage' });
  const name = unique('Camera');
  const camera = await createItem(request, { name, category_id: category.id, location: 'Office', description: longDescription });
  const moved = await request.put(`/api/items/${camera.id}`, { data: { name, category_id: category.id, parent_item_id: shelf.id, description: longDescription } });
  expect(moved.ok()).toBeTruthy();

  // A short window, so the item page scrolls before the dialog opens.
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto(`/items/${camera.id}`);
  await page.mouse.move(600, 400);
  const link = historyCard(page).getByRole('link', { name: 'View full history' });
  await link.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await link.click();

  const dialog = page.getByRole('dialog', { name: 'Item History' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${camera.id}/history$`));
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close history' })).toBeFocused();
  await expect(dialog.getByRole('list', { name: 'History' }).getByRole('heading', { name: 'Container changed' })).toBeVisible();
  // One dialog over the same page: the page stays where it was, out of reach, and does not scroll behind it.
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('.page')).toHaveAttribute('inert', '');
  await expect(page.getByRole('heading', { name, level: 1 })).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await page.mouse.wheel(0, -2000);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  // The keyboard stays inside the dialog.
  for (let step = 0; step < 12; step++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);

  // Escape returns to the item; the page kept its scroll and the focus is back on the link.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/items/${camera.id}$`));
  await expect(link).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);

  // Escape went Back, so Forward reopens the dialog and Back closes it again.
  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

  // Close and the backdrop leave no dialog entry behind.
  await link.click();
  await dialog.getByRole('button', { name: 'Close history' }).click();
  await expect(dialog).toBeHidden();
  await link.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/history$/);

  // A link to another item inside the timeline opens that item without the dialog.
  await page.goto(`/items/${camera.id}/history`);
  await dialog.getByRole('link', { name: shelfName }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${shelf.id}$`));
  await expect(page.getByRole('heading', { name: shelfName, level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
});

test('an item opened by its UUID, as a QR scan does, keeps that address and its page under the history dialog', async ({ page, request }) => {
  const category = await createCategory(request, unique('UUID'));
  const name = unique('Scanner');
  const scanner = await createItem(request, { name, category_id: category.id, location: 'Desk', description: longDescription });
  const moved = await request.put(`/api/items/${scanner.id}`, { data: { name, category_id: category.id, location: 'Shelf', description: longDescription } });
  expect(moved.ok()).toBeTruthy();
  expect(scanner.uuid).toMatch(/^[0-9a-f-]{36}$/);
  // Requests for the item itself and its audits, never its history pages.
  const itemReads = [];
  page.on('request', req => {
    const path = new URL(req.url()).pathname;
    if (/^\/api\/items\/[^/]+(\/audits)?$/.test(path)) itemReads.push(path);
  });

  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto(`/items/${scanner.uuid}`);
  await page.mouse.move(600, 400);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const link = historyCard(page).getByRole('link', { name: 'View full history' });
  await link.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  const readsBefore = itemReads.length;

  await link.click();
  const dialog = page.getByRole('dialog', { name: 'Item History' });
  await expect(dialog.getByText('Desk → Shelf')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${scanner.uuid}/history$`));
  // The same page stays underneath: nothing about the item is loaded again.
  expect(itemReads.length).toBe(readsBefore);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/items/${scanner.uuid}$`));
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  await page.goForward();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${scanner.uuid}/history$`));
  await dialog.getByRole('button', { name: 'Close history' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/items/${scanner.uuid}$`));
  expect(itemReads.length).toBe(readsBefore);

  // A directly loaded UUID history address closes to the same UUID address.
  await page.goto(`/items/${scanner.uuid}/history`);
  await dialog.getByRole('button', { name: 'Close history' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${scanner.uuid}$`));
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
});

test('a directly loaded or refreshed history address shows the dialog over its item, and Close replaces it', async ({ page, request }) => {
  const category = await createCategory(request, unique('Direct'));
  const name = unique('Tripod');
  const tripod = await createItem(request, { name, category_id: category.id, location: 'Attic' });
  const moved = await request.put(`/api/items/${tripod.id}`, { data: { name, category_id: category.id, location: 'Cellar' } });
  expect(moved.ok()).toBeTruthy();

  await page.goto('/items');
  await page.goto(`/items/${tripod.id}/history`);
  const dialog = page.getByRole('dialog', { name: 'Item History' });
  await expect(dialog.getByText('Attic → Cellar')).toBeVisible();
  // The item's page is the backdrop, not a blank one.
  await expect(page.getByRole('heading', { name, level: 1, includeHidden: true })).toBeAttached();

  await page.reload();
  await expect(dialog.getByText('Attic → Cellar')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);

  await dialog.getByRole('button', { name: 'Close history' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${tripod.id}$`));
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  // The dialog was replaced, so Back leaves the item instead of reopening it.
  await page.goBack();
  await expect(page).toHaveURL(/\/items$/);
});

test('the history dialog fills a phone screen and keeps its own scroll', async ({ page, request }) => {
  const category = await createCategory(request, unique('Phone dialog'));
  const name = unique('Lamp');
  const lamp = await createItem(request, { name, category_id: category.id, location: 'Room 0' });
  for (let index = 1; index <= 8; index++) {
    const saved = await request.put(`/api/items/${lamp.id}`, { data: { name, category_id: category.id, location: `Room ${index}` } });
    expect(saved.ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/items/${lamp.id}/history`);
  const dialog = page.getByRole('dialog', { name: 'Item History' });
  await expect(dialog.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(8);
  const content = await dialog.locator('.modal-content').boundingBox();
  expect(content).toMatchObject({ x: 0, y: 0, width: 390, height: 700 });
  // The timeline scrolls inside the dialog; the page behind it neither scrolls nor overflows.
  const body = dialog.locator('.modal-body');
  expect(await body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await body.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Close history' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
});
