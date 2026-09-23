import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

const phone = { width: 390, height: 844 };
const search = page => page.getByPlaceholder('Search name, description, serial number or transferred to…');
const labels = page => page.getByRole('group', { name: /^Label: / });
const sheets = page => page.getByRole('region', { name: /^Label page / });
const qrName = item => `QR code for ial:item:v1:${item.uuid}`;
const pageWidth = page => page.locator('body').evaluate(body => body.ownerDocument.documentElement.scrollWidth);

// A real print dialog would block the browser; the test only needs to know that it was asked for.
const mockPrint = page => page.addInitScript(() => {
  window.printCalls = 0;
  window.print = () => { window.printCalls++; };
});

const createItems = async (request, count, data) => {
  const prefix = unique('Jar');
  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push(await createItem(request, { name: `${prefix} ${String(i).padStart(2, '0')}`, ...data }));
  }
  return items;
};

// Every printed element of a label must stay inside that label's box.
const overflowingText = page => labels(page).evaluateAll(nodes => nodes.flatMap(label => {
  const box = label.getBoundingClientRect();
  return [...label.querySelectorAll('p, svg')].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.left < box.left - 0.5 || rect.right > box.right + 0.5 || rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5;
  }).map(element => element.textContent.slice(0, 30));
}));

// Labels whose box is not entirely inside the sheet it belongs to.
const labelsOutsideSheets = page => sheets(page).evaluateAll(nodes => nodes.flatMap(sheet => {
  const box = sheet.getBoundingClientRect();
  return [...sheet.querySelectorAll('[role="group"]')].filter(label => {
    const rect = label.getBoundingClientRect();
    return rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5 || rect.left < box.left - 0.5 || rect.right > box.right + 0.5;
  }).map(label => label.getAttribute('aria-label'));
}));

// Chromium writes one page object per printed page.
const pdfPageCount = pdf => pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g).length;

test('selects items across pages and filters, then prints them from one batch request', async ({ page, request }) => {
  await mockPrint(page);
  const category = await createCategory(request, unique('Pantry'));
  const shelf = await createItem(request, { name: unique('Shelf'), category_id: (await createCategory(request, unique('Furniture'))).id, location: 'Cellar' });
  const items = await createItems(request, 14, { category_id: category.id, description: 'Dried beans' });
  await request.put(`/api/items/${items[0].id}`, { data: { name: items[0].name, category_id: category.id, description: 'Dried beans', location: 'Kitchen', parent_item_id: shelf.id } });
  const [first, , , , , , , , , , , , thirteenth] = items;

  await page.goto('/items');
  await page.mouse.move(600, 400);
  const printLabels = page.getByRole('button', { name: 'Print Labels' });
  await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
  await expect(printLabels).toBeDisabled();

  await page.getByLabel('Category').selectOption({ label: category.name });
  // Wait for the filtered list, so no checkbox is clicked while the unfiltered one is replaced.
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('checkbox', { name: `Select ${first.name}` }).check();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  await expect(printLabels).toBeEnabled();

  // A selection on the second page is added to, not swapped for, the one on the first.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('checkbox', { name: `Select ${thirteenth.name}` }).check();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('checkbox', { name: `Select ${first.name}` })).toBeChecked();

  // Sorting, searching, and View keep working and keep the selection.
  await page.getByLabel('Direction').selectOption('desc');
  await expect(page.getByRole('row').nth(1)).toContainText(items[13].name);
  await search(page).fill(thirteenth.name);
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: `Select ${thirteenth.name}` })).toBeChecked();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: `View ${thirteenth.name}` }).click();
  await expect(page.getByRole('heading', { name: thirteenth.name })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await search(page).fill(thirteenth.name);
  await expect(page.getByRole('checkbox', { name: `Select ${thirteenth.name}` })).toBeChecked();
  await page.getByRole('link', { name: `Edit ${thirteenth.name}` }).click();
  await expect(page.getByLabel('Name *')).toHaveValue(thirteenth.name);
  await page.getByRole('link', { name: 'Items', exact: true }).click();

  const apiRequests = [];
  page.on('request', sent => {
    const url = new URL(sent.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(`${sent.method()} ${url.pathname}`);
  });
  await page.getByRole('button', { name: 'Print Labels' }).click();
  await expect(page).toHaveURL('/labels/print');
  await expect(page.getByText('2 items selected')).toBeVisible();
  await expect(labels(page)).toHaveCount(2);
  expect(apiRequests, 'labels must be loaded in one batch, not per item').toEqual(['POST /api/items/labels']);

  // Selection order is kept, and every label encodes its own item's UUID.
  await expect(labels(page).nth(0)).toHaveAccessibleName(`Label: ${first.name}`);
  await expect(labels(page).nth(1)).toHaveAccessibleName(`Label: ${thirteenth.name}`);
  const firstLabel = page.getByRole('group', { name: `Label: ${first.name}` });
  await expect(firstLabel.getByRole('img', { name: qrName(first) })).toBeVisible();
  await expect(page.getByRole('group', { name: `Label: ${thirteenth.name}` }).getByRole('img', { name: qrName(thirteenth) })).toBeVisible();

  // Defaults: the code, the name, and the description; no category and no location.
  await expect(page.getByRole('checkbox', { name: 'QR Code' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'QR Code' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Item name' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Description' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Category' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Location' })).not.toBeChecked();
  await expect(page.getByLabel('Layout')).toHaveValue('standard');
  await expect(firstLabel).toContainText(first.name);
  await expect(firstLabel).toContainText('Dried beans');
  await expect(firstLabel).not.toContainText(category.name);
  await expect(firstLabel).not.toContainText('Cellar');

  // Toggles change the preview; the location shown is the inherited one, not the saved one.
  await page.getByRole('checkbox', { name: 'Description' }).uncheck();
  await page.getByRole('checkbox', { name: 'Category' }).check();
  await page.getByRole('checkbox', { name: 'Location' }).check();
  await expect(firstLabel).not.toContainText('Dried beans');
  await expect(firstLabel).toContainText(category.name);
  await expect(firstLabel).toContainText('Cellar');
  await expect(firstLabel).not.toContainText('Kitchen');
  await page.getByRole('checkbox', { name: 'Item name' }).uncheck();
  await page.getByRole('checkbox', { name: 'Category' }).uncheck();
  await page.getByRole('checkbox', { name: 'Location' }).uncheck();
  await expect(firstLabel).toHaveText('');
  await expect(firstLabel.getByRole('img', { name: qrName(first) })).toBeVisible();

  await page.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => window.printCalls)).toBe(1);
});

