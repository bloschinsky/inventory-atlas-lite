import { expect, test } from './fixtures.js';
import { createCategory, createItem, detail, unique } from './helpers.js';

/*
  The Location field suggests the locations already in use, from the application rather than the
  browser's form history. Every location here starts with one unique token, so typing the token
  filters out what other tests saved in the shared database.
*/
async function seed(request) {
  const token = unique('Loc').replace(/\W/g, '');
  const categoryName = unique('Placed');
  const category = await createCategory(request, categoryName);
  const add = (name, location, parent) => createItem(request, { name: unique(name), category_id: category.id, location, parent_item_id: parent?.id });
  const shelf = await add('Shelf', `${token} Garage`);
  await add('Bike', `${token} garage `);
  await add('Lamp', `${token} Attic`);
  // The shelf's contents keep a stale own location, which nobody sees and nobody is offered.
  const box = await add('Box', `${token} Old flat`, shelf);
  await add('Drill', `${token} Old flat`, box);
  // A retired item's location is no longer in use.
  const sofa = await add('Sofa', `${token} Basement`);
  const retired = await request.patch(`/api/items/${sofa.id}/lifecycle`, { data: { status: 'retired', reason: 'sold' } });
  expect(retired.ok()).toBeTruthy();
  return { token, categoryName };
}

async function startItem(page, categoryName) {
  await page.goto('/items/new');
  await page.getByLabel('Name *').fill(unique('Ladder'));
  await page.getByLabel('Category *').selectOption({ label: categoryName });
}

const location = page => page.getByLabel('Location', { exact: true });
const options = page => page.getByRole('listbox').getByRole('option');

test('Location suggests the locations in use and still accepts a new one', async ({ page, request }) => {
  const { token, categoryName } = await seed(request);
  await startItem(page, categoryName);
  await page.mouse.move(600, 400);

  // The field is the application's own combobox, not the browser's autofill.
  await expect(location(page)).toHaveAttribute('role', 'combobox');
  await expect(location(page)).toHaveAttribute('autocomplete', 'off');

  // Focusing the empty field already offers locations.
  await location(page).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(location(page)).toHaveAttribute('aria-expanded', 'true');

  // Typing filters them: spellings differing in case are one entry, the most used first, and the
  // nested and retired items add nothing.
  await location(page).fill(token.toLowerCase());
  await expect(options(page)).toHaveText([`${token} Garage`, `${token} Attic`]);

  // The keyboard picks a suggestion without submitting the form.
  await location(page).press('ArrowDown');
  await location(page).press('ArrowDown');
  await location(page).press('Enter');
  await expect(location(page)).toHaveValue(`${token} Attic`);
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page).toHaveURL(/\/items\/new$/);

  // Escape closes the list, and the mouse picks the exact value.
  await location(page).fill(token);
  await expect(options(page)).toHaveCount(2);
  await location(page).press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await location(page).fill(`${token} G`);
  await page.getByRole('option', { name: `${token} Garage` }).click();
  await expect(location(page)).toHaveValue(`${token} Garage`);
  await expect(location(page)).toBeFocused();

  // Clearing and typing a brand new location saves it as typed.
  const shed = `${token} Shed`;
  await location(page).fill('');
  await location(page).fill(shed);
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, 'Location')).toHaveText(shed);

  // It is offered for the next item.
  await startItem(page, categoryName);
  await location(page).fill(`${token} S`);
  await expect(options(page)).toHaveText([shed]);
});

test('a failed suggestion request leaves Location a plain text field', async ({ page, request }) => {
  const { token, categoryName } = await seed(request);
  await page.route('**/api/items/location-suggestions**', route => route.fulfill({ status: 500, json: { error: { code: 'INTERNAL' } } }));
  await startItem(page, categoryName);
  await location(page).click();
  await location(page).fill(`${token} Garage`);
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(detail(page, 'Location')).toHaveText(`${token} Garage`);
});

test.describe('on a phone', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a tap on a suggestion fills Location without saving the item', async ({ page, request }) => {
    const { token, categoryName } = await seed(request);
    await startItem(page, categoryName);
    await location(page).tap();
    await location(page).fill(token);
    await expect(options(page)).toHaveText([`${token} Garage`, `${token} Attic`]);
    // Options are comfortably tall for a finger.
    expect((await options(page).first().boundingBox()).height).toBeGreaterThanOrEqual(44);

    await page.getByRole('option', { name: `${token} Attic` }).tap();
    await expect(location(page)).toHaveValue(`${token} Attic`);
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(page).toHaveURL(/\/items\/new$/);

    // A tap elsewhere closes an open list and keeps the typed text.
    await location(page).fill(token);
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('heading', { level: 2 }).first().tap();
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(location(page)).toHaveValue(token);
  });

  test('the list opens above the field when the keyboard leaves no room below it', async ({ page, request }) => {
    const { token, categoryName } = await seed(request);
    await startItem(page, categoryName);
    // A short viewport stands in for the part of the page the software keyboard leaves visible.
    await page.setViewportSize({ width: 390, height: 420 });
    await location(page).evaluate(field => window.scrollBy({ top: field.getBoundingClientRect().bottom - window.innerHeight + 16, behavior: 'instant' }));
    await location(page).tap();
    await location(page).fill(token);
    const list = page.getByRole('listbox');
    await expect(options(page)).toHaveCount(2);

    const field = await location(page).boundingBox();
    const box = await list.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(field.y + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await page.getByRole('option', { name: `${token} Garage` }).tap();
    await expect(location(page)).toHaveValue(`${token} Garage`);
  });
});
