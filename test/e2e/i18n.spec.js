import { expect, test } from '@playwright/test';
import { createCategory, createItem, detail, unique } from './helpers.js';

const STORAGE_KEY = 'inventory-atlas.locale';
const heading = page => page.getByRole('heading', { level: 1 });
const storedLocale = page => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
// Runs before every navigation, so it only fills in a missing choice and never overrides a later one.
const inUkrainian = page => page.addInitScript(key => { if (!localStorage.getItem(key)) localStorage.setItem(key, 'uk'); }, STORAGE_KEY);

test('the interface is English until another language is chosen', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(heading(page)).toHaveText('Dashboard');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await storedLocale(page)).toBeNull();
});

test('Settings switches the language at once, and the choice survives a reload', async ({ page }) => {
  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const language = page.getByLabel('Language');
  await expect(language).toHaveValue('en');
  await expect(language.getByRole('option')).toHaveText(['English', 'Українська']);

  await language.selectOption('uk');
  // No reload: the page, the shared navigation, and the document language follow immediately.
  await expect(heading(page)).toHaveText('Налаштування');
  await expect(page.getByRole('heading', { name: 'Інтерфейс' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Предмети' })).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  expect(await storedLocale(page)).toBe('uk');

  await page.reload();
  await expect(heading(page)).toHaveText('Налаштування');
  await expect(page.getByLabel('Мова')).toHaveValue('uk');

  await page.getByLabel('Мова').selectOption('en');
  await expect(heading(page)).toHaveText('Settings');
  expect(await storedLocale(page)).toBe('en');
});

test('major pages render their Ukrainian interface', async ({ page }) => {
  await inUkrainian(page);
  for (const [path, title] of [
    ['/dashboard', 'Панель'],
    ['/items', 'Предмети'],
    ['/items/new', 'Додати предмет'],
    ['/categories', 'Категорії та поля'],
    ['/data', 'Дані / Резервні копії'],
    ['/scan', 'Сканувати QR'],
    ['/labels/print', 'Друк етикеток']
  ]) {
    await page.goto(path);
    await expect(heading(page)).toHaveText(title);
  }
  await expect(page.getByText('Предмети не вибрано')).toBeVisible();

  await page.goto('/items');
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Сортувати за')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Друк етикеток' })).toBeDisabled();
  await page.getByRole('button', { name: 'Про програму' }).first().click();
  const about = page.getByRole('dialog', { name: 'Про програму' });
  await expect(about.getByRole('button', { name: 'Перевірити оновлення' })).toBeVisible();
  await about.getByRole('button', { name: 'Закрити «Про програму»' }).click();
  await expect(about).toBeHidden();
});

test('Ukrainian formats dates and money but never translates or changes the item itself', async ({ page, request }) => {
  const categoryName = unique('Photo gear');
  const category = await createCategory(request, categoryName, [{ name: 'Mount', type: 'boolean' }]);
  const name = unique('Camera Items & Photo');
  const item = await createItem(request, {
    name, category_id: category.id, condition: 'Good', location: 'Shelf', description: 'Settings',
    purchase_date: '2024-11-18', purchase_price: { amount: '1500', currency: 'UAH' }, serial_number: 'SN-1',
    field_values: {}
  });
  const before = await (await request.get(`/api/items/${item.id}`)).json();

  await inUkrainian(page);
  await page.goto(`/items/${item.id}`);
  await expect(heading(page)).toHaveText(name);
  await expect(page.getByRole('link', { name: 'Усі предмети' })).toBeVisible();
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();
  await expect(detail(page, 'Стан')).toHaveText('Good');
  await expect(detail(page, 'Опис')).toHaveText('Settings');
  // The hryvnia sign depends on the browser's ICU version: newer data writes ₴, older data грн.
  await expect(detail(page, 'Ціна покупки')).toHaveText(/^1\s500,00\s(₴|грн)$/);
  await expect(detail(page, 'Дата покупки')).toHaveText(/^18 лист\. 2024/);
  await expect(detail(page, 'Mount')).toHaveText('Ні');

  // English formats the same stored values its own way.
  await page.evaluate(key => localStorage.setItem(key, 'en'), STORAGE_KEY);
  await page.reload();
  await expect(detail(page, 'Purchase Price')).toHaveText('UAH 1,500.00');
  await expect(detail(page, 'Purchase Date')).toHaveText('Nov 18, 2024');

  const after = await (await request.get(`/api/items/${item.id}`)).json();
  expect(after).toEqual(before);
});
