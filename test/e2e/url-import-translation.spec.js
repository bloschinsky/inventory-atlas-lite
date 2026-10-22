import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

/*
  Translate imported values with AI inside Smart URL import. The page preview, the optional AI
  enhancement, the variant preview, and every translation request are intercepted and recorded, so
  no page or provider is ever contacted. Each test starts without a saved Preferred Content Language.
*/
const photoBytes = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png'));
const PAGE = 'https://shop.example.jp/products/wm-fx195';

test.beforeEach(async ({ request }) => {
  const response = await request.put('/api/database/metadata/content-language', { data: { contentLanguage: null } });
  expect(response.ok()).toBeTruthy();
});

const preview = (overrides = {}) => ({
  token: '6b1c1e7e-0d43-4d0b-9a55-3a8c0c6f5f10',
  pageUrl: PAGE,
  product: {
    name: 'ソニー ウォークマン WM-FX195', brand: 'Sony', model: 'WM-FX195', description: 'カセットプレーヤー。ベルト交換済み。',
    sku: '', mpn: '', gtin: '', categories: [],
    attributes: [{ name: 'Features', value: 'オートリバース、ドルビーB', source: 'json-ld' }]
  },
  provenance: { name: 'json-ld', description: 'open-graph', brand: 'json-ld', model: 'json-ld' },
  baseFields: { name: 'ソニー ウォークマン WM-FX195', description: 'カセットプレーヤー。ベルト交換済み。', source_url: PAGE },
  suggestedCategoryId: null,
  categoryId: null,
  customFields: [],
  price: { candidates: [{ amount: '5980', currency: 'JPY', kind: 'offer', source: 'json-ld' }], ambiguous: false },
  images: [{ index: 0, url: 'https://shop.example.jp/wm-fx195.png', source: 'json-ld' }],
  warnings: [],
  ...overrides
});

// AI shown as configured; the page preview answers with `body`, and its one image is a real PNG.
async function interceptImport(page, body, { ai = true } = {}) {
  await page.route('**/api/capabilities', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ai: { enabled: ai, imageInput: true }, urlImport: true })
  }));
  const reads = [];
  await page.route('**/api/items/import-url/preview', async route => {
    reads.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(typeof body === 'function' ? body(reads.length) : body) });
  });
  await page.route('**/api/items/import-url/*/images/*', route => route.fulfill({ status: 200, contentType: 'image/png', body: photoBytes }));
  return reads;
}

