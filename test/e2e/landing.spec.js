import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { landingRelease, links, repositoryUrl } from '../../landing/site.js';
import { landingURL } from './environment.js';

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

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'Full HD', width: 1920, height: 1080 }
];

test('the hero offers real install and repository destinations and no demo yet', async ({ page }) => {
  await page.goto(landingURL);

  await expect(page.getByRole('heading', { level: 1, name: 'Inventory Atlas Lite' })).toBeVisible();
  const hero = page.locator('header');
  await expect(hero.getByRole('link', { name: 'Get Inventory Atlas Lite' })).toHaveAttribute('href', links.get);
  await expect(hero.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', repositoryUrl);
  await expect(page.getByText(/try demo/i)).toHaveCount(0);

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
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
