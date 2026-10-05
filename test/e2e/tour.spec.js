import { expect, test } from '@playwright/test';
import { items, tourItem } from '../../client/src/demo/fixture.js';
import en from '../../client/src/i18n/locales/en.json' with { type: 'json' };
import { demoURL } from './environment.js';

/*
  The guided tour of the public demo, on the built demo inside the landing build (see demo.spec.js).
  The tour drives the real pages, so each step is checked on the page it opened: its address, the
  highlighted `data-tour` target, and the data the step's actions left behind.
*/
const steps = ['welcome', 'categories', 'placement', 'addItem', 'findItem', 'dashboard'];
const titles = steps.map(id => en.tour.steps[id].title);
// Add item opens the edit form of the tour item once it has been saved.
const routes = [/#\/dashboard$/, /#\/categories$/, /#\/hierarchy$/, /#\/items\/(new|\d+\/edit)$/, /#\/items$/, /#\/dashboard$/];
const targets = ['dashboard-summary', 'category-fields', 'hierarchy-tree', 'item-form', 'item-results', 'dashboard-summary'];

const card = page => page.getByRole('dialog', { name: /./ }).filter({ hasText: 'Guided tour' });
const nextButton = page => card(page).getByRole('button', { name: 'Next' });
const spotlight = page => page.locator('.demo-tour-spotlight');
const visibleLinks = (page, name) => page.locator('[data-tour="item-results"]').getByRole('link', { name, exact: true }).filter({ visible: true });
const totalItems = page => page.getByRole('region', { name: 'Total items' });

async function open(page, hash = '#/dashboard') {
  await page.goto(`${demoURL}${hash}`);
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar over the page.
  await page.mouse.move(600, 400);
}

async function startTour(page) {
  await page.getByRole('button', { name: 'Guided tour' }).click();
  await expectStep(page, 0);
}

// A step is shown once its page is open, its target is highlighted, and its actions are done.
async function expectStep(page, index) {
  await expect(page.getByRole('dialog', { name: titles[index] })).toBeVisible();
  await expect(card(page)).toContainText(`Step ${index + 1} of ${steps.length}`);
  await expect(page).toHaveURL(routes[index]);
  // Add item types its values visibly, which takes a few seconds.
  await expect(card(page).getByText('Showing it in the app…')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(`[data-tour="${targets[index]}"]`)).toBeVisible();
  await expect(spotlight(page)).toBeVisible();
}

async function advance(page, index) {
  await nextButton(page).click();
  await expectStep(page, index);
}

test('the tour presents every step on the real demo, and the item it adds shows everywhere', async ({ page }) => {
  await open(page);
  // The tour is an offer, not a gate: the demo starts free, with only the launcher.
  await expect(card(page)).toHaveCount(0);
  await expect(totalItems(page)).toContainText(String(items.length));

  await startTour(page);
  await expect(card(page).getByRole('button', { name: 'Back' })).toBeDisabled();

  await advance(page, 1);
  await expect(page.locator('[data-tour="category-fields"]')).toContainText('Fields for Photography');
  for (const field of ['Mount', 'Format', 'Last tested']) await expect(page.locator('[data-tour="category-fields"]')).toContainText(field);

  await advance(page, 2);
  await expect(page.getByLabel('Search hierarchy')).toHaveValue(tourItem.container);
  const tree = page.locator('[data-tour="hierarchy-tree"]');
  await expect(tree.getByText('Home / Office', { exact: true })).toBeVisible();
  await expect(tree.getByRole('link', { name: 'Nikon F65', exact: true })).toBeVisible();

  // The real Add item form, filled in its own state.
  await advance(page, 3);
  await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name);
  await expect(page.getByLabel('Category *').locator('option:checked')).toHaveText(tourItem.category);
  await expect(page.getByLabel('Condition', { exact: true })).toHaveValue(tourItem.condition);
  await expect(page.getByLabel('Serial Number')).toHaveValue(tourItem.serialNumber);
  await expect(page.getByLabel('Mount')).toHaveValue(tourItem.fields.Mount);
  await expect(page.locator('[data-tour="item-form"]').getByText(tourItem.container, { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: tourItem.photo })).toBeVisible();

  // Next saves through the form; the Items step then filters and searches for it.
  await advance(page, 4);
  await expect(page.getByLabel('Search')).toHaveValue('Nikon');
  await expect(page.getByLabel('Category', { exact: true }).locator('option:checked')).toHaveText('Photography');
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  await expect(visibleLinks(page, 'Nikon F65')).toHaveCount(1);
  await expect(visibleLinks(page, 'Cordless drill')).toHaveCount(0);

  await advance(page, 5);
  await expect(totalItems(page)).toContainText(String(items.length + 1));
  for (const name of ['Explore on your own', 'Reset demo']) await expect(card(page).getByRole('button', { name })).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Get Inventory Atlas Lite' })).toHaveAttribute('href', /inventory-atlas-lite#official-releases$/);
  await expect(card(page).getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', 'https://github.com/bloschinsky/inventory-atlas-lite');
  await expect(nextButton(page)).toHaveCount(0);

  // The saved item is a real demo record: its details show the photo, container, and fields.
  await card(page).getByRole('button', { name: 'Explore on your own' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guided tour' })).toBeFocused();
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByLabel('Search').fill('spare body');
  await visibleLinks(page, tourItem.name).click();
  await expect(page.getByRole('heading', { name: tourItem.name })).toBeVisible();
  await expect(page.getByText(tourItem.serialNumber)).toBeVisible();
  await expect(page.getByRole('link', { name: tourItem.container }).first()).toBeVisible();
  await expect(page.getByText(tourItem.fields.Mount).first()).toBeVisible();
  const photo = page.getByRole('img', { name: new RegExp(tourItem.photo.replace('.', '\\.')) }).first();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('Back and Next never add the item twice, and a restart starts again from the fixture', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await startTour(page);
  for (let index = 1; index <= 4; index++) await advance(page, index);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);

  // Back opens the saved item again instead of a second new one.
  await card(page).getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('dialog', { name: titles[3] })).toBeVisible();
  await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
  await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name);
  await card(page).getByRole('button', { name: 'Back' }).click();
  await expectStep(page, 2);
  await advance(page, 3);
  await expect(page).toHaveURL(/\/edit$/);
  await advance(page, 4);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  await advance(page, 5);
  await expect(totalItems(page)).toContainText(String(items.length + 1));

  // Visitor changes and the tour item are gone when the tour starts again.
  await card(page).getByRole('button', { name: 'Close tour' }).click();
  await open(page, '#/items/new');
  await page.getByLabel('Name *').fill('Visitor lantern');
  await page.getByLabel('Category *').selectOption({ label: 'Travel & Outdoor' });
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Visitor lantern' })).toBeVisible();

  await startTour(page);
  await expect(totalItems(page)).toContainText(String(items.length));
  for (let index = 1; index <= 4; index++) await advance(page, index);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  await page.getByLabel('Search').fill('Visitor');
  await expect(page.getByText('No matching items')).toBeVisible();
});

test('closing the tour returns the demo to free exploration, and Reset demo still works', async ({ page }) => {
  await open(page);
  await startTour(page);
  await advance(page, 1);
  await page.getByRole('button', { name: 'Close tour' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Hierarchy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();

  // Escape closes the card too, even while a step types into the form and holds the focus there.
  await startTour(page);
  await advance(page, 1);
  await advance(page, 2);
  await nextButton(page).click();
  await expect(page.getByLabel('Name *')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('.demo-tour-lock')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page).toHaveURL(`${demoURL}#/dashboard`);
  await expect(totalItems(page)).toContainText(String(items.length));
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByLabel('Search').fill('spare body');
  await expect(page.getByText('No matching items')).toBeVisible();
});

test('the Reset demo of the last step restores the fixture after a completed tour', async ({ page }) => {
  await open(page);
  await startTour(page);
  for (let index = 1; index <= 5; index++) await advance(page, index);
  await expect(totalItems(page)).toContainText(String(items.length + 1));
  await card(page).getByRole('button', { name: 'Reset demo' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page).toHaveURL(`${demoURL}#/dashboard`);
  await expect(totalItems(page)).toContainText(String(items.length));
});

test('a missing target offers Retry and Skip step and never locks the page', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await startTour(page);
  // Simulates a page that no longer renders the step's target.
  await page.evaluate(() => {
    const strip = () => document.querySelectorAll('[data-tour="category-fields"]').forEach(element => element.setAttribute('data-tour', 'hidden'));
    window.tourTestObserver = new MutationObserver(strip);
    window.tourTestObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tour'] });
  });
  await nextButton(page).click();
  const alert = card(page).getByRole('alert');
  await expect(alert).toContainText('This step could not be shown.', { timeout: 15_000 });
  await expect(page.locator('.demo-tour-lock')).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeDisabled();
  // The page itself stays usable.
  await expect(page.getByRole('heading', { name: 'Categories & Fields' })).toBeVisible();

  await page.evaluate(() => {
    window.tourTestObserver.disconnect();
    document.querySelectorAll('[data-tour="hidden"]').forEach(element => element.setAttribute('data-tour', 'category-fields'));
  });
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expectStep(page, 1);

  await page.evaluate(() => {
    const strip = () => document.querySelectorAll('[data-tour="hierarchy-tree"]').forEach(element => element.setAttribute('data-tour', 'hidden'));
    window.tourTestObserver = new MutationObserver(strip);
    window.tourTestObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tour'] });
  });
  await nextButton(page).click();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.tourTestObserver.disconnect());
  await alert.getByRole('button', { name: 'Skip step' }).click();
  await expectStep(page, 3);
});

test('the tour speaks Ukrainian when the interface does', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await open(page);
  await page.getByRole('button', { name: 'Екскурсія' }).click();
  await expect(page.getByRole('dialog', { name: 'Вітаємо в Inventory Atlas Lite' })).toContainText('Крок 1 з 6');
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByRole('dialog', { name: 'Категорії з власними полями' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрити екскурсію' }).click();
  await expect(page.getByRole('button', { name: 'Екскурсія' })).toBeVisible();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the spotlight does not animate and the actions still complete', async ({ page }) => {
    await open(page);
    await startTour(page);
    expect(await spotlight(page).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
    for (let index = 1; index <= 4; index++) await advance(page, index);
    await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the card fits the screen and the whole tour still works', async ({ page }) => {
    await open(page, '#/items');
    await startTour(page);
    const box = await card(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeLessThanOrEqual(844 / 2 + 1);
    for (let index = 1; index <= 5; index++) await advance(page, index);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(totalItems(page)).toContainText(String(items.length + 1));
    await card(page).getByRole('button', { name: 'Explore on your own' }).click();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
  });
});

test('the self-hosted application never shows the public tour', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guided tour' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Demo mode' })).toHaveCount(0);
});
