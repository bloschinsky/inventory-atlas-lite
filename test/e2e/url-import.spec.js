import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

/*
  Smart URL import in the browser. The server's page reading is covered by test/url-import.test.js
  against local fixtures; here the preview and image requests are intercepted, so the suite never
  reaches the network and the review workflow is tested on its own.
*/
const photoBytes = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png'));
const PAGE = 'https://shop.example/products/trail-camera-x200';

const preview = (overrides = {}) => ({
  token: '6b1c1e7e-0d43-4d0b-9a55-3a8c0c6f5f10',
  pageUrl: PAGE,
  product: {
    name: 'Trail Camera X200', brand: 'Fieldmark', model: 'X200', description: 'Weatherproof trail camera with night vision.',
    sku: 'FM-X200', mpn: '', gtin: '4006381333931', categories: ['Cameras'],
    attributes: [{ name: 'Waterproof', value: 'Yes', source: 'json-ld' }, { name: 'Battery life', value: '6 months', source: 'json-ld' }]
  },
  provenance: { name: 'json-ld', description: 'json-ld', brand: 'json-ld', model: 'json-ld', sku: 'json-ld', gtin: 'json-ld' },
  baseFields: { name: 'Trail Camera X200', description: 'Weatherproof trail camera with night vision.', source_url: PAGE },
  suggestedCategoryId: null,
  categoryId: null,
  customFields: [],
  price: {
    candidates: [
      { amount: '159.00', currency: 'EUR', kind: 'regular', source: 'json-ld' },
      { amount: '129.90', currency: 'EUR', kind: 'sale', source: 'json-ld' }
    ],
    ambiguous: false
  },
  images: [{ index: 0, url: 'https://shop.example/x200.png', source: 'json-ld' }, { index: 1, url: 'https://shop.example/x200-side.png', source: 'open-graph' }],
  warnings: [],
  ...overrides
});

