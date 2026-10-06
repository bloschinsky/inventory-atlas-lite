import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { guideSourceUrl } from '../../landing/site.js';
import { demoURL, landingURL } from './environment.js';

/*
  The public user guide inside the production landing build, under the Pages-style base path (see
  playwright.config.js): rendered from docs/HOW-TO.md and docs/HOW-TO.uk.md, with its table of
  contents, presentation layer, language, and links into the demo.
*/
const guideURL = `${landingURL}guide/`;
const basePath = new URL(landingURL).pathname;
const STORAGE_KEY = 'inventory-atlas.locale';
const uk = JSON.parse(fs.readFileSync(new URL('../../landing/src/locales/uk.json', import.meta.url), 'utf8'));
const en = JSON.parse(fs.readFileSync(new URL('../../landing/src/locales/en.json', import.meta.url), 'utf8'));

const phones = [
  { name: 'small phone', width: 360, height: 800 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'large phone', width: 430, height: 932 }
];
const viewports = [
  ...phones,
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'Full HD', width: 1920, height: 1080 }
];

const sidewaysOverflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const languageButton = page => page.getByRole('navigation', { name: /^(Main|Головна)$/ }).getByRole('button', { name: /^(Language|Мова):/ });
async function chooseLanguage(page, name) {
  await languageButton(page).click();
  await page.getByRole('menu').getByRole('menuitemradio', { name }).click();
}
// A heading has arrived at an anchor: its top sits just under the sticky bars.
async function expectAtTop(page, heading) {
  await expect(heading).toBeInViewport();
  await expect.poll(async () => (await heading.boundingBox()).y).toBeLessThan(220);
}
const toc = page => page.getByRole('navigation', { name: /^(Guide contents|Зміст посібника)$/ });

test('the landing leads to the guide, which keeps the raw Markdown one click away', async ({ page }) => {
  await page.goto(landingURL);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Guide' })).toHaveAttribute('href', `${basePath}guide/`);
  const cta = page.getByRole('link', { name: 'Read the user guide' });
  await expect(cta).toHaveAttribute('href', `${basePath}guide/`);
  await cta.click();
  await expect(page).toHaveURL(guideURL);
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite — Quick How-To' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View source on GitHub' })).toHaveAttribute('href', guideSourceUrl('en'));
  // The product mark goes back to the product page.
  await page.getByRole('link', { name: 'Inventory Atlas Lite', exact: true }).click();
  await expect(page).toHaveURL(landingURL);
});

test('the guide loads under the Pages base path with its own metadata and the landing look', async ({ page }) => {
  const failures = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto(guideURL);

  await expect(page).toHaveTitle('User Guide — Inventory Atlas Lite');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', guideURL);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', guideURL);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${landingURL}og-image.png`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', en.guide.meta.description);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', en.guide.meta.ogTitle);

  // The English guide is the canonical HOW-TO, numbered section by section.
  const article = page.locator('article');
  await expect(article.getByRole('heading', { level: 2 })).toHaveText([
    'What Inventory Atlas Lite does', 'Before you start', 'Recommended first setup', 'Core concepts', 'Basic use cases',
    'Practical example', 'Backup and data safety', 'Limitations and security', 'Quick troubleshooting'
  ]);
  await expect(article.locator('.guide-number').first()).toHaveText('01');
  await expect(article.getByRole('heading', { level: 3, name: 'Browse the storage hierarchy' })).toBeAttached();
  await expect(article.getByText('There is no authentication.')).toBeVisible();

  // Same typeface and dark title band as the product page.
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"Geist Variable"/);
  await expect(page.locator('header')).toHaveAttribute('data-bs-theme', 'dark');
  expect(new URL(await page.locator('link[rel="icon"]').getAttribute('href'), guideURL).pathname.startsWith(basePath)).toBe(true);
  expect(failures).toEqual([]);
});

test('the guide is one accessible document: skip link, landmarks, unique anchors, no heading jumps', async ({ page }) => {
  await page.goto(guideURL);
  await expect(page.locator('article h2').first()).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#guide-content');
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('article')).toHaveCount(1);

  const { ids, levels } = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[id]')].map(element => element.id),
    levels: [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map(heading => Number(heading.tagName[1]))
  }));
  expect(new Set(ids).size).toBe(ids.length);
  expect(levels[0]).toBe(1);
  for (let index = 1; index < levels.length; index += 1) expect(levels[index] - levels[index - 1]).toBeLessThanOrEqual(1);
  expect(levels.filter(level => level === 1)).toHaveLength(1);

  // Every heading has a copyable link to itself.
  const anchor = page.getByRole('link', { name: 'Link to “Core concepts”' });
  await expect(anchor).toHaveAttribute('href', '#core-concepts');
});

test('a shared anchor opens its section, and a reload keeps it', async ({ page }) => {
  await page.goto(`${guideURL}#browse-the-storage-hierarchy`);
  const heading = page.getByRole('heading', { level: 3, name: 'Browse the storage hierarchy' });
  await expectAtTop(page, heading);
  await expect(toc(page).getByRole('link', { name: 'Browse the storage hierarchy' })).toHaveAttribute('aria-current', 'location');

  await page.reload();
  await expectAtTop(page, page.getByRole('heading', { level: 3, name: 'Browse the storage hierarchy' }));
  await expect(page).toHaveURL(`${guideURL}#browse-the-storage-hierarchy`);
});