test('selects items from the mobile cards and previews them without sideways scrolling', async ({ page, request }) => {
  await page.setViewportSize(phone);
  const category = await createCategory(request, unique('Drawers'));
  const [item, other] = await createItems(request, 2, { category_id: category.id });

  await page.goto('/items');
  await search(page).fill(item.name.split(' ').slice(0, -1).join(' '));
  await expect(page.getByRole('link', { name: item.name, exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print Labels' })).toBeDisabled();

  await page.getByRole('checkbox', { name: `Select ${item.name}` }).check();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `Select ${other.name}` })).not.toBeChecked();
  expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);

  await page.getByRole('button', { name: 'Print Labels' }).click();
  await expect(labels(page)).toHaveCount(1);
  await expect(page.getByRole('group', { name: `Label: ${item.name}` }).getByRole('img', { name: qrName(item) })).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(phone.width);
});

test('presets change the label grid and a large selection prints on several whole A4 pages', async ({ page, request }) => {
  await mockPrint(page);
  const category = await createCategory(request, unique('Archive'));
  await createItems(request, 25, { category_id: category.id, description: 'Letters and receipts' });

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption({ label: category.name });
  const selectPage = page.getByRole('checkbox', { name: 'Select all items on this page' });
  for (let current = 1; current <= 3; current++) {
    await expect(page.getByText(`Page ${current} of 3`)).toBeVisible();
    await selectPage.check();
    if (current < 3) await page.getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByText('25 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Print Labels' }).click();
  await expect(labels(page)).toHaveCount(25);

  const layout = page.getByLabel('Layout');
  const expectations = [
    ['large', 4, '25 labels on 4 A4 pages', [95, 69]],
    ['compact', 1, '25 labels on 1 A4 page', [63, 27]],
    ['standard', 2, '25 labels on 2 A4 pages', [63, 39]]
  ];
  const mm = 96 / 25.4;
  for (const [preset, pageCount, summary, [width, height]] of expectations) {
    await layout.selectOption(preset);
    await expect(sheets(page)).toHaveCount(pageCount);
    await expect(page.getByText(summary)).toBeVisible();
    const box = await labels(page).first().boundingBox();
    expect(box.width).toBeCloseTo(width * mm, 0);
    expect(box.height).toBeCloseTo(height * mm, 0);
    expect(await labelsOutsideSheets(page)).toEqual([]);
  }

  // In print only the sheets remain, one per A4 page, and no label crosses a page boundary.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('aside.navbar-vertical')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Print Labels' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
  await expect(layout).toBeHidden();
  await expect(sheets(page).first()).toBeVisible();
  expect(await labelsOutsideSheets(page)).toEqual([]);
  const sheetHeights = await sheets(page).evaluateAll(nodes => nodes.map(sheet => sheet.getBoundingClientRect().height));
  for (const sheetHeight of sheetHeights) expect(sheetHeight).toBeCloseTo(297 * mm, 0);
  expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(2);

  // The controls are hidden in print, so the next preset is chosen on screen and printed again.
  await page.emulateMedia({ media: 'screen' });
  await layout.selectOption('large');
  await page.emulateMedia({ media: 'print' });
  expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(4);
});

