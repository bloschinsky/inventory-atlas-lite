import { expect, test } from './fixtures.js';
import { createCategory, setAiEnabled, unique } from './helpers.js';

/*
  The Batch / AI Add Fields review on phones: one stacked card per proposed field instead of the
  four-column table, and a footer whose primary action takes its own full-width row. The phone sizes
  are 360 and 390 CSS pixels and the iPhone 16 Pro portrait viewport (402 x 874).
*/
const phones = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 402, height: 874 }];
const longName = 'Maximum supported interface standard on the original board';

const fieldDocument = fields => JSON.stringify({ version: 1, fields: fields.map(([name, type]) => ({ name, type, required: false })) });

async function openBatch(page, categoryName) {
  await page.goto('/categories');
  await page.getByRole('button').filter({ hasText: categoryName }).click();
  await page.getByRole('button', { name: 'Batch Add Fields' }).click();
  return page.getByRole('dialog');
}

// Neither the page nor the dialog body may scroll sideways; a mobile browser would also widen its layout viewport.
async function expectNoHorizontalScroll(page, dialog) {
  const { width } = page.viewportSize();
  const [layoutWidth, scrollWidth] = await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
  expect(layoutWidth).toBe(width);
  expect(scrollWidth).toBeLessThanOrEqual(width);
  expect(await dialog.locator('.modal-body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
}

test.beforeEach(async ({ request }) => { await setAiEnabled(request, true); });

test.describe('on a phone in portrait', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of phones) {
    test(`shows every proposed field as a readable card at ${viewport.width}px`, async ({ page, request }) => {
      await page.setViewportSize(viewport);
      const categoryName = unique('Phone Cards');
      await createCategory(request, categoryName, [{ name: 'Brand', type: 'text' }]);
      const dialog = await openBatch(page, categoryName);
      await dialog.getByLabel('Field definition JSON').fill(fieldDocument([
        ['Model', 'text'], ['Brand', 'text'], ['Bus', 'nonsense'], ['Model', 'number'], [longName, 'date']
      ]));
      await dialog.getByRole('button', { name: 'Preview' }).click();

      // No compressed table: each field is a card with a heading, a status, and labelled full-width controls.
      await expect(dialog.getByRole('table')).toHaveCount(0);
      const cards = dialog.getByRole('listitem');
      await expect(cards).toHaveCount(5);
      for (const [index, status] of ['New', 'Already exists', 'Invalid type', 'Duplicate in batch', 'New'].entries()) {
        await expect(cards.nth(index).getByRole('heading', { name: `Proposed field ${index + 1}` })).toBeVisible();
        await expect(cards.nth(index)).toContainText(status);
      }
      await expect(cards.nth(1)).toContainText('Field "Brand" already exists in this category.');

      const card = cards.nth(4);
      await card.scrollIntoViewIfNeeded();
      const name = card.getByRole('textbox', { name: 'Name of proposed field 5' });
      const type = card.getByRole('combobox', { name: 'Type of proposed field 5' });
      await expect(card.getByText('Name', { exact: true })).toBeVisible();
      await expect(card.getByText('Type', { exact: true })).toBeVisible();
      await expect(name).toHaveValue(longName);
      await expect(type).toHaveValue('date');
      const cardBox = await card.boundingBox();
      for (const control of [name, type, card.getByRole('button', { name: 'Remove proposed field 5 from the batch' })]) {
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThan(cardBox.width * 0.8);
        expect(box.height).toBeGreaterThanOrEqual(36);
      }
      await expectNoHorizontalScroll(page, dialog);

      // The footer sits below the scrolling body and inside the viewport; Create has its own full-width row.
      const create = dialog.getByRole('button', { name: /^Create \d+ Field/ });
      await expect(create).toBeDisabled();
      const [body, footer, createBox, cancel, editJson] = await Promise.all([
        dialog.locator('.modal-body').boundingBox(),
        dialog.locator('.modal-footer').boundingBox(),
        create.boundingBox(),
        dialog.getByRole('button', { name: 'Cancel' }).boundingBox(),
        dialog.getByRole('button', { name: 'Edit JSON' }).boundingBox()
      ]);
      expect(footer.y).toBeGreaterThanOrEqual(body.y + body.height - 1);
      expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(createBox.width).toBeGreaterThan(footer.width * 0.85);
      expect(createBox.y).toBeGreaterThan(cancel.y + cancel.height - 1);
      expect(cancel.y).toBe(editJson.y);
    });
  }

  test('reviews, corrects, and creates a batch on an iPhone-sized screen', async ({ page, request }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    const categoryName = unique('Phone Batch');
    const category = await createCategory(request, categoryName, [{ name: 'Brand', type: 'text' }]);
    const dialog = await openBatch(page, categoryName);
    // A long batch: the body scrolls to its last card while the footer stays put.
    const many = Array.from({ length: 12 }, (_, index) => [`Slot ${index + 1}`, 'text']);
    await dialog.getByLabel('Field definition JSON').fill(fieldDocument([['Brand', 'text'], ['Bus', 'nonsense'], ...many]));
    await dialog.getByRole('button', { name: 'Preview' }).click();

    const create = dialog.getByRole('button', { name: /^Create \d+ Field/ });
    await expect(create).toBeDisabled();
    await dialog.getByRole('button', { name: 'Remove proposed field 1 from the batch' }).click();
    await dialog.getByRole('combobox', { name: 'Type of proposed field 1', exact: true }).selectOption('text');
    await expect(create).toHaveText('Create 13 Fields');

    const last = dialog.getByRole('textbox', { name: 'Name of proposed field 13' });
    await last.scrollIntoViewIfNeeded();
    await last.fill('Brand');
    await expect(dialog.getByRole('listitem').nth(12)).toContainText('Already exists');
    await expect(create).toBeDisabled();
    await last.fill('Slot thirteen');
    await expect(create).toBeEnabled();
    await expect(create).toBeInViewport();

    // Nothing is saved before the explicit confirmation.
    expect((await (await request.get(`/api/categories/${category.id}/fields`)).json()).length).toBe(1);
    await create.tap();
    await expect(dialog).toBeHidden();
    const names = (await (await request.get(`/api/categories/${category.id}/fields`)).json()).map(field => field.name);
    expect(names).toEqual(expect.arrayContaining(['Bus', 'Slot 1', 'Slot 11', 'Slot thirteen']));
    expect(names).toHaveLength(14);
  });

  test('empties the batch and returns to the JSON on a phone', async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const categoryName = unique('Phone Empty');
    await createCategory(request, categoryName);
    const dialog = await openBatch(page, categoryName);
    const source = fieldDocument([['Bus', 'text']]);
    await dialog.getByLabel('Field definition JSON').fill(source);
    await dialog.getByRole('button', { name: 'Preview' }).click();

    await dialog.getByRole('button', { name: 'Remove proposed field 1 from the batch' }).click();
    await expect(dialog.getByText('No fields left in this batch.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create 0 Fields' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Edit JSON' }).click();
    await expect(dialog.getByLabel('Field definition JSON')).toHaveValue(source);
  });

  test('AI Add Fields shares the card review', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const categoryName = unique('Phone AI');
    const category = await createCategory(request, categoryName);
    await page.route(`**/api/categories/${category.id}/fields/ai`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: fieldDocument([['Bus', 'text'], ['Released', 'number']])
    }));
    await page.goto('/categories');
    await page.getByRole('button').filter({ hasText: categoryName }).click();
    await page.getByRole('button', { name: 'AI Add Fields' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Field description').fill('Fields for expansion cards.');
    await dialog.getByRole('button', { name: 'Generate Fields' }).click();

    await expect(dialog.getByRole('heading', { name: 'Proposed field 2' })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Type of proposed field 2' })).toHaveValue('number');
    await expect(dialog.getByRole('button', { name: 'Edit Description' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create 2 Fields' })).toBeEnabled();
    await expectNoHorizontalScroll(page, dialog);
  });
});

test('keeps the compact table from the md breakpoint and the same draft across resizes', async ({ page, request }) => {
  await page.setViewportSize({ width: 768, height: 800 });
  const categoryName = unique('Breakpoint Cards');
  await createCategory(request, categoryName);
  const dialog = await openBatch(page, categoryName);
  await page.mouse.move(600, 400);
  await dialog.getByLabel('Field definition JSON').fill(fieldDocument([['Bus', 'text'], ['Year', 'number']]));
  await dialog.getByRole('button', { name: 'Preview' }).click();

  await expect(dialog.getByRole('table')).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Name of proposed field 1' }).fill('Interface');

  // Below md the same draft turns into cards, and back again.
  await page.setViewportSize({ width: 767, height: 800 });
  await expect(dialog.getByRole('table')).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Name of proposed field 1' })).toHaveValue('Interface');
  await dialog.getByRole('button', { name: 'Remove proposed field 2 from the batch' }).click();

  // A phone in landscape is wider than md, so it keeps the table, without sideways scrolling.
  await page.setViewportSize({ width: 874, height: 402 });
  await expect(dialog.getByRole('table')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name of proposed field 1' })).toHaveValue('Interface');
  await expect(dialog.getByRole('row')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Create 1 Field' })).toBeInViewport();
  await expectNoHorizontalScroll(page, dialog);
});
