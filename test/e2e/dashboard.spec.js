import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

test('renders dashboard metrics and synchronizes the category filter with the URL', async ({ page, request }) => {
  const category = await createCategory(request, unique('Dashboard cameras'));
  const emptyCategory = await createCategory(request, unique('Dashboard empty'));
  await createItem(request, { name: unique('Camera'), category_id: category.id, condition: ' Good ', location: 'Cabinet' });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Photo coverage')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`Filter dashboard by ${category.name}`) })).toBeVisible();

  await page.getByLabel('Category', { exact: true }).selectOption(String(category.id));
  await expect(page).toHaveURL(`/dashboard?categoryId=${category.id}`);
  await expect(page.getByRole('button', { name: new RegExp(`Filter dashboard by ${category.name}`) })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('');

  await page.getByLabel('Category', { exact: true }).selectOption(String(emptyCategory.id));
  await expect(page.getByText(`No items in ${emptyCategory.name}`)).toBeVisible();
});

test('shows a useful empty-inventory state with zero metrics', async ({ page }) => {
  await page.route('**/api/dashboard', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      scope: { categoryId: null, categoryName: null },
      categories: [],
      totalItems: 0,
      photoCoverage: { withPhotos: 0, withoutPhotos: 0, percentage: 0 },
      placement: { insideContainer: 0, directLocation: 0, unplaced: 0 },
      addedLast30Days: 0,
      categoryDistribution: [],
      conditionDistribution: []
    })
  }));
  await page.goto('/dashboard');
  await expect(page.getByText('No items yet')).toBeVisible();
  await expect(page.getByText('0%')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add item' })).toHaveCount(2);
});

test('shows loading, errors with retry, and ignores an older filter response', async ({ page, request }) => {
  const slowCategory = await createCategory(request, unique('Slow category'));
  const fastCategory = await createCategory(request, unique('Fast category'));
  await createItem(request, { name: unique('Slow item'), category_id: slowCategory.id });
  await createItem(request, { name: unique('Fast item'), category_id: fastCategory.id });

  let releaseInitial;
  const initialPaused = new Promise(resolve => { releaseInitial = resolve; });
  let dashboardCalls = 0;
  await page.route('**/api/dashboard', async route => {
    dashboardCalls += 1;
    if (dashboardCalls === 1) {
      await initialPaused;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNEXPECTED_ERROR', params: {} } }) });
      return;
    }
    await route.continue();
  });
  const navigation = page.goto('/dashboard');
  await expect(page.getByText('Loading dashboard…')).toBeVisible();
  releaseInitial();
  await navigation;
  await expect(page.getByText('Unexpected server error. The details are in the server log.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Total items')).toBeVisible();

  await page.unroute('**/api/dashboard');
  let releaseSlow;
  let markSlowStarted;
  const slowStarted = new Promise(resolve => { markSlowStarted = resolve; });
  const slowRelease = new Promise(resolve => { releaseSlow = resolve; });
  await page.route(`**/api/dashboard?categoryId=${slowCategory.id}`, async route => {
    markSlowStarted();
    await slowRelease;
    await route.continue().catch(() => {});
  });
  await page.getByLabel('Category', { exact: true }).selectOption(String(slowCategory.id));
  await slowStarted;
  await page.getByRole('button', { name: new RegExp(`Filter dashboard by ${fastCategory.name}`) }).click();
  releaseSlow();
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue(String(fastCategory.id));
  await expect(page.getByText('Refreshing…')).toBeHidden();
  await expect(page.getByRole('button', { name: new RegExp(`Filter dashboard by ${fastCategory.name}`) })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue(String(fastCategory.id));
});

test('dashboard remains readable in light and dark modes at its required widths', async ({ page }) => {
  const browserErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.goto('/dashboard');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Photo coverage')).toBeVisible();
    expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
  }

  await page.evaluate(() => localStorage.setItem('inventory-atlas-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await expect(page.getByText('Condition breakdown')).toBeVisible();
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(320);
  expect(browserErrors).toEqual([]);
});