test.describe('a dark colour mode', () => {
  test.use({ colorScheme: 'dark' });

  test('prints one label from the QR dialog in black on white and keeps long text inside it', async ({ page, request }) => {
    const category = await createCategory(request, unique('Long names'));
    const word = 'Supercalifragilistic'.repeat(8);
    const item = await createItem(request, {
      name: `${unique('Box')} ${word} ${'with a very long name '.repeat(8)}`,
      category_id: category.id,
      description: `${word} ${'A description that goes on and on. '.repeat(20)}`,
      location: `${word} ${'Room, shelf, and drawer '.repeat(10)}`
    });

    await page.goto(`/items/${item.id}`);
    await page.mouse.move(600, 400);
    expect(await page.locator('html').getAttribute('data-bs-theme')).toBe('dark');
    await page.getByRole('button', { name: 'QR Code' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Print Label' }).click();
    await expect(page).toHaveURL('/labels/print');
    await expect(page.getByRole('dialog')).toBeHidden();
    const label = page.getByRole('group', { name: `Label: ${item.name}` });
    await expect(label.getByRole('img', { name: qrName(item) })).toBeVisible();

    await page.getByRole('checkbox', { name: 'Category' }).check();
    await page.getByRole('checkbox', { name: 'Location' }).check();
    const qrSizes = {};
    for (const preset of ['large', 'standard', 'compact']) {
      await page.getByLabel('Layout').selectOption(preset);
      expect(await overflowingText(page), `text overflows a ${preset} label`).toEqual([]);
      qrSizes[preset] = (await label.getByRole('img').boundingBox()).width;
    }
    // Long text never squeezes the code below its preset size.
    const mm = 96 / 25.4;
    expect(qrSizes.large).toBeCloseTo(45 * mm, 0);
    expect(qrSizes.standard).toBeCloseTo(30 * mm, 0);
    expect(qrSizes.compact).toBeCloseTo(22 * mm, 0);

    await page.emulateMedia({ media: 'print' });
    const colors = await label.evaluate(node => {
      const style = element => getComputedStyle(element);
      return {
        label: style(node).color,
        name: style(node.querySelector('p')).color,
        sheet: style(node.closest('section')).backgroundColor,
        body: style(document.body).backgroundColor
      };
    });
    expect(colors).toEqual({ label: 'rgb(0, 0, 0)', name: 'rgb(0, 0, 0)', sheet: 'rgb(255, 255, 255)', body: 'rgb(255, 255, 255)' });
    expect(await overflowingText(page)).toEqual([]);
  });
});

test('skips selected items that were deleted with a visible warning, also after a reload', async ({ page, request }) => {
  const category = await createCategory(request, unique('Leftovers'));
  const [kept, removed] = await createItems(request, 2, { category_id: category.id });

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption({ label: category.name });
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.getByRole('checkbox', { name: `Select ${kept.name}` }).check();
  await page.getByRole('checkbox', { name: `Select ${removed.name}` }).check();
  expect((await request.delete(`/api/items/${removed.id}`)).ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Print Labels' }).click();
  const warning = page.getByRole('alert').filter({ hasText: '1 selected item no longer exists and was skipped.' });
  await expect(warning).toBeVisible();
  await expect(labels(page)).toHaveCount(1);
  await expect(page.getByRole('group', { name: `Label: ${kept.name}` })).toBeVisible();

  await page.reload();
  await expect(warning).toBeVisible();
  await expect(labels(page)).toHaveCount(1);

  await page.emulateMedia({ media: 'print' });
  await expect(warning).toBeHidden();
});

test('opening the print view without a selection points back to Items', async ({ page }) => {
  await page.goto('/labels/print');
  await expect(page.getByText('No items selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Go to Items' }).click();
  await expect(page).toHaveURL('/items');
});
