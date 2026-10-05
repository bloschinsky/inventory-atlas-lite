import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { landingRelease, links, repositoryUrl } from '../../landing/site.js';
import { baseURL, demoURL, landingURL } from './environment.js';

// The public landing page, built for production under a Pages-style base path (see playwright.config.js).
const basePath = new URL(landingURL).pathname;
const release = landingRelease(JSON.parse(fs.readFileSync(new URL('../../shared/release-history.json', import.meta.url), 'utf8')));

const sectionTitles = [
  'Everything has a place',
  'Categories with fields that fit',
  'See it, label it, scan it',
  'Find it fast, check it off',
  'A dashboard for your stuff — and optional AI',
  'Choose how to run it'
];

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

const story = [
  { id: 'hierarchy', marker: '01 / Organize', captions: ['Hierarchy · Grouped by location'] },
  { id: 'items', marker: '02 / Describe', captions: ['Item details · Custom fields'] },
  { id: 'photos-qr', marker: '03 / Label', captions: ['Print Labels · A4 QR sheet'] },
  { id: 'find', marker: '04 / Find', captions: ['Items · Search and filters', 'Checklist run · Phone'] },
  { id: 'dashboard', marker: '05 / Understand', captions: ['Dashboard · Inventory overview'] }
];
const facts = ['Self-hosted', 'SQLite', 'Docker', 'Proxmox', 'No accounts', 'Local-first'];

const sidewaysOverflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the hero offers real install, repository, and demo destinations', async ({ page }) => {
  await page.goto(landingURL);

  await expect(page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite' })).toBeVisible();
  const hero = page.locator('header');
  await expect(hero.getByRole('link', { name: 'Get Inventory Atlas Lite' })).toHaveAttribute('href', links.get);
  await expect(hero.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', repositoryUrl);
  // Try Demo is an extra path next to the install one, never a replacement for it, and opens the
  // demo in a new tab that it announces to every visitor.
  const demo = hero.getByRole('link', { name: 'Try Demo (opens in a new tab)' });
  await expect(demo).toHaveAttribute('href', demoURL);
  await expect(demo).toHaveAttribute('target', '_blank');
  await expect(demo).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(demo.locator('svg.landing-external')).toBeVisible();

  // The announced release comes from the release history, never from hand-written copy.
  const latest = page.getByTestId('release');
  await expect(latest).toContainText(`Latest release v${release.version}`);
  await expect(latest.getByRole('link', { name: `v${release.version}` })).toHaveAttribute('href', release.url);

  await expect(page.getByRole('link', { name: 'Browse releases' })).toHaveAttribute('href', links.releases);
  await expect(page.getByRole('link', { name: 'Docker instructions' })).toHaveAttribute('href', links.docker);
  await expect(page.getByRole('link', { name: 'Proxmox guide' })).toHaveAttribute('href', links.proxmox);
  await expect(page.getByRole('link', { name: 'Manual setup' })).toHaveAttribute('href', links.manual);
});

test('assets, icons, and sharing metadata respect the Pages base path', async ({ page }) => {
  const failures = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto(landingURL);

  await expect(page).toHaveTitle(/Inventory Atlas Lite/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', landingURL);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${landingURL}og-image.png`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /self-hosted/);
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(icon.startsWith(basePath)).toBe(true);
  expect((await page.request.get(new URL(icon, landingURL).href)).ok()).toBe(true);
  expect((await page.request.get(`${landingURL}og-image.png`)).ok()).toBe(true);

  // Every screenshot loads from the base path and describes what it shows.
  const images = page.locator('main img');
  await expect(images).toHaveCount(8);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    expect((await image.getAttribute('alt')).length).toBeGreaterThan(20);
    expect(new URL(await image.evaluate(element => element.currentSrc)).pathname.startsWith(basePath)).toBe(true);
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth)).toBeGreaterThan(0);
  }
  expect(failures).toEqual([]);
});

