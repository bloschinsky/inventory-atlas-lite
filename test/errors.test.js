import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createI18n } from 'vue-i18n';
import { AppError } from '../shared/appError.js';
import { reviewItemDraft } from '../shared/itemImport.js';
import { errorResponse } from '../server/src/http/errorHandler.js';
import { httpError } from '../server/src/httpError.js';
import { createI18nOptions, translateMessage } from '../client/src/i18n/core.js';

const root = path.resolve(import.meta.dirname, '..');
const messages = Object.fromEntries(['en', 'uk'].map(code =>
  [code, JSON.parse(fs.readFileSync(path.join(root, `client/src/i18n/locales/${code}.json`), 'utf8'))]));
const translator = locale => createI18n(createI18nOptions({ locale, messages })).global;
const english = message => translateMessage(translator('en'), message);
const ukrainian = message => translateMessage(translator('uk'), message);

const sourceFiles = directory => fs.readdirSync(directory, { recursive: true })
  .filter(name => name.endsWith('.js'))
  .map(name => path.join(directory, name));

// Upper-case string literals in the backend and shared code that are not error or notice codes.
const NOT_CODES = new Set([
  'ASC', 'DESC', 'DELETE', 'GET', 'PATCH', 'POST', 'PUT', 'S256', 'TEXT', 'UAH', 'UTC', 'WEBP', 'RIFF', 'RESTORE',
  'ENOENT', 'SIGINT', 'SIGTERM', 'SQLITE_CONSTRAINT_UNIQUE', 'LIMIT_FILE_COUNT', 'LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE',
  'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CLOUD_BACKUP_REDIRECT_URI',
  'CLOUD_BACKUP_TEST_ENDPOINT'
]);
const NOTICE_CODES = new Set(['AI_CONNECTED', 'AI_CONNECTED_NO_MODEL_LIST', 'CLOUD_CONNECTED']);

test('every code the backend can send has an English and a Ukrainian message', () => {
  const codes = new Set([...sourceFiles(path.join(root, 'server/src')), ...sourceFiles(path.join(root, 'shared'))]
    .flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/'([A-Z][A-Z0-9_]{2,})'/g)].map(match => match[1]))
    .filter(code => !NOT_CODES.has(code)));
  assert.ok(codes.size > 150, `only ${codes.size} codes were found`);
  for (const code of codes) {
    const namespace = NOTICE_CODES.has(code) ? 'notices' : 'errors';
    for (const locale of ['en', 'uk']) assert.ok(messages[locale][namespace][code], `${namespace}.${code} is missing in ${locale}`);
  }
});

test('application errors keep their status, code, and parameters in the API body', () => {
  assert.deepEqual(errorResponse(httpError(404, 'ITEM_NOT_FOUND')), { status: 404, body: { code: 'ITEM_NOT_FOUND', params: {} } });
  assert.deepEqual(errorResponse(httpError(409, 'ITEM_HAS_CHILDREN', { count: 4 })),
    { status: 409, body: { code: 'ITEM_HAS_CHILDREN', params: { count: 4 } } });
  // Shared validators answer with the same 400 the API used before codes existed.
  assert.deepEqual(errorResponse(new AppError('INVALID_PURCHASE_DATE')), { status: 400, body: { code: 'INVALID_PURCHASE_DATE', params: {} } });
});

