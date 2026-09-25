import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createI18n } from 'vue-i18n';
import {
  DEFAULT_LOCALE, SUPPORTED_LOCALES, createI18nOptions, formatDate, formatDateTime, formatFileSize, formatMoney,
  formatNumber, resolveLocale
} from '../client/src/i18n/core.js';

const localesDir = path.resolve(import.meta.dirname, '../client/src/i18n/locales');
const messages = Object.fromEntries(SUPPORTED_LOCALES.map(({ code }) =>
  [code, JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8'))]));

const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) =>
  child && typeof child === 'object' ? flatten(child, `${prefix}${key}.`) : [[`${prefix}${key}`, child]]);
const keys = Object.fromEntries(Object.entries(messages).map(([code, tree]) => [code, new Map(flatten(tree))]));

const translator = (locale, localeMessages = messages) => createI18n(createI18nOptions({ locale, messages: localeMessages })).global;

// Every placeholder a message may use gets a value, so a rendered message can never come out empty.
const params = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? `<${name}>` : undefined), has: () => true });

test('English is the default and the fallback for a missing or unsupported saved language', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
  for (const saved of [null, undefined, '', 'de', 'EN', 'uk-UA']) assert.equal(resolveLocale(saved), 'en', String(saved));
  assert.equal(resolveLocale('uk'), 'uk');
  const options = createI18nOptions({ locale: null, messages });
  assert.equal(options.locale, 'en');
  assert.equal(options.fallbackLocale, 'en');
  assert.equal(translator(null).t('nav.items'), 'Items');
});

test('English and Ukrainian define exactly the same keys, with a value for every one', () => {
  assert.deepEqual([...keys.uk.keys()].sort(), [...keys.en.keys()].sort());
  for (const [code, entries] of Object.entries(keys)) {
    for (const [key, value] of entries) assert.ok(typeof value === 'string' && value.trim(), `${code}: ${key} is empty`);
  }
});

test('every message of both locales compiles and renders without warnings', t => {
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  for (const code of Object.keys(messages)) {
    const { t: translate } = translator(code);
    for (const key of keys[code].keys()) {
      const rendered = translate(key, params, 1);
      assert.ok(rendered && rendered !== key, `${code}: ${key} did not render`);
    }
  }
  assert.deepEqual(warnings, []);
});

test('a key missing from Ukrainian falls back to English instead of an empty string', () => {
  const partial = { en: messages.en, uk: { ...messages.uk, nav: { ...messages.uk.nav } } };
  delete partial.uk.nav.items;
  const { t } = createI18n(createI18nOptions({ locale: 'uk', messages: partial })).global;
  assert.equal(t('nav.items'), 'Items');
  assert.equal(t('nav.dashboard'), messages.uk.nav.dashboard);
});

test('Ukrainian counts use the one, few, and many forms', () => {
  const { t } = translator('uk');
  const forms = { 0: '0 предметів', 1: '1 предмет', 2: '2 предмети', 4: '4 предмети', 5: '5 предметів', 11: '11 предметів',
    14: '14 предметів', 21: '21 предмет', 22: '22 предмети', 25: '25 предметів', 101: '101 предмет' };
  for (const [count, expected] of Object.entries(forms)) assert.equal(t('items.count', Number(count)), expected);
  const english = translator('en').t;
  assert.equal(english('items.count', 0), '0 items');
  assert.equal(english('items.count', 1), '1 item');
  assert.equal(english('items.count', 2), '2 items');
});

test('user data passed into a message is inserted as it is, never translated', () => {
  const name = 'Items & Categories: Photo';
  for (const code of Object.keys(messages)) assert.ok(translator(code).t('items.transferredTo', { name }).endsWith(name));
});

test('dates follow the active locale without shifting the stored calendar day', () => {
  assert.equal(formatDate('2024-11-18', 'en'), 'Nov 18, 2024');
  assert.match(formatDate('2024-11-18', 'uk'), /^18 лист\. 2024/);
  // SQLite timestamps are UTC; the time zone is fixed here so the check does not depend on the machine.
  assert.equal(formatDateTime('2024-11-18 21:05:00', 'en', 'UTC'), 'Nov 18, 2024, 9:05 PM');
  assert.match(formatDateTime('2024-11-18 21:05:00', 'uk', 'UTC'), /^18 лист\. 2024.*21:05$/);
  assert.equal(formatDateTime('2024-11-18T21:05:00.000Z', 'en', 'Europe/Kyiv'), 'Nov 18, 2024, 11:05 PM');
  assert.equal(formatDate('', 'en'), '');
  assert.equal(formatDate('not-a-date', 'en'), 'not-a-date');
});

// Intl separates groups and units with no-break spaces; the expectations are written with plain ones.
const spaced = value => value.replace(/\s/g, ' ');

test('numbers, money, and file sizes follow the active locale and keep every stored decimal', () => {
  assert.equal(spaced(formatNumber(1234567.5, 'en')), '1,234,567.5');
  assert.equal(spaced(formatNumber(1234567.5, 'uk')), '1 234 567,5');
  assert.equal(spaced(formatMoney('49.99', 'USD', 'en')), '$49.99');
  assert.equal(spaced(formatMoney('39.50', 'EUR', 'en')), '€39.50');
  assert.equal(spaced(formatMoney('1500', 'UAH', 'en')), 'UAH 1,500.00');
  assert.equal(spaced(formatMoney('1500', 'UAH', 'uk')), '1 500,00 ₴');
  assert.equal(spaced(formatMoney('49.99', 'USD', 'uk')), '49,99 USD');
  assert.equal(spaced(formatMoney('12.3456', 'USD', 'en')), '$12.3456');
  assert.equal(spaced(formatMoney('7', 'JPY', 'en')), '¥7');
  assert.equal(spaced(formatMoney('', 'USD', 'en')), '');
  assert.equal(spaced(formatFileSize(512, 'en')), '512 byte');
  assert.equal(spaced(formatFileSize(1536, 'en')), '2 kB');
  assert.equal(spaced(formatFileSize(1.5 * 1024 * 1024, 'en')), '1.5 MB');
  assert.equal(spaced(formatFileSize(1.5 * 1024 * 1024, 'uk')), '1,5 МБ');
  assert.equal(spaced(formatFileSize(25 * 1024 * 1024, 'uk')), '25 МБ');
});