for (const viewport of viewports) {
  test(`the sections render without sideways scrolling on a ${viewport.name} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(landingURL);

    for (const title of sectionTitles) {
      const heading = page.getByRole('heading', { level: 2, name: title });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Get Inventory Atlas Lite' })).toHaveCount(2);
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  });
}

for (const viewport of phones) {
  test(`every band keeps a 24 px side gutter on a ${viewport.width} px phone`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(landingURL);

    const title = page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite' });
    const size = parseFloat(await title.evaluate(element => getComputedStyle(element).fontSize));
    expect(size).toBeGreaterThanOrEqual(33.5);
    expect(size).toBeLessThanOrEqual(36.5);

    const content = [
      title,
      page.locator('.landing-lead'),
      page.getByRole('link', { name: 'Get Inventory Atlas Lite' }).first(),
      page.getByRole('link', { name: /Try Demo/ }),
      page.getByRole('region', { name: 'Your server, your data' }).locator('dl'),
      page.getByRole('heading', { name: 'Everything has a place' }),
      page.locator('#hierarchy').getByRole('figure'),
      page.getByRole('heading', { name: 'Choose how to run it' }),
      page.getByRole('heading', { name: 'Start your inventory today' }),
      page.getByRole('contentinfo').getByText('Inventory Atlas Lite · by')
    ];
    // Measured against the layout width, which leaves out a classic scrollbar where there is one.
    const width = await page.evaluate(() => document.body.clientWidth);
    for (const element of content) {
      const box = await element.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(23.5);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 23.5);
    }
    // The navigation stays on one row, and the calls to action stay full-width, tappable buttons.
    const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
    expect(nav.height).toBeLessThanOrEqual(72);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'GitHub' })).toBeVisible();
    const cta = await page.getByRole('link', { name: 'Get Inventory Atlas Lite' }).first().boundingBox();
    expect(cta.width).toBeGreaterThan(width - 49);
    expect(cta.height).toBeGreaterThanOrEqual(44);
  });
}

test('the landing alone uses the bundled Geist typeface, without third-party requests', async ({ page }) => {
  const foreign = [];
  const fonts = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== new URL(landingURL).origin) foreign.push(request.url());
    if (request.resourceType() === 'font') fonts.push(new URL(request.url()).pathname);
  });
  await page.goto(landingURL);
  await page.evaluate(() => document.fonts.ready);

  for (const element of [page.locator('body'), page.getByRole('heading', { level: 1 })]) {
    expect(await element.evaluate(node => getComputedStyle(node).fontFamily)).toMatch(/^"Geist Variable", system-ui/);
  }
  expect(await page.evaluate(() => [...document.fonts].some(font => font.family.includes('Geist') && font.status === 'loaded'))).toBe(true);
  expect(fonts.length).toBeGreaterThan(0);
  for (const font of fonts) expect(font.startsWith(`${basePath}assets/geist-`) && font.endsWith('.woff2')).toBe(true);
  expect(foreign).toEqual([]);

  // The self-hosted application keeps Tabler's system fonts.
  await page.goto(baseURL);
  await expect(page.getByRole('main')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).not.toContain('Geist');
  expect(await page.evaluate(() => [...document.fonts].some(font => font.family.includes('Geist')))).toBe(false);
});

test('a facts rail and a numbered story with captioned screenshots carry the product identity', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(landingURL);

  // The four benefit cards are gone; the dark band under the hero is a rail of technical facts.
  await expect(page.getByRole('heading', { name: 'Runs on your server' })).toHaveCount(0);
  const rail = page.getByRole('region', { name: 'Your server, your data' });
  await expect(rail).toHaveAttribute('data-bs-theme', 'dark');
  await expect(rail.getByRole('term')).toHaveText(facts);
  await expect(rail.getByRole('definition')).toHaveCount(facts.length);

  for (const section of story) {
    const element = page.locator(`#${section.id}`);
    await expect(element.locator('.landing-eyebrow')).toHaveText(section.marker);
    const figures = element.getByRole('figure');
    await expect(figures).toHaveCount(section.captions.length);
    for (const [index, caption] of section.captions.entries()) {
      // The caption labels its own figure, which holds exactly that screenshot.
      await expect(figures.nth(index)).toHaveAccessibleName(caption);
      await expect(figures.nth(index).getByRole('img')).toHaveCount(1);
    }
  }
});

test('a screenshot opens in the in-page viewer and closes back onto its link', async ({ page }) => {
  await page.goto(landingURL);
  const link = page.locator('#hierarchy').getByRole('link', { name: /The Hierarchy tree grouped by location/ });
  // Without the page script the link still leads to the full-size file.
  expect(await link.getAttribute('href')).toBe(await link.getByRole('img').getAttribute('src'));

  await link.click();
  const viewer = page.getByRole('dialog', { name: 'Hierarchy · Grouped by location' });
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(landingURL);
  const image = viewer.getByRole('img', { name: /The Hierarchy tree grouped by location/ });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth)).toBeGreaterThan(0);
  // A single screenshot has no gallery controls.
  await expect(viewer.getByRole('button', { name: 'Next screenshot' })).toHaveCount(0);
  // The enlarged screenshot is larger than the one on the page and fits inside the window.
  const shown = await image.boundingBox();
  expect(shown.width).toBeGreaterThan((await link.boundingBox()).width);
  expect(shown.y + shown.height).toBeLessThanOrEqual(page.viewportSize().height);

  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toBeHidden();
  await expect(link).toBeFocused();

  await link.click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(link).toBeFocused();

  // A click on the backdrop around the panel closes it too.
  await link.click();
  await expect(viewer).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(viewer).toBeHidden();
  await expect(link).toBeFocused();
});