// The preview answers with `body`; the first image is a real PNG and the second one fails.
async function interceptImport(page, body, status = 200) {
  const requests = [];
  await page.route('**/api/items/import-url/preview', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/items/import-url/*/images/*', route => (route.request().url().endsWith('/images/0')
    ? route.fulfill({ status: 200, contentType: 'image/png', body: photoBytes })
    : route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'URL_IMPORT_IMAGE_INVALID', params: {} } }) })));
  return requests;
}

test('a new item is drafted from a product page, reviewed, and saved without the page price', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cameras'), [{ name: 'Brand', type: 'text' }, { name: 'Waterproof', type: 'boolean' }]);
  const requests = await interceptImport(page, preview({ suggestedCategoryId: category.id }));

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await page.getByRole('button', { name: 'More ways to add an item' }).click();
  await page.getByRole('link', { name: 'From URL' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add item from URL' });
  await expect(dialog.getByLabel('Product page URL')).toBeFocused();
  await dialog.getByLabel('Product page URL').fill(PAGE);
  await dialog.getByRole('button', { name: 'Read page' }).click();
  expect(requests).toEqual([{ url: PAGE }]);

  // The suggested existing category maps the page's details to its fields.
  await expect(dialog.getByLabel('Category')).toHaveValue(String(category.id));
  await expect(dialog.getByText('Suggested from the category the page states.')).toBeVisible();
  for (const name of ['Name', 'Description', 'Source URL', 'Brand', 'Waterproof']) {
    await expect(dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) })).toBeChecked();
  }
  await expect(dialog.getByText('Structured data').first()).toBeVisible();
  // Identifiers that no field takes are shown but never saved; nothing becomes a serial number.
  await dialog.getByText('4 other details found').click();
  await expect(dialog.getByText('FM-X200')).toBeVisible();

  // The page price is shown as a suggestion; copying it stays a separate, unchecked choice.
  await expect(dialog.getByRole('radio', { name: /129\.90.*Sale price/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /159\.00.*Regular price/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Use page price as Purchase Price' })).not.toBeChecked();

  // Images are imported only when chosen; one that cannot be read is reported and cannot be chosen.
  await expect(dialog.getByRole('img', { name: 'Product image 1' })).toBeVisible();
  await expect(dialog.getByText('Image unavailable')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Import image 2' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Import image 1' }).check();
  await dialog.getByRole('checkbox', { name: /^Waterproof/ }).uncheck();
  await dialog.getByRole('button', { name: 'Use selected values' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('The selected values from the page are now in the form.')).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue('Trail Camera X200');
  await expect(page.getByLabel('Category *')).toHaveValue(String(category.id));
  await expect(page.getByLabel('Source URL')).toHaveValue(PAGE);
  await expect(page.getByLabel('Brand')).toHaveValue('Fieldmark');
  await expect(page.getByLabel('Waterproof')).toHaveValue('0');
  await expect(page.getByLabel('Purchase Price', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Serial Number')).toHaveValue('');
  await expect(page.getByText('Not saved', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: 'Trail Camera X200' })).toBeVisible();
  await expect(detail(page, 'Source URL').getByRole('link', { name: PAGE })).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  const id = page.url().split('/').pop();
  const saved = await (await request.get(`/api/items/${id}`)).json();
  expect(saved.purchase_price).toBeNull();
  expect(saved.serial_number).toBeNull();
  expect(saved.is_new).toBe(false);
  expect(saved.photos).toHaveLength(1);
  expect(saved.fields.map(field => [field.name, field.value])).toEqual([['Brand', 'Fieldmark'], ['Waterproof', '0']]);
});

test('an existing item is enriched only with the chosen values and keeps its container, photos, and identity', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cameras'), [{ name: 'Brand', type: 'text' }]);
  const container = await createItem(request, { name: unique('Camera bag'), category_id: category.id });
  const item = await createItem(request, {
    name: 'My trail cam', category_id: category.id, description: 'Bought at the fair.', parent_item_id: container.id,
    purchase_price: { amount: '100.00', currency: 'EUR' }, condition_grade: 'good', is_new: true
  });
  const upload = await request.post(`/api/items/${item.id}/photos`, { multipart: { photos: { name: 'mine.png', mimeType: 'image/png', buffer: photoBytes } } });
  const [cover] = await upload.json();
  const requests = await interceptImport(page, preview({ categoryId: category.id }));

  await page.goto(`/items/${item.id}`);
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Fill from URL' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}/edit\\?import=url$`));
  const dialog = page.getByRole('dialog', { name: 'Fill from URL' });
  await dialog.getByLabel('Product page URL').fill(PAGE);
  await dialog.getByRole('button', { name: 'Read page' }).click();
  expect(requests).toEqual([{ url: PAGE, categoryId: category.id }]);

  // Filled values are conflicts and start unchecked; empty ones are offered checked.
  const name = dialog.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: /^Name/ }) });
  await expect(name.getByText('Replaces current value')).toBeVisible();
  await expect(name.getByText('My trail cam')).toBeVisible();
  await expect(name.getByText('Trail Camera X200')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /^Name/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^Description/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^Source URL/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^Brand/ })).toBeChecked();
  await expect(dialog.getByLabel('Category')).toHaveCount(0);
  await expect(dialog.getByText(/already has a Purchase Price of €100\.00/)).toBeVisible();
  // The user deliberately takes the regular price as what they paid.
  await dialog.getByRole('radio', { name: /159\.00/ }).check();
  await dialog.getByRole('checkbox', { name: 'Use page price as Purchase Price' }).check();
  await dialog.getByRole('button', { name: 'Apply selected values' }).click();

  await expect(page.getByLabel('Name *')).toHaveValue('My trail cam');
  await expect(page.getByLabel('Purchase Price', { exact: true })).toHaveValue('159.00');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));

  const saved = await (await request.get(`/api/items/${item.id}`)).json();
  expect(saved.uuid).toBe(item.uuid);
  expect(saved.name).toBe('My trail cam');
  expect(saved.description).toBe('Bought at the fair.');
  expect(saved.source_url).toBe(PAGE);
  expect(saved.purchase_price).toEqual({ amount: '159.00', currency: 'EUR' });
  expect(saved.parent_item_id).toBe(container.id);
  expect(saved.condition_grade).toBe('good');
  expect(saved.is_new).toBe(true);
  expect(saved.lifecycle_status).toBe('active');
  expect(saved.photos.map(photo => photo.id)).toEqual([cover.id]);
  expect(saved.fields.map(field => [field.name, field.value])).toEqual([['Brand', 'Fieldmark']]);
  // No second item was created: the category still holds only the bag and the enriched camera.
  expect((await (await request.get(`/api/items?categoryId=${category.id}`)).json()).items.map(entry => entry.id).sort())
    .toEqual([container.id, item.id].sort());
});

test('blocked pages, partial results, and ambiguous prices are explained, in English and Ukrainian', async ({ page }) => {
  let answer = { status: 400, body: { error: { code: 'URL_IMPORT_BLOCKED_HOST', params: {} } } };
  await page.route('**/api/items/import-url/preview', route => route.fulfill({
    status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body)
  }));
  await page.goto('/items/new?import=url');
  const dialog = page.getByRole('dialog', { name: 'Add item from URL' });
  await dialog.getByLabel('Product page URL').fill('http://192.168.1.10/');
  await dialog.getByRole('button', { name: 'Read page' }).click();
  await expect(dialog.getByRole('alert')).toContainText('local or private network');
  await expect(dialog.getByRole('button', { name: 'Use selected values' })).toHaveCount(0);

  answer = {
    status: 200,
    body: preview({
      product: { ...preview().product, attributes: [] },
      price: { candidates: [{ amount: '18.00', currency: 'USD', kind: 'offer', source: 'json-ld' }, { amount: '21.50', currency: 'USD', kind: 'offer', source: 'json-ld' }], ambiguous: true },
      images: [],
      warnings: [{ code: 'URL_IMPORT_WARNING_NO_PRODUCT_DATA', params: {} }, { code: 'URL_IMPORT_WARNING_PRICE_AMBIGUOUS', params: {} }]
    })
  };
  await dialog.getByRole('button', { name: 'Read page' }).click();
  await expect(dialog.getByText('The page has no product data')).toBeVisible();
  await expect(dialog.getByText('None was chosen for you.')).toBeVisible();
  for (const radio of await dialog.getByRole('radio').all()) await expect(radio).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Use page price as Purchase Price' })).toBeDisabled();
  await dialog.getByRole('radio', { name: /21\.50/ }).check();
  await expect(dialog.getByRole('checkbox', { name: 'Use page price as Purchase Price' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Name *')).toHaveValue('');

  await page.evaluate(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await page.reload();
  const ukrainian = page.getByRole('dialog', { name: 'Додати предмет з URL' });
  await ukrainian.getByLabel('URL сторінки товару').fill(PAGE);
  await ukrainian.getByRole('button', { name: 'Прочитати сторінку' }).click();
  await expect(ukrainian.getByText('Сторінка показує кілька цін чи валют')).toBeVisible();
  await expect(ukrainian.getByRole('checkbox', { name: 'Використати ціну зі сторінки як ціну покупки' })).toBeDisabled();
  await page.evaluate(() => localStorage.setItem('inventory-atlas.locale', 'en'));
});

// AI shown as configured; the enhancement answers come from `answers`, one per request, and are recorded.
async function interceptAi(page, answers) {
  await page.route('**/api/capabilities', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ai: { enabled: true, imageInput: true }, urlImport: true })
  }));
  const requests = [];
  await page.route('**/api/items/import-url/*/ai', async route => {
    requests.push(route.request().postDataJSON());
    const { status = 200, body } = answers[Math.min(requests.length, answers.length) - 1];
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

const fieldIds = async (request, category) => (await (await request.get(`/api/categories/${category.id}/fields`)).json()).map(field => field.id);

const aiAnswer = (overrides = {}) => ({
  categoryId: null, baseFields: { name: null, description: null }, fields: [], offerPriceIndex: null, notes: [], warnings: [], ...overrides
});

test('AI enhancement runs only when asked and joins the same review without touching the price opt-in', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cameras'), [{ name: 'Brand', type: 'text' }, { name: 'Color', type: 'color' }, { name: 'Battery', type: 'text' }]);
  const [brand, color, battery] = await fieldIds(request, category);
  const suggestion = aiAnswer({
    categoryId: category.id,
    baseFields: { name: null, description: 'Weatherproof trail camera with night vision that records 4K video.' },
    fields: [
      { fieldId: brand, name: 'Brand', type: 'text', value: 'Fieldmark', confidence: 'high', evidence: 'Fieldmark' },
      { fieldId: color, name: 'Color', type: 'color', value: '{"key":"black","hex":"#171717"}', confidence: 'medium', evidence: 'Housing: black' },
      { fieldId: battery, name: 'Battery', type: 'text', value: '6 months', confidence: 'low', evidence: 'Battery life: 6 months' }
    ],
    offerPriceIndex: 1,
    notes: ['The description mentions a launch price of 199 EUR.'],
    warnings: [{ code: 'URL_IMPORT_AI_WARNING_DROPPED', params: { count: 2 } }]
  });
  await interceptImport(page, preview());
  const requests = await interceptAi(page, [{ body: suggestion }]);

  await page.goto('/items/new?import=url');
  const dialog = page.getByRole('dialog', { name: 'Add item from URL' });
  await dialog.getByLabel('Product page URL').fill(PAGE);
  await dialog.getByRole('button', { name: 'Read page' }).click();
  await expect(dialog.getByRole('checkbox', { name: /^Name/ })).toBeChecked();
  // Nothing is sent to AI by reading the page; the user is told what would be shared.
  const ai = dialog.getByRole('region', { name: 'Enhance with AI' });
  await expect(ai.getByText(/sent to the AI provider configured in Settings/)).toBeVisible();
  expect(requests).toEqual([]);

  await ai.getByRole('button', { name: 'Enhance with AI' }).click();
  await expect(ai.getByText('3 AI suggestions added. Review them like any other value.')).toBeVisible();
  expect(requests).toEqual([{}]);
  await expect(ai.getByText('2 AI suggestions did not pass validation and were discarded.')).toBeVisible();
  await expect(ai.getByText('The description mentions a launch price of 199 EUR.')).toBeVisible();
  // The AI chooses only an existing category, and the page's values are matched to it as well.
  await expect(dialog.getByLabel('Category')).toHaveValue(String(category.id));
  await expect(dialog.getByText('Suggested by AI from the details on the page.')).toBeVisible();

  const row = name => dialog.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: new RegExp(`^${name}`) }) });
  await expect(row('Brand').getByText('AI agrees')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /^Color/ })).toBeChecked();
  await expect(row('Color').getByText('Medium confidence')).toBeVisible();
  await expect(row('Color').getByText('Page text: “Housing: black”')).toBeVisible();
  // A low-confidence suggestion is offered unchecked.
  await expect(dialog.getByRole('checkbox', { name: /^Battery/ })).not.toBeChecked();
  // The page description stays chosen until the user picks or edits the AI one.
  await expect(row('Description').getByRole('radio', { name: 'Page value' })).toBeChecked();
  await row('Description').getByRole('textbox', { name: 'Edit the AI suggestion for Description' }).fill('Trail camera with night vision and 4K video.');
  await expect(row('Description').getByRole('radio', { name: 'AI suggestion' })).toBeChecked();

  // The AI may point at the current offer, but copying a price stays the user's separate choice.
  await expect(dialog.getByRole('radio', { name: /129\.90.*AI: current offer/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Use page price as Purchase Price' })).not.toBeChecked();

  // Asking again never undoes what the user chose.
  await dialog.getByRole('checkbox', { name: /^Battery/ }).check();
  await ai.getByRole('button', { name: 'Ask AI again' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({ categoryId: category.id });
  await expect(dialog.getByRole('checkbox', { name: /^Battery/ })).toBeChecked();
  await expect(row('Description').getByRole('textbox', { name: 'Edit the AI suggestion for Description' })).toHaveValue('Trail camera with night vision and 4K video.');

  await dialog.getByRole('button', { name: 'Use selected values' }).click();
  await expect(page.getByLabel('Description')).toHaveValue('Trail camera with night vision and 4K video.');
  await expect(page.getByLabel('Battery')).toHaveValue('6 months');
  await expect(page.getByLabel('Purchase Price', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Trail Camera X200' })).toBeVisible();
  const saved = await (await request.get(`/api/items/${page.url().split('/').pop()}`)).json();
  expect(saved.purchase_price).toBeNull();
  expect(saved.serial_number).toBeNull();
  expect(saved.fields.map(field => [field.name, field.value])).toEqual([
    ['Brand', 'Fieldmark'], ['Color', '{"key":"black","hex":"#171717"}'], ['Battery', '6 months']
  ]);
});

test('a failed AI request keeps the page values, and AI suggestions for an existing item can be rejected', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cameras'), [{ name: 'Brand', type: 'text' }, { name: 'Battery', type: 'text' }]);
  const item = await createItem(request, { name: 'My trail cam', category_id: category.id, purchase_price: { amount: '100.00', currency: 'EUR' } });
  const [, battery] = await fieldIds(request, category);
  await interceptImport(page, preview({ categoryId: category.id }));
  const requests = await interceptAi(page, [
    { status: 504, body: { error: { code: 'AI_PROVIDER_TIMEOUT', params: { provider: 'OpenAI' } } } },
    { body: aiAnswer({
      categoryId: category.id,
      baseFields: { name: 'Trail Camera X200', description: null },
      fields: [{ fieldId: battery, name: 'Battery', type: 'text', value: '6 months', confidence: 'high', evidence: 'Battery life: 6 months' }]
    }) }
  ]);

  await page.goto(`/items/${item.id}/edit?import=url`);
  const dialog = page.getByRole('dialog', { name: 'Fill from URL' });
  await dialog.getByLabel('Product page URL').fill(PAGE);
  await dialog.getByRole('button', { name: 'Read page' }).click();
  const ai = dialog.getByRole('region', { name: 'Enhance with AI' });
  await ai.getByRole('button', { name: 'Enhance with AI' }).click();
  await expect(ai.getByRole('alert')).toContainText('OpenAI did not answer in time');
  await expect(ai.getByRole('alert')).toContainText('The values read from the page are still available below.');
  await expect(dialog.getByRole('checkbox', { name: /^Brand/ })).toBeChecked();

  await ai.getByRole('button', { name: 'Enhance with AI' }).click();
  await expect(ai.getByRole('alert')).toHaveCount(0);
  // An existing item keeps its category, and only that category's fields are asked for.
  expect(requests).toEqual([{ categoryId: category.id }, { categoryId: category.id }]);
  // The AI agrees with the page's Name, which still starts unchecked because the item has a name.
  await expect(dialog.getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: /^Name/ }) }).getByText('AI agrees')).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /^Name/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^Battery/ })).toBeChecked();

  await ai.getByRole('button', { name: 'Discard AI suggestions' }).click();
  await expect(dialog.getByRole('checkbox', { name: /^Battery/ })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: /^Brand/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Apply selected values' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('My trail cam');
  await expect(page.getByLabel('Battery')).toHaveValue('');
  await expect(page.getByLabel('Purchase Price', { exact: true })).toHaveValue('100.00');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the review fills the screen without sideways scrolling', async ({ page, request }) => {
    const category = await createCategory(request, unique('Cameras'));
    await interceptImport(page, preview({ suggestedCategoryId: category.id }));
    await page.goto('/items/new?import=url');
    const dialog = page.getByRole('dialog', { name: 'Add item from URL' });
    await dialog.getByLabel('Product page URL').fill(PAGE);
    await dialog.getByRole('button', { name: 'Read page' }).click();
    await expect(dialog.getByRole('checkbox', { name: /^Name/ })).toBeChecked();
    const width = await dialog.locator('.modal-content').evaluate(element => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(380);
    expect(await dialog.locator('.modal-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Use selected values' }).click();
    await expect(page.getByLabel('Name *')).toHaveValue('Trail Camera X200');
  });

  test('AI suggestions with their evidence fit the screen too', async ({ page, request }) => {
    const category = await createCategory(request, unique('Cameras'), [{ name: 'Battery', type: 'text' }]);
    const [battery] = await fieldIds(request, category);
    await interceptImport(page, preview({ suggestedCategoryId: category.id }));
    await interceptAi(page, [{ body: aiAnswer({
      categoryId: category.id,
      baseFields: { name: null, description: 'Weatherproof trail camera with night vision and a very long description that has to wrap on a phone screen.' },
      fields: [{ fieldId: battery, name: 'Battery', type: 'text', value: '6 months', confidence: 'medium', evidence: `Battery life: 6 months ${'x'.repeat(150)}` }]
    }) }]);
    await page.goto('/items/new?import=url');
    const dialog = page.getByRole('dialog', { name: 'Add item from URL' });
    await dialog.getByLabel('Product page URL').fill(PAGE);
    await dialog.getByRole('button', { name: 'Read page' }).click();
    await dialog.getByRole('button', { name: 'Enhance with AI' }).click();
    await expect(dialog.getByRole('checkbox', { name: /^Battery/ })).toBeChecked();
    expect(await dialog.locator('.modal-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
