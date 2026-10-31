import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createCategory, createItem, openItemActions, unique } from './helpers.js';

/*
  Translate Item with AI: the selected texts of the unsaved item form go out in one translation
  request, and only the approved proposals return to the form. AI is shown as configured by
  intercepting the capabilities, and every translation request is intercepted and recorded, so no
  provider is ever contacted. Each test starts without a saved Preferred Content Language.
*/
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/sample-photo.png');

test.beforeEach(async ({ request }) => {
  const response = await request.put('/api/database/metadata/content-language', { data: { contentLanguage: null } });
  expect(response.ok()).toBeTruthy();
});

const capabilities = (page, enabled = true) => page.route('**/api/capabilities', route => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ ai: { enabled, imageInput: true }, urlImport: false })
}));

// `answer(body)` returns { status, body }; every request is recorded.
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

/*
  The service's answer for every requested field: `answers[key]` is a translation, or
  { status, translation, warning } for an unchanged, untranslatable, or withheld one.
*/
const reply = (body, answers, detectedLanguage = 'ja') => ({
  body: {
    targetLanguage: body.targetLanguage,
    sourceLanguage: body.sourceLanguage,
    fields: body.fields.map(({ key, text }) => {
      const answer = typeof answers[key] === 'string' ? { status: 'translated', translation: answers[key] } : answers[key];
      return { key, source: text, translation: answer.translation, detectedLanguage, status: answer.status, warnings: answer.warning ? [{ code: answer.warning, params: {} }] : [] };
    }),
    warnings: []
  }
});

const fieldIds = async (request, category) => (await (await request.get(`/api/categories/${category.id}/fields`)).json()).map(field => field.id);
const choice = (dialog, label) => dialog.getByRole('checkbox', { name: label, exact: true });