test('the viewer steps through the screenshots of a section with buttons and arrow keys', async ({ page }) => {
  await page.goto(landingURL);
  await page.locator('#find').getByRole('link', { name: /The Items list filtered by the search/ }).click();

  const viewer = page.getByRole('dialog');
  await expect(viewer).toHaveAccessibleName('Items · Search and filters');
  await expect(viewer).toContainText('1 / 2');
  await viewer.getByRole('button', { name: 'Next screenshot' }).click();
  await expect(viewer).toHaveAccessibleName('Checklist run · Phone');
  await expect(viewer).toContainText('2 / 2');
  await expect(viewer.getByRole('img', { name: /A packing checklist run on a phone/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toHaveAccessibleName('Items · Search and filters');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer).toHaveAccessibleName('Checklist run · Phone');
  await viewer.getByRole('button', { name: 'Previous screenshot' }).click();
  await expect(viewer).toHaveAccessibleName('Items · Search and filters');

  // The hero screenshots are one more gallery, opened without any extra button.
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await page.locator('header').getByRole('link', { name: /An item page on a phone/ }).click();
  await expect(viewer).toHaveAccessibleName('Item details · Phone');
  await expect(viewer).toContainText('2 / 2');
});

test('the viewer fills a phone screen with tappable controls and no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Without the opening animation, so the sizes are the final ones.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(landingURL);
  const link = page.locator('#dashboard').getByRole('link', { name: /The Dashboard with total items/ });
  await link.click();

  const viewer = page.getByRole('dialog', { name: 'Dashboard · Inventory overview' });
  await expect(viewer).toBeVisible();
  // Almost the whole screen, with a small safe margin around the panel.
  const width = await page.evaluate(() => document.body.clientWidth);
  const panel = await viewer.locator('.landing-viewer-panel').boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(4);
  expect(panel.x + panel.width).toBeLessThanOrEqual(width - 4);
  expect(panel.width).toBeGreaterThan(width - 48);
  const close = await viewer.getByRole('button', { name: 'Close' }).boundingBox();
  expect(close.width).toBeGreaterThanOrEqual(44);
  expect(close.height).toBeGreaterThanOrEqual(44);
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toBeHidden();
  await expect(link).toBeFocused();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

  // A tall phone screenshot fits the screen whole, under a two-line caption.
  await page.locator('#find').getByRole('link', { name: /A packing checklist run on a phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Checklist run · Phone' }).getByRole('img');
  await expect.poll(() => phone.evaluate(element => element.complete && element.naturalWidth)).toBeGreaterThan(0);
  const box = await phone.boundingBox();
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
});

test('the hero, the facts rail, and the final call to action are dark bands in both system modes', async ({ page }) => {
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.goto(landingURL);
    for (const band of [page.locator('header'), page.getByRole('heading', { name: 'Start your inventory today' }).locator('xpath=ancestor::section')]) {
      await expect(band).toHaveAttribute('data-bs-theme', 'dark');
      // The ink of the bands is dark enough for the white headings on top of it.
      const [r, g, b] = (await band.evaluate(element => getComputedStyle(element).backgroundColor)).match(/\d+/g).map(Number);
      expect(r + g + b).toBeLessThan(150);
    }
  }
});

test('sections fade in as they scroll into view, and appear at once with reduced motion', async ({ page }) => {
  await page.goto(landingURL);
  const dashboard = page.locator('#dashboard .landing-reveal').first();
  await expect(dashboard).toHaveCSS('opacity', '0');
  await dashboard.scrollIntoViewIfNeeded();
  await expect(dashboard).toHaveClass(/is-visible/);
  await expect(dashboard).toHaveCSS('opacity', '1');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(landingURL);
  await expect(page.locator('#dashboard .landing-reveal').first()).toHaveCSS('opacity', '1');
});