test('the sticky desktop table of contents moves through the guide and marks the section being read', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // Without smooth scrolling, so each jump has ended before the next step.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(guideURL);
  const contents = toc(page);
  await expect(contents.getByRole('link')).toHaveCount(9);
  await expect(contents.getByRole('link', { name: /Core concepts/ })).not.toHaveAttribute('aria-current');

  await contents.getByRole('link', { name: /Backup and data safety/ }).click();
  await expect(page).toHaveURL(`${guideURL}#backup-and-data-safety`);
  await expectAtTop(page, page.getByRole('heading', { level: 2, name: 'Backup and data safety' }));
  await expect(contents.getByRole('link', { name: /Backup and data safety/ })).toHaveAttribute('aria-current', 'location');
  // The sidebar stays on screen while the article scrolls.
  await expect(contents).toBeInViewport();

  // The subsections of the section being read open under it, and work with the keyboard.
  await contents.getByRole('link', { name: /Basic use cases/ }).click();
  await expectAtTop(page, page.getByRole('heading', { level: 2, name: 'Basic use cases' }));
  const subsection = contents.getByRole('link', { name: 'Save and use item templates' });
  await expect(subsection).toBeVisible();
  await subsection.focus();
  await page.keyboard.press('Enter');
  await expectAtTop(page, page.getByRole('heading', { level: 3, name: 'Save and use item templates' }));
  await expect(subsection).toHaveAttribute('aria-current', 'location');
});