// `answer(body, count)` returns { status, body } or a promise of it; every request is recorded.
async function interceptTranslation(page, answer) {
  const requests = [];
  await page.route('**/api/ai/translate', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const { status = 200, body: reply } = await answer(body, requests.length);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return requests;
}

/*
  The service's answer for every requested field: `answers[key]` is a translation, or
  { status, translation, warning, params } for an unchanged, untranslatable, or withheld one.
*/
const reply = (body, answers, detectedLanguage = 'ja') => ({
  body: {
    targetLanguage: body.targetLanguage,
    sourceLanguage: body.sourceLanguage,
    fields: body.fields.map(({ key, text }) => {
      const answer = typeof answers[key] === 'string' ? { status: 'translated', translation: answers[key] } : answers[key];
      return {
        key, source: text, translation: answer.translation, status: answer.status,
        detectedLanguage: body.sourceLanguage === 'auto' ? detectedLanguage : body.sourceLanguage,
        warnings: answer.warning ? [{ code: answer.warning, params: answer.params ?? {} }] : []
      };
    }),
    warnings: []
  }
});

const fieldIds = async (request, category) => (await (await request.get(`/api/categories/${category.id}/fields`)).json()).map(field => field.id);
const reviewRow = (dialog, name) => dialog.getByRole('listitem').filter({ has: dialog.page().getByRole('checkbox', { name: new RegExp(`^${name}`) }) });

async function readPage(page, address) {
  await page.goto(address);
  await page.mouse.move(600, 400);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product page URL').fill(PAGE);
  await dialog.getByRole('button', { name: 'Read page' }).click();
  return dialog;
}

test('a Japanese page is translated into the Preferred Content Language, reviewed, and applied selectively', async ({ page, request }) => {
  expect((await request.put('/api/database/metadata/content-language', { data: { contentLanguage: 'es' } })).ok()).toBeTruthy();
  const category = await createCategory(request, unique('Players'), [{ name: 'Brand', type: 'text' }, { name: 'Features', type: 'text' }]);
  const [, features] = await fieldIds(request, category);
  await interceptImport(page, preview({ suggestedCategoryId: category.id }));
  const requests = await interceptTranslation(page, body => reply(body, {
    name: 'Walkman WM-FX195 de Sony',
    description: { status: 'invalid', translation: null, warning: 'TRANSLATION_WARNING_PROTECTED_CHANGED', params: { tokens: 'WM-FX195' } },
    [`field:${features}`]: 'Autorreverso, Dolby B'
  }));

  const dialog = await readPage(page, '/items/new?import=url');
  const translate = dialog.getByRole('region', { name: 'Translate imported values with AI' });
  // Nothing is sent by reading the page; the target is the database's Preferred Content Language.
  await expect(translate.getByRole('combobox', { name: 'Source language' })).toHaveValue('auto');
  await expect(translate.getByRole('combobox', { name: 'Translate into' })).toHaveValue('es');
  await expect(translate.getByRole('checkbox', { name: 'Translate Name' })).toBeChecked();
  await expect(translate.getByRole('checkbox', { name: 'Translate Description' })).toBeChecked();
  await expect(translate.getByRole('checkbox', { name: 'Translate Features' })).toBeChecked();
  // A brand is offered but off; the Source URL and the price are never candidates.
  await expect(translate.getByRole('checkbox', { name: 'Translate Brand' })).not.toBeChecked();
  await expect(translate.getByRole('checkbox', { name: 'Translate Source URL' })).toHaveCount(0);
  expect(requests).toEqual([]);

  await translate.getByRole('button', { name: 'Translate selected values' }).click();
  await expect(translate.getByText('2 translations added below.')).toBeVisible();
  expect(requests).toEqual([{
    targetLanguage: 'es', sourceLanguage: 'auto', categoryId: category.id,
    fields: [
      { key: 'name', text: 'ソニー ウォークマン WM-FX195' },
      { key: 'description', text: 'カセットプレーヤー。ベルト交換済み。' },
      { key: `field:${features}`, text: 'オートリバース、ドルビーB' }
    ]
  }]);

  // The original stays shown with its own provenance; the translation is marked as AI's.
  const name = reviewRow(dialog, 'Name');
  await expect(name.getByText('ソニー ウォークマン WM-FX195')).toBeVisible();
  await expect(name.getByText('Translated from the Structured data value')).toBeVisible();
  await expect(name.getByText('Detected language: Japanese')).toBeVisible();
  await expect(name.getByRole('checkbox', { name: 'Use translation into Spanish' })).toBeChecked();
  await name.getByRole('textbox', { name: 'Edit the translation for Name' }).fill('Sony Walkman WM-FX195');
  // A withheld translation leaves the original proposal.
  const description = reviewRow(dialog, 'Description');
  await expect(description.getByText('AI changed data that must stay as written (WM-FX195)')).toBeVisible();
  await expect(description.getByText('The original value is kept.')).toBeVisible();
  await expect(description.getByRole('textbox')).toHaveCount(0);
  await reviewRow(dialog, 'Features').getByRole('checkbox', { name: 'Use translation into Spanish' }).uncheck();

  await expect(dialog.getByRole('checkbox', { name: 'Use page price as Purchase Price' })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Import image 1' }).check();
  await dialog.getByRole('button', { name: 'Use selected values' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('Sony Walkman WM-FX195');
  await expect(page.getByLabel('Description')).toHaveValue('カセットプレーヤー。ベルト交換済み。');
  await expect(page.getByLabel('Features')).toHaveValue('オートリバース、ドルビーB');
  await expect(page.getByLabel('Brand')).toHaveValue('Sony');
  await expect(page.getByLabel('Source URL')).toHaveValue(PAGE);
  await expect(page.getByLabel('Purchase Price', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save item' }).click();

  await expect(page.getByRole('heading', { name: 'Sony Walkman WM-FX195' })).toBeVisible();
  const saved = await (await request.get(`/api/items/${page.url().split('/').pop()}`)).json();
  expect(saved.source_url).toBe(PAGE);
  expect(saved.purchase_price).toBeNull();
  expect(saved.photos).toHaveLength(1);
  expect(requests).toHaveLength(1);
});

test('an existing item: AI enhancement first, a manual source language, and filled values stay unchecked', async ({ page, request }) => {
  const category = await createCategory(request, unique('Speakers'), [{ name: 'Material', type: 'text' }]);
  const [material] = await fieldIds(request, category);
  const item = await createItem(request, { name: 'My speaker', category_id: category.id, location: 'Shelf' });
  const before = await (await request.get(`/api/items/${item.id}`)).json();
  await interceptImport(page, preview({
    categoryId: category.id,
    product: { ...preview().product, name: '蓝牙音箱 BT-300', brand: '', model: '', description: '防水便携式蓝牙音箱', attributes: [] },
    baseFields: { name: '蓝牙音箱 BT-300', description: '防水便携式蓝牙音箱', source_url: PAGE }
  }));
  await page.route('**/api/items/import-url/*/ai', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      categoryId: category.id, baseFields: { name: null, description: null }, offerPriceIndex: null, notes: [], warnings: [],
      fields: [{ fieldId: material, name: 'Material', type: 'text', value: '铝合金', confidence: 'high', evidence: '材质：铝合金' }]
    })
  }));
  const requests = await interceptTranslation(page, body => reply(body, {
    name: 'Bluetooth speaker BT-300', description: 'Waterproof portable Bluetooth speaker', [`field:${material}`]: 'Aluminium alloy'
  }));

  const dialog = await readPage(page, `/items/${item.id}/edit?import=url`);
  await dialog.getByRole('button', { name: 'Enhance with AI' }).click();
  await expect(dialog.getByRole('checkbox', { name: /^Material/ })).toBeChecked();

  const translate = dialog.getByRole('region', { name: 'Translate imported values with AI' });
  await translate.getByRole('combobox', { name: 'Source language' }).selectOption('zh-Hans');
  await translate.getByRole('combobox', { name: 'Translate into' }).selectOption('en');
  await translate.getByRole('button', { name: 'Translate selected values' }).click();
  await expect(translate.getByText('3 translations added below.')).toBeVisible();
  expect(requests.map(body => [body.sourceLanguage, body.targetLanguage, body.fields])).toEqual([['zh-Hans', 'en', [
    { key: 'name', text: '蓝牙音箱 BT-300' }, { key: 'description', text: '防水便携式蓝牙音箱' }, { key: `field:${material}`, text: '铝合金' }
  ]]]);

  // A translation never checks a row: the filled Name still waits for the user's choice.
  await expect(dialog.getByRole('checkbox', { name: /^Name/ })).not.toBeChecked();
  await expect(reviewRow(dialog, 'Name').getByRole('checkbox', { name: 'Use translation into English' })).toBeChecked();
  await expect(reviewRow(dialog, 'Name').getByText('Detected language')).toHaveCount(0);
  const materialRow = reviewRow(dialog, 'Material');
  await expect(materialRow.getByText('Translated from the AI suggestion value')).toBeVisible();
  // Editing the original after the request makes its translation unusable instead of overwriting the edit.
  await materialRow.getByRole('textbox', { name: 'Edit the AI suggestion for Material' }).fill('铝');
  await expect(materialRow.getByText('This value changed after the translation')).toBeVisible();
  await expect(materialRow.getByRole('checkbox', { name: 'Use translation into English' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Apply selected values' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('My speaker');
  await expect(page.getByLabel('Description')).toHaveValue('Waterproof portable Bluetooth speaker');
  await expect(page.getByLabel('Material')).toHaveValue('铝');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'My speaker' })).toBeVisible();
  const saved = await (await request.get(`/api/items/${item.id}`)).json();
  expect(saved.uuid).toBe(before.uuid);
  expect(saved.location).toBe('Shelf');
  expect(saved.description).toBe('Waterproof portable Bluetooth speaker');
  expect(saved.source_url).toBe(PAGE);
  expect(requests).toHaveLength(1);
});

test('failures keep the originals, and a new variant, category, or reading discards older translations', async ({ page, request }) => {
  const players = await createCategory(request, unique('Players'), [{ name: 'Features', type: 'text' }]);
  const other = await createCategory(request, unique('Other'));
  const variants = [{ index: 0, label: 'Black', offer: null }, { index: 1, label: 'Silver', offer: null }];
  const shared = preview({ suggestedCategoryId: players.id, variants, variant: null });
  const silver = preview({
    token: '22222222-2222-4222-8222-222222222222', suggestedCategoryId: players.id, variants, variant: 1,
    baseFields: { ...shared.baseFields, name: 'ソニー ウォークマン WM-FX195 シルバー' }
  });
  await interceptImport(page, shared);
  await page.route('**/api/items/import-url/*/variant', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(silver) }));
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const requests = await interceptTranslation(page, async (body, count) => {
    if (count === 1) return { status: 504, body: { error: { code: 'AI_PROVIDER_TIMEOUT', params: { provider: 'OpenAI' } } } };
    if (count === 2) await held;
    return reply(body, { name: `Walkman ${count}`, description: 'Cassette player. Belt replaced.', [body.fields[2]?.key]: 'Auto-reverse, Dolby B' });
  });

  const dialog = await readPage(page, '/items/new?import=url');
  const translate = dialog.getByRole('region', { name: 'Translate imported values with AI' });
  await dialog.getByRole('checkbox', { name: /^Description/ }).uncheck();
  await translate.getByRole('button', { name: 'Translate selected values' }).click();
  await expect(translate.getByRole('alert')).toContainText('OpenAI did not answer in time');
  await expect(translate.getByRole('alert')).toContainText('The original values and your choices below are unchanged.');
  await expect(dialog.getByRole('checkbox', { name: /^Description/ })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^Name/ })).toBeChecked();

  // An answer that arrives after another variant was chosen is ignored.
  await translate.getByRole('button', { name: 'Translate selected values' }).click();
  await expect.poll(() => requests.length).toBe(2);
  await dialog.getByLabel('Choose variant').selectOption({ label: 'Silver' });
  await expect(dialog.getByText('Showing the variant “Silver”.')).toBeVisible();
  release();
  await expect(translate.getByRole('button', { name: 'Translate selected values' })).toBeEnabled();
  await expect(dialog.getByRole('checkbox', { name: /^Use translation/ })).toHaveCount(0);

  await translate.getByRole('button', { name: 'Translate selected values' }).click();
  await expect(reviewRow(dialog, 'Name').getByRole('textbox', { name: 'Edit the translation for Name' })).toHaveValue('Walkman 3');
  expect(requests[2].fields[0]).toEqual({ key: 'name', text: 'ソニー ウォークマン WM-FX195 シルバー' });
  // Another category discards them, and so does reading the page again.
  await dialog.getByLabel('Category').selectOption(String(other.id));
  await expect(dialog.getByRole('checkbox', { name: /^Use translation/ })).toHaveCount(0);
  await expect(translate.getByRole('checkbox', { name: 'Translate Features' })).toHaveCount(0);
  await translate.getByRole('button', { name: 'Translate selected values' }).click();
  await expect(dialog.getByRole('checkbox', { name: /^Use translation/ })).not.toHaveCount(0);
  await dialog.getByRole('button', { name: 'Read page' }).click();
  await expect(dialog.getByLabel('Choose variant')).toHaveValue('');
  await expect(dialog.getByRole('checkbox', { name: /^Use translation/ })).toHaveCount(0);
  expect(requests).toHaveLength(4);

  await dialog.getByRole('button', { name: 'Use selected values' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('ソニー ウォークマン WM-FX195');
});

