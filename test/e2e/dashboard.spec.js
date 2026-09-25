import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

// Every chart is an image whose accessible name starts with its kind and carries its values.
const CHARTS = {
  photo: /^Photo coverage chart/,
  placement: /^Placement chart/,
  recent: /^Daily items added/,
  categories: /^Treemap of items by category/,
  conditions: /^Donut chart of items by condition/,
  fields: /^Radar chart of field coverage/,
  locations: /^Bar chart of items by location/
};
const chart = (page, name) => page.getByRole('img', { name: CHARTS[name] });
const expectDrawn = async (page, names) => {
  for (const name of names) await expect(chart(page, name).locator('svg.apexcharts-svg')).toBeVisible();
};

const emptyDashboard = {
  scope: { categoryId: null, categoryName: null },
  categories: [],
  totalItems: 0,
  photoCoverage: { withPhotos: 0, withoutPhotos: 0, percentage: 0 },
  placement: { insideContainer: 0, directLocation: 0, unplaced: 0 },
  addedLast30Days: 0,
  recentActivity: Array.from({ length: 31 }, (_, day) => ({ date: `2026-08-${String(day + 1).padStart(2, '0')}`, count: 0 })),
  categoryDistribution: [],
  conditionDistribution: [],
  fieldCoverage: ['photos', 'placement', 'condition', 'purchaseDate', 'purchasePrice', 'serialNumber']
    .map(key => ({ key, count: 0, percentage: 0 })),
  locationDistribution: []
};