test('on a phone the guide has a compact On this page panel instead of the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(guideURL);
  await expect(page.locator('.guide-aside')).toBeHidden();
  const toggle = page.getByRole('button', { name: /On this page/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(toc(page)).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toc(page).getByRole('link', { name: /Core concepts/ }).click();
  await expect(toc(page)).toBeHidden();
  await expectAtTop(page, page.getByRole('heading', { level: 2, name: 'Core concepts' }));
  // The bar stays under the navigation and names the section being read.
  await expect(toggle).toBeInViewport();
  await expect(toggle).toContainText('Core concepts');
  expect((await toggle.boundingBox()).height).toBeLessThan(80);

  await toggle.click();
  await expect(toc(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toc(page)).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('the guide shows the landing screenshots of its language and opens them in the viewer', async ({ page }) => {
  await page.goto(`${guideURL}#browse-the-storage-hierarchy`);
  const figure = page.locator('#browse-the-storage-hierarchy').locator('xpath=ancestor::section[1]').getByRole('figure');
  await expect(figure).toHaveAccessibleName('Hierarchy · Grouped by location');
  const image = figure.getByRole('img', { name: /The Hierarchy tree grouped by location/ });
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth)).toBeGreaterThan(0);
  expect(new URL(await image.evaluate(element => element.currentSrc)).pathname.startsWith(`${basePath}assets/screenshots/en/`)).toBe(true);

  await figure.getByRole('link').click();
  const viewer = page.getByRole('dialog', { name: 'Hierarchy · Grouped by location' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img', { name: /The Hierarchy tree grouped by location/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(figure.getByRole('link')).toBeFocused();
});

test('concept diagrams are text, worded in the page language', async ({ page }) => {
  await page.goto(`${guideURL}#core-concepts`);
  const containment = page.getByRole('figure', { name: en.guide.diagrams.containment.title });
  await expect(containment.getByRole('listitem')).toHaveCount(3);
  await expect(containment.getByRole('listitem').first()).toContainText('Location');
  await expect(page.getByRole('figure', { name: en.guide.diagrams.fields.title }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('figure', { name: en.guide.diagrams.backup.title })).toBeAttached();

  await chooseLanguage(page, 'Українська');
  const ukContainment = page.getByRole('figure', { name: uk.guide.diagrams.containment.title });
  await expect(ukContainment.getByRole('listitem').first()).toContainText(uk.guide.diagrams.containment.steps[0].term);
  await expect(page.getByRole('figure', { name: uk.guide.diagrams.backup.title }).getByRole('listitem')).toHaveCount(3);
});

test('tables and code blocks scroll inside their own box on a phone, never the page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${guideURL}#recommended-first-setup`);
  const table = page.locator('#recommended-first-setup').locator('xpath=ancestor::section[1]').locator('.guide-scroll').first();
  await table.scrollIntoViewIfNeeded();
  await expect(table.getByRole('table')).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['Provider', 'Default base URL', 'API key']);
  expect(await table.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(table).toHaveAttribute('tabindex', '0');

  const code = page.locator('pre').first();
  await code.scrollIntoViewIfNeeded();
  await expect(code).toContainText('"version": 1');
  const box = await code.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});

test('Try this in Demo opens the page a section describes, in the guide language, and only where the demo can', async ({ page }) => {
  await page.goto(`${guideURL}#browse-the-storage-hierarchy`);
  const section = id => page.locator(`#${id}`).locator('xpath=ancestor::section[1]');
  const demo = section('browse-the-storage-hierarchy').getByRole('link', { name: 'Try this in Demo (opens in a new tab)' }).first();
  await expect(demo).toHaveAttribute('href', `${demoURL}?lang=en#/hierarchy`);
  await expect(demo).toHaveAttribute('target', '_blank');
  await expect(demo).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(section('read-and-filter-the-dashboard').getByRole('link', { name: /Try this in Demo/ })).toHaveAttribute('href', `${demoURL}?lang=en#/dashboard`);
  await expect(section('pack-or-verify-items-with-a-checklist').getByRole('link', { name: /Try this in Demo/ })).toHaveAttribute('href', `${demoURL}?lang=en#/checklists`);

  // Server-only features say so instead of pretending to work in the demo.
  for (const id of ['restore-a-backup', 'back-up-to-dropbox-or-google-drive', 'check-for-a-newer-version-and-update', 'create-an-item-from-a-photo-or-a-description-with-ai']) {
    await expect(section(id).getByText('Requires a self-hosted installation.')).toHaveCount(1);
    await expect(section(id).getByRole('link', { name: /Try this in Demo/ })).toHaveCount(0);
  }
  // Their detailed instructions stay in the guide.
  await expect(section('restore-a-backup').getByText('Type RESTORE in the confirmation field.', { exact: false })).toBeAttached();

  await chooseLanguage(page, 'Українська');
  const ukDemo = section('browse-the-storage-hierarchy').getByRole('link', { name: `${uk.guide.demo} ${uk.hero.newTab}` });
  await expect(ukDemo).toHaveAttribute('href', `${demoURL}?lang=uk#/hierarchy`);
  const [tab] = await Promise.all([page.context().waitForEvent('page'), ukDemo.click()]);
  await expect(tab.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(tab.getByRole('heading', { level: 1, name: 'Ієрархія' })).toBeVisible();
  await tab.close();
});

test('a language change translates the guide in place and keeps the section being read', async ({ page }) => {
  await page.goto(`${guideURL}#pack-or-verify-items-with-a-checklist`);
  await expectAtTop(page, page.getByRole('heading', { level: 3, name: 'Pack or verify items with a checklist' }));
  const englishShot = await page.locator('article img').first().getAttribute('src');

  await chooseLanguage(page, 'Українська');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  // The Ukrainian translation, under the same anchor.
  await expectAtTop(page, page.getByRole('heading', { level: 3, name: 'Пакувати або перевіряти предмети за чек-листом' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite — короткий посібник' })).toBeVisible();
  await expect(page.locator('article').getByRole('heading', { level: 2 }).first()).toHaveText('Що вміє Inventory Atlas Lite');
  await expect(toc(page).getByRole('link', { name: 'Пакувати або перевіряти предмети за чек-листом' })).toHaveAttribute('aria-current', 'location');
  await expect(page).toHaveTitle(uk.guide.meta.title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', uk.guide.meta.description);
  await expect(page.getByRole('link', { name: uk.guide.source })).toHaveAttribute('href', guideSourceUrl('uk'));
  await expect(page.getByRole('navigation', { name: uk.nav.label }).getByRole('link', { name: uk.nav.guide, exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('uk');

  // The screenshots follow the language, with Ukrainian captions.
  const image = page.locator('article img').first();
  await expect.poll(() => image.getAttribute('src')).not.toBe(englishShot);
  const figure = page.locator('#pack-or-verify-items-with-a-checklist').locator('xpath=ancestor::section[1]').getByRole('figure');
  await expect(figure).toHaveAccessibleName(uk.screenshots['checklist-run-phone'].caption);
  expect(new URL(await figure.getByRole('img').evaluate(element => element.src)).pathname).toContain('/screenshots/uk/');
  for (const english of ['On this page', 'View source on GitHub', 'Try this in Demo', 'Skip to content']) {
    await expect(page.getByText(english, { exact: true })).toHaveCount(0);
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expectAtTop(page, page.getByRole('heading', { level: 3, name: 'Пакувати або перевіряти предмети за чек-листом' }));
});

test('one language choice carries through the landing, the guide, and the demo', async ({ page }) => {
  await page.goto(landingURL);
  await chooseLanguage(page, 'Українська');
  await page.getByRole('link', { name: uk.final.guide }).click();
  await expect(page).toHaveURL(guideURL);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite — короткий посібник' })).toBeVisible();
  await expect(page.locator('header').getByRole('link', { name: `${uk.hero.demo} ${uk.hero.newTab}` })).toHaveAttribute('href', `${demoURL}?lang=uk#/dashboard`);

  await chooseLanguage(page, 'English');
  await page.getByRole('link', { name: 'Inventory Atlas Lite', exact: true }).click();
  await expect(page).toHaveURL(landingURL);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 2, name: 'Everything has a place' })).toBeVisible();
});

for (const viewport of viewports) {
  test(`the guide fits a ${viewport.name} screen without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${guideURL}#core-concepts`);
    await expect(page.getByRole('heading', { level: 2, name: 'Core concepts' })).toBeInViewport();
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    await page.goto(`${guideURL}#quick-troubleshooting`);
    await expect(page.getByRole('heading', { level: 2, name: 'Quick troubleshooting' })).toBeInViewport();
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    // The sidebar is for wide screens only.
    await expect(page.locator('.guide-aside')).toBeVisible({ visible: viewport.width >= 992 });
    await expect(page.getByRole('button', { name: /On this page/ })).toBeVisible({ visible: viewport.width < 992 });
  });
}

for (const viewport of phones) {
  test(`the guide keeps the 24 px landing gutter on a ${viewport.width} px phone`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${guideURL}#read-and-filter-the-dashboard`);
    const width = await page.evaluate(() => document.body.clientWidth);
    const section = page.locator('#read-and-filter-the-dashboard').locator('xpath=ancestor::section[1]');
    for (const element of [
      page.getByRole('heading', { level: 3, name: 'Read and filter the Dashboard' }),
      section.getByRole('link', { name: /Try this in Demo/ }),
      section.getByRole('figure').getByRole('img'),
      section.locator('.guide-prose li').first(),
      page.getByRole('button', { name: /On this page/ })
    ]) {
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(23.5);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 23.5);
    }
    const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
    expect(nav.height).toBeLessThanOrEqual(72);
  });
}