test('without AI the import works as before and says how to turn translation on', async ({ page, request }) => {
  const category = await createCategory(request, unique('Players'));
  await interceptImport(page, preview({ suggestedCategoryId: category.id }), { ai: false });
  const dialog = await readPage(page, '/items/new?import=url');
  await expect(dialog.getByText('turn on AI in Settings → AI')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Translate imported values with AI' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Use selected values' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('ソニー ウォークマン WM-FX195');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the translation works by keyboard in Ukrainian and fits the screen', async ({ page, request }) => {
    const category = await createCategory(request, unique('Плеєри'));
    await interceptImport(page, preview({ suggestedCategoryId: category.id }));
    const requests = await interceptTranslation(page, body => reply(body, { name: 'Плеєр Sony WM-FX195', description: 'Касетний плеєр. Ремінь замінено.' }));
    await page.goto('/items');
    await page.evaluate(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
    await page.goto('/items/new?import=url');
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('URL сторінки товару').fill(PAGE);
    await page.keyboard.press('Enter');
    const translate = dialog.getByRole('region', { name: 'Перекласти імпортовані значення за допомогою AI' });
    // Without a Preferred Content Language the interface language is the target.
    await expect(translate.getByRole('combobox', { name: 'Перекласти на' })).toHaveValue('uk');
    await translate.getByRole('button', { name: 'Перекласти вибрані значення' }).focus();
    await page.keyboard.press('Enter');
    await expect(translate.getByText('Нижче додано 2 переклади.')).toBeVisible();
    expect(requests[0].targetLanguage).toBe('uk');
    expect(await dialog.locator('.modal-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Використати вибране' }).click();
    await expect(page.getByLabel('Назва *')).toHaveValue('Плеєр Sony WM-FX195');
    await page.evaluate(() => localStorage.setItem('inventory-atlas.locale', 'en'));
  });
});
