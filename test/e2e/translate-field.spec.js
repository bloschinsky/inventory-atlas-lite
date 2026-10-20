import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

/*
  AI translation of one item field. AI is shown as configured by intercepting the capabilities, and
  every translation request is intercepted and recorded, so no provider is ever contacted. The
  Preferred Content Language is a real setting of the shared test database, so each test starts with
  none saved.
*/
test.beforeEach(async ({ request }) => {
  const response = await request.put('/api/database/metadata/content-language', { data: { contentLanguage: null } });
  expect(response.ok()).toBeTruthy();
});

const capabilities = (page, enabled = true) => page.route('**/api/capabilities', route => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ ai: { enabled, imageInput: true }, urlImport: true })
}));

// `answer(body)` returns the response of each request: { status, body } or a translated body.
async function interceptTranslation(page, answer) {
  await capabilities(page);
  const requests = [];
  await page.route('**/api/ai/translate', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const { status = 200, body: reply } = await answer(body);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return requests;
}

// A successful answer for the one requested field.
const translated = (body, translation, detectedLanguage = 'ja') => ({
  body: {
    targetLanguage: body.targetLanguage,
    sourceLanguage: body.sourceLanguage,
    fields: [{ key: body.fields[0].key, source: body.fields[0].text, translation, detectedLanguage, status: 'translated', warnings: [] }],
    warnings: []
  }
});

const fieldIds = async (request, category) => (await (await request.get(`/api/categories/${category.id}/fields`)).json()).map(field => field.id);

test('Name and a custom text field are translated on a new item, and only the approved values are saved', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cassette players'), [{ name: 'Remarks', type: 'text' }, { name: 'Weight', type: 'number' }]);
  const [notes] = await fieldIds(request, category);
  const answers = { name: 'Sony Walkman WM-FX195 cassette player', [`field:${notes}`]: 'Belt replaced' };
  const requests = await interceptTranslation(page, body => translated(body, answers[body.fields[0].key]));

  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('ソニー ウォークマン WM-FX195 カセットプレーヤー');
  await page.getByLabel('Remarks').fill('ベルト交換済み');
  await page.getByLabel('Location', { exact: true }).fill('Shelf B');

  // Only text fields offer the action, an empty field cannot be translated, and nothing is sent yet.
  await expect(page.getByRole('button', { name: 'Translate Weight' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Translate Serial Number' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Translate Description' })).toBeDisabled();
  await page.getByRole('button', { name: 'Translate Name' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate Name' });
  await expect(dialog.getByLabel('Original text')).toHaveValue('ソニー ウォークマン WM-FX195 カセットプレーヤー');
  await expect(dialog.getByLabel('Source language', { exact: true })).toHaveValue('auto');
  // Without a saved preference the interface language is the target.
  await expect(dialog.getByLabel('Translate into', { exact: true })).toHaveValue('en');
  await expect(dialog.getByText(/sent to the AI provider configured in Settings/)).toBeVisible();
  expect(requests).toEqual([]);

  await dialog.getByRole('button', { name: 'Translate', exact: true }).click();
  const result = dialog.getByLabel('Translation', { exact: true });
  await expect(result).toHaveValue('Sony Walkman WM-FX195 cassette player');
  await expect(dialog.getByText('Detected language: Japanese')).toBeVisible();
  expect(requests).toEqual([{
    targetLanguage: 'en', sourceLanguage: 'auto', categoryId: category.id,
    fields: [{ key: 'name', text: 'ソニー ウォークマン WM-FX195 カセットプレーヤー' }]
  }]);
  // The preview is editable, and the edited text is what the form receives.
  await result.fill('Sony Walkman WM-FX195 portable cassette player');
  await dialog.getByRole('button', { name: 'Use translation' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Name *')).toHaveValue('Sony Walkman WM-FX195 portable cassette player');
  await expect(page.getByLabel('Name *')).toBeFocused();

  // Cancel keeps the original text even after a translation arrived.
  await page.getByRole('button', { name: 'Translate Remarks' }).click();
  const notesDialog = page.getByRole('dialog', { name: 'Translate Remarks' });
  await notesDialog.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(notesDialog.getByLabel('Translation', { exact: true })).toHaveValue('Belt replaced');
  await notesDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Remarks')).toHaveValue('ベルト交換済み');

  await page.getByRole('button', { name: 'Translate Remarks' }).click();
  await notesDialog.getByRole('button', { name: 'Translate', exact: true }).click();
  await notesDialog.getByRole('button', { name: 'Use translation' }).click();
  await expect(page.getByLabel('Remarks')).toHaveValue('Belt replaced');
  // Every other unsaved value is still in the form.
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Shelf B');
  expect(requests).toHaveLength(3);

  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Sony Walkman WM-FX195 portable cassette player' })).toBeVisible();
  const saved = await (await request.get(`/api/items/${page.url().split('/').pop()}`)).json();
  expect(saved.fields.find(field => field.id === notes).value).toBe('Belt replaced');
  expect(saved.location).toBe('Shelf B');
  expect(saved.description).toBeNull();
});

test('an existing item is translated with an explicit source and a searched target, and Cancel leaves it unsaved', async ({ page, request }) => {
  const category = await createCategory(request, unique('Tools'), [{ name: 'Usage', type: 'text' }]);
  const [usage] = await fieldIds(request, category);
  const item = await createItem(request, { name: unique('Bohrmaschine'), category_id: category.id, field_values: { [usage]: 'Nur für Holz' } });
  const requests = await interceptTranslation(page, body => translated(body, '木材専用', null));

  await page.goto(`/items/${item.id}/edit`);
  await page.mouse.move(600, 400);
  await page.getByLabel('Location', { exact: true }).fill('Workshop');
  await page.getByRole('button', { name: 'Translate Usage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate Usage' });
  await dialog.getByLabel('Source language', { exact: true }).selectOption('de');
  // Any listed language can be the target, not only an interface language.
  await dialog.getByRole('searchbox', { name: 'Search languages for Translate into' }).fill('japan');
  await expect(dialog.getByLabel('Translate into', { exact: true })).toHaveValue('ja');
  await dialog.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('木材専用');
  expect(requests[0]).toMatchObject({ sourceLanguage: 'de', targetLanguage: 'ja', fields: [{ key: `field:${usage}`, text: 'Nur für Holz' }] });
  await dialog.getByRole('button', { name: 'Use translation' }).click();
  await expect(page.getByLabel('Usage')).toHaveValue('木材専用');
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Workshop');

  // The translation lived only in the form: leaving without saving keeps the stored value.
  await page.getByRole('button', { name: 'Cancel' }).click();
  const stored = await (await request.get(`/api/items/${item.id}`)).json();
  expect(stored.fields.find(field => field.id === usage).value).toBe('Nur für Holz');
});

test('a translation of text that changed while it was running is never applied', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cameras'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const requests = await interceptTranslation(page, async body => {
    if (first) { first = false; await gate; }
    return translated(body, `EN ${body.fields[0].text}`, 'de');
  });

  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Kamera');
  await page.getByRole('button', { name: 'Translate Name' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate Name' });
  await dialog.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Translating…' })).toBeDisabled();
  await expect.poll(() => requests.length).toBe(1);

  // The field changes while the request is pending, then the old answer arrives.
  await page.getByLabel('Name *').fill('Kamera mit Objektiv');
  release();
  await expect(dialog.getByText('This field changed while the translation was running.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use translation' })).toBeDisabled();
  await expect(page.getByLabel('Name *')).toHaveValue('Kamera mit Objektiv');

  // Only a new, explicit request reviews the current text.
  await dialog.getByRole('button', { name: 'Translate again' }).click();
  await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('EN Kamera mit Objektiv');
  expect(requests[1].fields).toEqual([{ key: 'name', text: 'Kamera mit Objektiv' }]);
  await dialog.getByRole('button', { name: 'Use translation' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('EN Kamera mit Objektiv');
});

test('without AI there is no Translate action, and a refused request leaves the form usable', async ({ page, request }) => {
  const category = await createCategory(request, unique('Lamps'), [{ name: 'Remarks', type: 'text' }]);
  await capabilities(page, false);
  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Lampe');
  await expect(page.getByLabel('Remarks')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Translate / })).toHaveCount(0);

  // The template editor never offers it, even with AI.
  await page.unroute('**/api/capabilities');
  const requests = await interceptTranslation(page, () => ({ status: 409, body: { error: { code: 'AI_DISABLED', params: {} } } }));
  await page.goto('/templates/new');
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Default item name')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Translate / })).toHaveCount(0);

  // A provider that turns out to be off answers with its error; nothing in the form changes.
  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Lampe');
  await page.getByRole('button', { name: 'Translate Name' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate Name' });
  await dialog.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('AI features are disabled. Enable them in Settings.');
  await expect(dialog.getByRole('button', { name: 'Use translation' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Lampe' })).toBeVisible();
});

test('the dialog works from the keyboard on a phone', async ({ page, request }) => {
  const category = await createCategory(request, unique('Radios'));
  const requests = await interceptTranslation(page, body => translated(body, 'Radio', 'de'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/items/new');
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Funkgerät');

  await page.getByRole('button', { name: 'Translate Name' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Translate Name' });
  const translate = dialog.getByRole('button', { name: 'Translate', exact: true });
  await expect(translate).toBeFocused();
  const box = await dialog.locator('.modal-content').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('Radio');
  await dialog.getByRole('button', { name: 'Use translation' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name *')).toHaveValue('Radio');

  // Escape closes without changing anything.
  await page.getByRole('button', { name: 'Translate Name' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Name *')).toHaveValue('Radio');
  expect(requests).toHaveLength(1);
});

test('the Preferred Content Language is saved with the database, offered as the target, and kept across interface languages', async ({ page, request }) => {
  const category = await createCategory(request, unique('Books'));
  await interceptTranslation(page, body => translated(body, 'Buch', 'en'));
  await page.goto('/settings/database');
  await page.mouse.move(600, 400);
  const card = page.getByRole('region', { name: 'Database' });
  const select = card.getByLabel('Preferred content language', { exact: true });
  // Unset: the interface language is only preselected, and nothing is written.
  await expect(select).toHaveValue('en');
  await expect(card.getByText('Not saved yet: the interface language is preselected.')).toBeVisible();
  expect((await (await request.get('/api/database/metadata')).json()).content_language).toBeNull();

  await card.getByRole('searchbox', { name: 'Search languages for Preferred content language' }).fill('deutsch');
  await expect(select).toHaveValue('de');
  await card.getByRole('button', { name: 'Save language' }).click();
  await expect(card.getByRole('status')).toHaveText('Preferred content language saved.');
  expect((await (await request.get('/api/database/metadata')).json()).content_language).toBe('de');

  // The interface language changes nothing in the inventory or its preference.
  await page.evaluate(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await page.reload();
  const ukrainian = page.getByRole('region', { name: 'База даних' });
  await expect(ukrainian.getByLabel('Бажана мова вмісту', { exact: true })).toHaveValue('de');
  expect((await (await request.get('/api/database/metadata')).json()).content_language).toBe('de');

  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Категорія').selectOption(String(category.id));
  await page.getByLabel('Назва *').fill('Book');
  await page.getByRole('button', { name: 'Перекласти: Назва' }).click();
  const dialog = page.getByRole('dialog', { name: 'Переклад: Назва' });
  await expect(dialog.getByLabel('Перекласти на', { exact: true })).toHaveValue('de');
  await dialog.getByRole('button', { name: 'Перекласти', exact: true }).click();
  await expect(dialog.getByLabel('Переклад', { exact: true })).toHaveValue('Buch');
  await page.evaluate(() => localStorage.setItem('inventory-atlas.locale', 'en'));
});