test('from Item Details: chosen fields go out in one request, and only approved translations are saved', async ({ page, request }) => {
  const category = await createCategory(request, unique('Players'), [{ name: 'Remarks', type: 'text' }, { name: 'Model', type: 'text' }, { name: 'Weight', type: 'number' }]);
  const [remarks, model, weight] = await fieldIds(request, category);
  const item = await createItem(request, {
    name: unique('ウォークマン'), category_id: category.id, description: '更换了皮带', condition_grade: 'good', condition_notes: '',
    location: 'Гараж', transferred_to: 'Олена', serial_number: 'SN-48213', purchase_date: '2020-05-01',
    purchase_price: { amount: '49.90', currency: 'EUR' }, source_url: 'https://example.com/walkman',
    field_values: { [remarks]: 'Ремінь замінено', [model]: 'WM-FX195', [weight]: '320' }
  });
  expect((await request.post(`/api/items/${item.id}/photos`, {
    multipart: { photos: { name: 'walkman.png', mimeType: 'image/png', buffer: await readFile(fixture) } }
  })).ok()).toBeTruthy();
  const before = await (await request.get(`/api/items/${item.id}`)).json();
  const historyBefore = await (await request.get(`/api/items/${item.id}/history`)).json();
  const requests = await interceptTranslation(page, body => reply(body, {
    name: 'Walkman', description: 'Belt replaced',
    [`field:${remarks}`]: { status: 'unchanged', translation: 'Ремінь замінено', warning: 'TRANSLATION_WARNING_UNCHANGED' },
    location: 'Garage'
  }));

  await page.goto(`/items/${item.id}`);
  await page.mouse.move(600, 400);
  await openItemActions(page);
  await page.getByRole('link', { name: 'Translate with AI' }).click();
  await expect(page).toHaveURL(`/items/${item.id}/edit?translate=item`);
  const dialog = page.getByRole('dialog', { name: 'Translate item with AI' });
  await expect(dialog).toBeVisible();
  // Opening sends nothing. Only texts are offered; places, people, and codes start unchecked.
  expect(requests).toEqual([]);
  await expect(dialog.getByLabel('Source language', { exact: true })).toHaveValue('auto');
  await expect(dialog.getByLabel('Translate into', { exact: true })).toHaveValue('en');
  await expect(choice(dialog, 'Name')).toBeChecked();
  await expect(choice(dialog, 'Description')).toBeChecked();
  await expect(choice(dialog, 'Remarks')).toBeChecked();
  await expect(choice(dialog, 'Model')).not.toBeChecked();
  await expect(choice(dialog, 'Location')).not.toBeChecked();
  await expect(choice(dialog, 'Transferred To')).not.toBeChecked();
  await expect(choice(dialog, 'Location')).toHaveAccessibleDescription(/Names a real place or person/);
  for (const absent of ['Condition Notes', 'Serial Number', 'Weight', 'Category', 'Source URL']) await expect(choice(dialog, absent)).toHaveCount(0);
  await expect(dialog.getByText('3 fields selected')).toBeVisible();

  await dialog.getByRole('button', { name: 'Select none' }).click();
  await expect(dialog.getByRole('button', { name: 'Preview translation' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Select all' }).click();
  await expect(dialog.getByText('6 fields selected')).toBeVisible();
  for (const label of ['Model', 'Transferred To']) await choice(dialog, label).uncheck();
  await dialog.getByRole('button', { name: 'Preview translation' }).click();

  await expect(dialog.getByRole('heading', { name: 'Review translations' })).toBeFocused();
  expect(requests).toEqual([{
    targetLanguage: 'en', sourceLanguage: 'auto', categoryId: category.id,
    fields: [
      { key: 'name', text: item.name }, { key: 'description', text: '更换了皮带' },
      { key: `field:${remarks}`, text: 'Ремінь замінено' }, { key: 'location', text: 'Гараж' }
    ]
  }]);
  // Real translations are on, an unchanged text is shown with its reason and stays off.
  await expect(dialog.getByRole('checkbox', { name: 'Apply to Name' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Apply to Remarks' })).not.toBeChecked();
  await expect(dialog.getByText('The text is already in the target language.')).toBeVisible();
  await expect(dialog.getByText('This field names a real place or person: check every translated name.')).toBeVisible();
  await dialog.getByLabel('Translation of Name').fill('Sony Walkman');
  await dialog.getByRole('checkbox', { name: 'Apply to Description' }).uncheck();
  await dialog.getByRole('button', { name: 'Apply 2 translations' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('2 translations applied to the form. Save item to keep them.')).toBeVisible();
  await expect(page.getByLabel('Name *')).toHaveValue('Sony Walkman');
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Garage');
  await expect(page.getByLabel('Description')).toHaveValue('更换了皮带');
  await expect(page.getByLabel('Transferred To')).toHaveValue('Олена');
  // Nothing is stored before Save item: no write and no history event.
  expect((await (await request.get(`/api/items/${item.id}`)).json()).name).toBe(item.name);
  expect(await (await request.get(`/api/items/${item.id}/history`)).json()).toEqual(historyBefore);

  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Sony Walkman' })).toBeVisible();
  const saved = await (await request.get(`/api/items/${item.id}`)).json();
  expect(saved).toMatchObject({
    id: before.id, uuid: before.uuid, name: 'Sony Walkman', location: 'Garage', description: '更换了皮带', transferred_to: 'Олена',
    category_id: category.id, condition_grade: 'good', serial_number: 'SN-48213', purchase_date: '2020-05-01',
    purchase_price: before.purchase_price, source_url: 'https://example.com/walkman', lifecycle_status: 'active'
  });
  expect(saved.photos.map(photo => photo.id)).toEqual(before.photos.map(photo => photo.id));
  expect(saved.fields).toEqual(before.fields);
  expect(requests).toHaveLength(1);
});

test('an unsaved new draft: mixed languages, any target language, Cancel, and selective apply', async ({ page, request }) => {
  const category = await createCategory(request, unique('Radios'), [{ name: 'Remarks', type: 'text' }]);
  const [remarks] = await fieldIds(request, category);
  const requests = await interceptTranslation(page, body => reply(body, {
    name: 'Радіо Sony ICF-SW7600', description: 'Працює, антена погнута', condition_notes: 'Подряпини', [`field:${remarks}`]: 'Батареї AA ×4'
  }, null));

  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('ソニー ラジオ ICF-SW7600');
  await page.getByLabel('Description').fill('能用，天线 bent');
  await page.getByLabel('Condition Notes').fill('Kratzer');
  await page.getByLabel('Remarks').fill('电池 AA ×4');
  await page.getByLabel('Serial Number').fill('7600-123');

  await page.getByRole('button', { name: 'Translate with AI' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate item with AI' });
  // The current, unsaved values are offered, and Ukrainian is a target under the English interface.
  await expect(dialog.getByText('能用，天线 bent')).toBeVisible();
  await dialog.getByRole('searchbox', { name: 'Search languages for Translate into' }).fill('ukrain');
  await expect(dialog.getByLabel('Translate into', { exact: true })).toHaveValue('uk');
  await dialog.getByRole('button', { name: 'Preview translation' }).click();
  await expect(dialog.getByLabel('Translation of Description')).toHaveValue('Працює, антена погнута');
  expect(requests[0]).toMatchObject({ targetLanguage: 'uk', sourceLanguage: 'auto' });
  expect(requests[0].fields.map(field => field.key)).toEqual(['name', 'description', 'condition_notes', `field:${remarks}`]);

  // Cancel after a preview changes nothing.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Name *')).toHaveValue('ソニー ラジオ ICF-SW7600');

  // A new dialog starts from the defaults. Change selection goes back with the choice kept; an
  // explicit source is sent as chosen.
  await page.getByRole('button', { name: 'Translate with AI' }).click();
  await expect(dialog.getByLabel('Translate into', { exact: true })).toHaveValue('en');
  await dialog.getByLabel('Translate into', { exact: true }).selectOption('uk');
  await dialog.getByLabel('Source language', { exact: true }).selectOption('ja');
  await choice(dialog, 'Condition Notes').uncheck();
  await dialog.getByRole('button', { name: 'Preview translation' }).click();
  await dialog.getByRole('button', { name: 'Change selection' }).click();
  await expect(choice(dialog, 'Condition Notes')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Preview translation' }).click();
  expect(requests[2]).toMatchObject({ sourceLanguage: 'ja', targetLanguage: 'uk' });
  expect(requests[2].fields.map(field => field.key)).toEqual(['name', 'description', `field:${remarks}`]);
  await dialog.getByRole('checkbox', { name: 'Apply to Name' }).uncheck();
  await dialog.getByRole('button', { name: 'Apply 2 translations' }).click();

  await expect(page.getByLabel('Name *')).toHaveValue('ソニー ラジオ ICF-SW7600');
  await expect(page.getByLabel('Description')).toHaveValue('Працює, антена погнута');
  await expect(page.getByLabel('Remarks')).toHaveValue('Батареї AA ×4');
  await expect(page.getByLabel('Condition Notes')).toHaveValue('Kratzer');
  await expect(page.getByLabel('Serial Number')).toHaveValue('7600-123');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'ソニー ラジオ ICF-SW7600' })).toBeVisible();
  const saved = await (await request.get(`/api/items/${page.url().split('/').pop()}`)).json();
  expect(saved).toMatchObject({ description: 'Працює, антена погнута', condition_notes: 'Kratzer', serial_number: '7600-123' });
});

test('a field that changed during the preview cannot be applied until it is previewed again', async ({ page, request }) => {
  const category = await createCategory(request, unique('Cameras'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const requests = await interceptTranslation(page, async body => {
    if (first) { first = false; await gate; }
    return reply(body, Object.fromEntries(body.fields.map(({ key, text }) => [key, `EN ${text}`])), 'de');
  });

  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Kamera');
  await page.getByLabel('Description').fill('Mit Objektiv');
  await page.getByRole('button', { name: 'Translate with AI' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate item with AI' });
  await dialog.getByRole('button', { name: 'Preview translation' }).click();
  await expect.poll(() => requests.length).toBe(1);

  await page.getByLabel('Name *').fill('Kamera mit Tasche');
  release();
  await expect(dialog.getByText('This field changed after the preview', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Apply to Name' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Apply 1 translation' })).toBeEnabled();

  await dialog.getByRole('button', { name: 'Preview again' }).click();
  await expect(dialog.getByLabel('Translation of Name')).toHaveValue('EN Kamera mit Tasche');
  await dialog.getByRole('button', { name: 'Apply 2 translations' }).click();
  await expect(page.getByLabel('Name *')).toHaveValue('EN Kamera mit Tasche');
  await expect(page.getByLabel('Description')).toHaveValue('EN Mit Objektiv');
});

test('limits, withheld proposals, and provider errors are reported, and the form stays usable', async ({ page, request }) => {
  const names = Array.from({ length: 18 }, (_, index) => ({ name: `Note ${index + 1}`, type: 'text' }));
  const category = await createCategory(request, unique('Archive'), names);
  const ids = await fieldIds(request, category);
  let answer = body => reply(body, {
    name: 'Box',
    description: { status: 'invalid', translation: null, warning: 'TRANSLATION_WARNING_MISSING' }
  });
  const requests = await interceptTranslation(page, body => answer(body));

  await page.goto('/items/new');
  await page.mouse.move(600, 400);
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Kiste');
  await page.getByLabel('Description').fill('Alte Briefe');
  await page.getByLabel('Condition Notes').fill('Feucht');
  for (const id of ids) await page.locator(`#field-${id}`).fill(`Notiz ${id}`);

  await page.getByRole('button', { name: 'Translate with AI' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate item with AI' });
  await expect(dialog.getByRole('alert')).toContainText('Translate at most 20 fields at once. Clear some fields');
  await expect(dialog.getByRole('button', { name: 'Preview translation' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Select none' }).click();
  await choice(dialog, 'Name').check();
  await choice(dialog, 'Description').check();
  await expect(dialog.getByRole('alert')).toHaveCount(0);

  // A field without a valid proposal is shown with its reason and offers nothing to apply.
  await dialog.getByRole('button', { name: 'Preview translation' }).click();
  await expect(dialog.getByText('AI returned no translation for this field.')).toBeVisible();
  await expect(dialog.getByLabel('Translation of Description')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Apply to Description' })).toHaveCount(0);

  answer = () => ({ status: 409, body: { error: { code: 'AI_DISABLED', params: {} } } });
  await dialog.getByRole('button', { name: 'Preview again' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('AI features are disabled. Enable them in Settings.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(requests).toHaveLength(2);
  await expect(page.getByLabel('Name *')).toHaveValue('Kiste');
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: 'Kiste' })).toBeVisible();
});

test('without AI there is no Translate with AI action, and templates never offer it', async ({ page, request }) => {
  const category = await createCategory(request, unique('Lamps'));
  const item = await createItem(request, { name: unique('Lampe'), category_id: category.id });
  await capabilities(page, false);
  await page.goto(`/items/${item.id}`);
  await page.mouse.move(600, 400);
  await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
  await openItemActions(page);
  await expect(page.getByRole('link', { name: 'Duplicate' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Translate with AI' })).toHaveCount(0);
  // A direct address opens only the form.
  await page.goto(`/items/${item.id}/edit?translate=item`);
  await expect(page.getByLabel('Name *')).toHaveValue(item.name);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Translate with AI' })).toHaveCount(0);

  await page.unroute('**/api/capabilities');
  await capabilities(page);
  await page.goto('/templates/new');
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Default item name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Translate with AI' })).toHaveCount(0);
});

test('the dialog works from the keyboard on a phone', async ({ page, request }) => {
  const category = await createCategory(request, unique('Clocks'));
  const requests = await interceptTranslation(page, body => reply(body, { name: 'Clock', description: 'Wind daily' }, 'de'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/items/new');
  await page.getByLabel('Category').selectOption(String(category.id));
  await page.getByLabel('Name *').fill('Uhr');
  await page.getByLabel('Description').fill('Täglich aufziehen');

  await page.getByRole('button', { name: 'Translate with AI' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Translate item with AI' });
  await expect(dialog.getByRole('heading', { name: 'Translate item with AI' })).toBeFocused();
  const box = await dialog.locator('.modal-content').boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await choice(dialog, 'Description').focus();
  await page.keyboard.press('Space');
  await expect(choice(dialog, 'Description')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Preview translation' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Translation of Name')).toHaveValue('Clock');
  expect(requests[0].fields).toEqual([{ key: 'name', text: 'Uhr' }]);
  await dialog.getByRole('button', { name: 'Apply 1 translation' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name *')).toHaveValue('Clock');

  // Escape closes without changing anything.
  await page.getByRole('button', { name: 'Translate with AI' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Description')).toHaveValue('Täglich aufziehen');
  expect(requests).toHaveLength(1);
});