test('known infrastructure errors get their documented code and status', () => {
  assert.deepEqual(errorResponse(Object.assign(new Error('UNIQUE constraint failed: categories.name'), { code: 'SQLITE_CONSTRAINT_UNIQUE' })),
    { status: 409, body: { code: 'DUPLICATE_NAME', params: {} } });
  assert.deepEqual(errorResponse(new multer.MulterError('LIMIT_FILE_SIZE')), { status: 400, body: { code: 'UPLOAD_FILE_TOO_LARGE', params: {} } });
  assert.deepEqual(errorResponse(new multer.MulterError('LIMIT_FIELD_KEY')), { status: 400, body: { code: 'UPLOAD_FAILED', params: {} } });
  assert.deepEqual(errorResponse(Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' })),
    { status: 400, body: { code: 'INVALID_JSON_BODY', params: {} } });
  assert.deepEqual(errorResponse(Object.assign(new Error('too large'), { status: 413, type: 'entity.too.large' })),
    { status: 413, body: { code: 'REQUEST_TOO_LARGE', params: {} } });
});

test('an unexpected failure is a 500 without its message, stack, or any detail', () => {
  const failure = new Error('ENOENT: no such file, open /var/lib/inventory-atlas-lite/secret.sqlite');
  const response = errorResponse(failure);
  assert.deepEqual(response, { status: 500, body: { code: 'UNEXPECTED_ERROR', params: {} } });
  const text = JSON.stringify(response.body);
  assert.ok(!text.includes('ENOENT') && !text.includes('/var/lib') && !text.includes('at '), text);
  // A foreign error that only carries a server status is not trusted with its message either.
  assert.deepEqual(errorResponse(Object.assign(new Error('internal'), { status: 502 })), { status: 500, body: { code: 'UNEXPECTED_ERROR', params: {} } });
});

test('error codes are translated with their parameters in English and Ukrainian', () => {
  assert.equal(english({ code: 'ITEM_NOT_FOUND', params: {} }), 'Item not found.');
  assert.equal(ukrainian({ code: 'ITEM_NOT_FOUND', params: {} }), 'Предмет не знайдено.');
  const unavailable = { code: 'CLOUD_PROVIDER_UNAVAILABLE', params: { provider: 'Dropbox', status: 503 } };
  assert.equal(english(unavailable), 'Dropbox is unavailable right now (HTTP 503). Try again later.');
  assert.equal(ukrainian(unavailable), 'Dropbox зараз недоступний (HTTP 503). Спробуйте пізніше.');
  // A parameter that is user data is inserted exactly as it was entered.
  assert.equal(ukrainian({ code: 'INVALID_CUSTOM_FIELD_NUMBER', params: { field: 'Ports & Slots' } }), 'Поле «Ports & Slots» має бути числом.');
});

test('a count parameter selects the plural form of each language', () => {
  const children = count => ({ code: 'ITEM_HAS_CHILDREN', params: { count } });
  assert.equal(english(children(1)), 'This item contains 1 item. Move or delete it first.');
  assert.equal(english(children(4)), 'This item contains 4 items. Move or delete them first.');
  assert.equal(ukrainian(children(1)), 'Цей предмет містить 1 предмет. Спершу перемістіть або видаліть його.');
  assert.equal(ukrainian(children(3)), 'Цей предмет містить 3 предмети. Спершу перемістіть або видаліть їх.');
  assert.equal(ukrainian(children(5)), 'Цей предмет містить 5 предметів. Спершу перемістіть або видаліть їх.');
  assert.equal(ukrainian(children(21)), 'Цей предмет містить 21 предмет. Спершу перемістіть або видаліть його.');
});

test('a nested reason is translated inside its parent message', () => {
  const nested = { code: 'BATCH_ITEM_INVALID', params: { index: 2, reason: { code: 'INVALID_CUSTOM_FIELD_NUMBER', params: { field: 'Ports' } } } };
  assert.equal(english(nested), 'Item 2: Field "Ports" must be a number.');
  assert.equal(ukrainian(nested), 'Предмет 2: Поле «Ports» має бути числом.');
  // The batch preview gets the same bodies from the shared rules, so it shows the API's own wording.
  const review = reviewItemDraft({ name: ' ', purchasePrice: { amount: '1', currency: 'ABC' }, customFields: {} }, []);
  assert.equal(ukrainian(review.name), 'Назва предмета обов\'язкова.');
  assert.equal(english(review.purchasePrice), 'Purchase price currency must be a valid ISO 4217 code.');
});

test('unknown codes, missing codes, and older stored text fail safely', () => {
  assert.equal(english({ code: 'SOMETHING_NEW', params: {} }), 'Something went wrong (SOMETHING_NEW).');
  assert.equal(ukrainian({ code: 'SOMETHING_NEW', params: {} }), 'Щось пішло не так (SOMETHING_NEW).');
  assert.equal(english({}), 'Something went wrong (—).');
  assert.equal(english(undefined), 'Something went wrong (—).');
  // Cloud backup history written before error codes existed keeps its original text.
  assert.equal(ukrainian('Dropbox is full.'), 'Dropbox is full.');
  assert.equal(ukrainian({ code: 'AI_CONNECTED', params: { provider: 'Ollama', count: 2 } }), 'Щось пішло не так (AI_CONNECTED).');
  assert.equal(translateMessage(translator('uk'), { code: 'AI_CONNECTED', params: { provider: 'Ollama', count: 2 } }, 'notices'),
    'Підключено до Ollama. Доступні 2 моделі.');
});