test('renders dashboard metrics and synchronizes the category filter with the URL', async ({ page, request }) => {
  const category = await createCategory(request, unique('Dashboard cameras'));
  const emptyCategory = await createCategory(request, unique('Dashboard empty'));
  const cabinet = unique('Cabinet');
  const box = await createItem(request, { name: unique('Box'), category_id: category.id, condition: ' Good ', location: cabinet });
  await createItem(request, { name: unique('Camera'), category_id: category.id, location: 'Attic', parent_item_id: box.id, serial_number: 'SN-1' });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  for (const title of ['Total items', 'Photo coverage', 'Placement status', 'Added in the last 30 days']) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  for (const title of ['Items by category', 'Condition breakdown', 'Field coverage', 'Items by location']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await expectDrawn(page, Object.keys(CHARTS));
  await expect(page.getByRole('button', { name: new RegExp(`Filter dashboard by ${category.name}`) })).toBeVisible();

  await page.getByLabel('Category', { exact: true }).selectOption(String(category.id));
  await expect(page).toHaveURL(`/dashboard?categoryId=${category.id}`);
  await expect(page.getByRole('button', { name: new RegExp(`Filter dashboard by ${category.name}`) })).toHaveAttribute('aria-pressed', 'true');
  // Every scoped chart follows the category; the contained camera counts at its box's location.
  await expect(chart(page, 'photo')).toHaveAccessibleName(/0% of items have photos/);
  await expect(chart(page, 'placement')).toHaveAccessibleName(/Inside a container: 1, Direct location: 1, Unplaced: 0/);
  await expect(chart(page, 'recent')).toHaveAccessibleName(/2 in total/);
  await expect(chart(page, 'conditions')).toHaveAccessibleName(/Not specified: 1, Good: 1/);
  await expect(chart(page, 'fields')).toHaveAccessibleName(/Placement: 100% \(2 \/ 2\).*Serial number: 50% \(1 \/ 2\)/);
  await expect(chart(page, 'locations')).toHaveAccessibleName(new RegExp(`location\\. ${cabinet}: 2$`));
  await expect(page.getByText('50% (1 / 2)').first()).toBeVisible();
  await expectDrawn(page, Object.keys(CHARTS));
  expect(await page.locator('.apexcharts-canvas').count()).toBe(Object.keys(CHARTS).length);

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('');

  await page.getByLabel('Category', { exact: true }).selectOption(String(emptyCategory.id));
  await expect(page.getByText(`No items in ${emptyCategory.name}`)).toBeVisible();
  await expect(page.getByText('No items in this scope.')).toHaveCount(3);
  await expect(page.getByText('No condition data in this scope.')).toBeVisible();
  await expectDrawn(page, ['photo', 'recent', 'categories']);
  await expect(chart(page, 'fields')).toHaveCount(0);
  await expect(chart(page, 'locations')).toHaveCount(0);
});

test('the category treemap and its keyboard buttons both filter the dashboard', async ({ page }) => {
  const categories = [{ id: 101, name: 'Cameras' }, { id: 102, name: 'Tools' }];
  const distribution = selected => [
    { categoryId: 101, label: 'Cameras', count: 20, selected: selected === 101 },
    { categoryId: 102, label: 'Tools', count: 8, selected: selected === 102 },
    { categoryId: null, label: 'Other', count: 3, selected: false }
  ];
  await page.route('**/api/dashboard*', route => {
    const selected = Number(new URL(route.request().url()).searchParams.get('categoryId')) || null;
    const category = categories.find(entry => entry.id === selected);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...emptyDashboard,
        categories,
        scope: { categoryId: selected, categoryName: category?.name || null },
        totalItems: 31,
        categoryDistribution: distribution(selected)
      })
    });
  });
  await page.goto('/dashboard');
  await page.mouse.move(600, 400);
  const tiles = chart(page, 'categories').locator('.apexcharts-treemap-rect');
  await expect(tiles).toHaveCount(3);
  await expect(chart(page, 'categories')).toHaveAccessibleName(/Cameras: 20, Tools: 8, Other: 3/);

  await tiles.nth(1).click();
  await expect(page).toHaveURL('/dashboard?categoryId=102');
  await expect(page.getByRole('button', { name: /Filter dashboard by Tools/ })).toHaveAttribute('aria-pressed', 'true');
  // Other is not a filter target, neither as a tile nor as a button.
  await tiles.nth(2).click();
  await expect(page).toHaveURL('/dashboard?categoryId=102');
  await expect(page.getByRole('button', { name: /Other/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Filter dashboard by Cameras/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/dashboard?categoryId=101');
  await expect(page.getByRole('button', { name: /Filter dashboard by Cameras/ })).toHaveAttribute('aria-pressed', 'true');
});

test('shows a useful empty-inventory state with zero metrics', async ({ page }) => {
  await page.route('**/api/dashboard', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(emptyDashboard)
  }));
  await page.goto('/dashboard');
  await expect(page.getByText('No items yet')).toBeVisible();
  await expect(chart(page, 'photo')).toHaveAccessibleName(/0% of items have photos/);
  await expect(chart(page, 'photo').getByText('0%')).toBeVisible();
  await expect(page.getByText('No inventory data yet.')).toBeVisible();
  await expect(page.getByText('No condition data in this scope.')).toBeVisible();
  await expect(page.getByText('No items in this scope.')).toHaveCount(3);
  await expectDrawn(page, ['photo', 'recent']);
  for (const name of ['placement', 'categories', 'conditions', 'fields', 'locations']) await expect(chart(page, name)).toHaveCount(0);
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

  // Chart text is drawn in Tabler's body color of the active mode, including after a live switch.
  const valueColor = () => chart(page, 'photo').locator('.apexcharts-datalabel-value').getAttribute('fill');
  await page.setViewportSize({ width: 1440, height: 800 });
  await expectDrawn(page, ['photo']);
  const lightColor = await valueColor();
  await page.locator('aside.navbar-vertical').hover();
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await expect.poll(valueColor).not.toBe(lightColor);
  const darkColor = await valueColor();
  await expect(page.locator('.apexcharts-canvas')).toHaveCount(await page.getByRole('img', { name: /chart|Treemap|Daily items/ }).count());

  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'dark');
  await expect(page.getByText('Condition breakdown')).toBeVisible();
  await expectDrawn(page, ['photo', 'recent']);
  expect(await valueColor()).toBe(darkColor);
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(320);
  expect(browserErrors).toEqual([]);
});
