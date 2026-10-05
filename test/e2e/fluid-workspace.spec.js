import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

// Normal Tabler gutters on both sides stay well inside this; a shell max-width would not.
const GUTTER_TOLERANCE = 64;

const content = page => page.locator('main.page-body > .app-content');
// How far the document scrolls sideways past the viewport; zero or less means no shell overflow.
const overflow = page => page.locator('html').evaluate(html => html.scrollWidth - html.clientWidth);

// The inner (padding-free) width of the routed content wrapper and the width it may use.
const shellWidths = page => content(page).evaluate(node => {
  const style = getComputedStyle(node);
  return {
    available: node.closest('.page-wrapper').getBoundingClientRect().width,
    inner: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    paddingLeft: parseFloat(style.paddingLeft),
    maxWidth: style.maxWidth
  };
});

const open = async (page, url) => {
  await page.goto(url);
  // A pointer left at (0, 0) would unfold the sidebar over the page.
  await page.mouse.move(900, 500);
};

test('the routed content wrapper is fluid and keeps only the normal gutters at every width', async ({ page }) => {
  await open(page, '/items');
  await expect(content(page)).toHaveClass(/container-fluid/);
  await expect(page.locator('main.page-body .container-xl')).toHaveCount(0);

  for (const width of [1366, 1440, 1920, 2560, 768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Items', exact: true })).toBeVisible();
    const shell = await shellWidths(page);
    expect(shell.maxWidth, `max-width at ${width}px`).toBe('none');
    expect(shell.paddingLeft, `gutter at ${width}px`).toBeGreaterThan(0);
    expect(shell.inner, `content width at ${width}px`).toBeGreaterThan(shell.available - GUTTER_TOLERANCE);
    expect(await overflow(page), `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test.describe('a Full HD desktop', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the Dashboard and its charts fill the wider workspace without overflowing their cards', async ({ page, request }) => {
    const category = await createCategory(request, unique('Wide dashboard'));
    await createItem(request, { name: unique('Wide lamp'), category_id: category.id, location: 'Wide shelf' });

    await open(page, '/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Photo coverage chart/ }).locator('svg.apexcharts-svg')).toBeVisible();

    const { inner } = await shellWidths(page);
    const toolbar = await page.locator('.dashboard-toolbar').boundingBox();
    expect(toolbar.width).toBeGreaterThan(inner - GUTTER_TOLERANCE);
    const overflowingCharts = await page.locator('.apexcharts-canvas').evaluateAll(charts => charts.filter(chart => {
      const card = chart.closest('.card').getBoundingClientRect();
      const box = chart.getBoundingClientRect();
      return box.left < card.left - 0.5 || box.right > card.right + 0.5;
    }).length);
    expect(overflowingCharts).toBe(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the Items table uses the full workspace width', async ({ page, request }) => {
    const category = await createCategory(request, unique('Wide items'));
    const name = unique('Wide drill');
    await createItem(request, { name, category_id: category.id });

    await open(page, '/items');
    await page.getByPlaceholder('Search name, description, serial number, transferred to or text fields…').fill(name);
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    const { inner } = await shellWidths(page);
    const table = await page.getByRole('table').boundingBox();
    expect(table.width).toBeGreaterThan(inner - GUTTER_TOLERANCE);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the Hierarchy tree and graph use the full workspace width', async ({ page, request }) => {
    const category = await createCategory(request, unique('Wide hierarchy'));
    const box = await createItem(request, { name: unique('Wide box'), category_id: category.id, location: unique('Wide room') });
    const inside = await createItem(request, { name: unique('Wide tool'), category_id: category.id, parent_item_id: box.id });

    await open(page, '/hierarchy');
    await page.getByLabel('Search hierarchy').fill(inside.name);
    const treeLink = page.getByRole('link', { name: inside.name, exact: true });
    await expect(treeLink).toBeVisible();
    const { inner } = await shellWidths(page);
    const tree = await treeLink.locator('xpath=ancestor::section[1]').boundingBox();
    expect(tree.width).toBeGreaterThan(inner - GUTTER_TOLERANCE);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    await page.getByText('Graph', { exact: true }).click();
    const graph = page.getByRole('region', { name: 'Storage graph' });
    await expect(graph.getByRole('link', { name: inside.name, exact: true })).toBeVisible();
    expect((await graph.boundingBox()).width).toBeGreaterThan(inner - GUTTER_TOLERANCE);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('forms keep their readable local width', async ({ page }) => {
    for (const url of ['/items/new', '/settings']) {
      await open(page, url);
      const form = page.locator('.form-card').first();
      await expect(form).toBeVisible();
      const width = (await form.boundingBox()).width;
      const limit = await form.evaluate(node => parseFloat(getComputedStyle(node).maxWidth));
      expect(width, url).toBeLessThanOrEqual(limit);
      expect((await shellWidths(page)).inner, url).toBeGreaterThan(limit * 1.5);
    }
  });
});
