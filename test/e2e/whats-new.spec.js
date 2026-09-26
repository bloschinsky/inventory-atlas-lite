import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { readReleaseHistory } from '../../shared/releaseHistory.js';

/*
  What's New compares the running version with the one this browser last acknowledged. Every test
  starts with a fresh browser profile, so a test that plays an update stores an older version once
  before the first load; later reloads in the same test see whatever the application saved.
*/
const KEY = 'inventory-atlas.lastSeenVersion';
const current = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const releases = readReleaseHistory(JSON.parse(readFileSync(new URL('../../shared/release-history.json', import.meta.url), 'utf8')));

const lastSeen = (page, version) => page.addInitScript(([key, value]) => {
  if (sessionStorage.getItem('whats-new-seeded')) return;
  sessionStorage.setItem('whats-new-seeded', '1');
  localStorage.setItem(key, value);
}, [KEY, version]);
const stored = page => page.evaluate(key => localStorage.getItem(key), KEY);
const headings = async dialog => (await dialog.locator('h3').allTextContents()).map(text => text.trim());
const whatsNew = page => page.getByRole('dialog', { name: "What's New" });

test('a fresh installation shows no What\'s New dialog and remembers the version', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect.poll(() => stored(page)).toBe(current);
  await expect(whatsNew(page)).toHaveCount(0);
});

test('an update shows the new release once and is not shown again after Got it', async ({ page }) => {
  await lastSeen(page, releases[1].version);
  await page.goto('/');
  const dialog = whatsNew(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: "Close What's New" })).toBeFocused();
  await expect(dialog.getByText(`Inventory Atlas Lite was updated to version ${current}`)).toBeVisible();
  expect(await headings(dialog)).toEqual([`v${current}`]);
  await expect(dialog.getByText(releases[0].changes[0])).toBeVisible();
  // Nothing is acknowledged until the dialog is closed.
  expect(await stored(page)).toBe(releases[1].version);

  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toBeHidden();
  expect(await stored(page)).toBe(current);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(whatsNew(page)).toHaveCount(0);
});

test('skipped releases are all listed, newest first, in a scrollable dialog on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await lastSeen(page, releases[3].version);
  await page.goto('/');
  const dialog = whatsNew(page);
  expect(await headings(dialog)).toEqual(releases.slice(0, 3).map(release => `v${release.version}`));

  const body = dialog.locator('.modal-body');
  const scroll = await body.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return { overflow: element.scrollHeight > element.clientHeight, scrolled: element.scrollTop > 0 };
  });
  expect(scroll).toEqual({ overflow: true, scrolled: true });
  const box = await dialog.locator('.modal-content').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeInViewport();
});

test('Escape and a click outside the dialog both acknowledge the update', async ({ page }) => {
  await lastSeen(page, releases[1].version);
  await page.goto('/');
  await expect(whatsNew(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(whatsNew(page)).toBeHidden();
  expect(await stored(page)).toBe(current);

  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, releases[1].version]);
  await page.reload();
  await expect(whatsNew(page)).toBeVisible();
  await whatsNew(page).click({ position: { x: 5, y: 5 } });
  await expect(whatsNew(page)).toBeHidden();
  expect(await stored(page)).toBe(current);
});

test('View full changelog opens Version History over About', async ({ page }) => {
  await lastSeen(page, releases[1].version);
  await page.goto('/');
  await whatsNew(page).getByRole('button', { name: 'View full changelog' }).click();
  await expect(whatsNew(page)).toBeHidden();
  expect(await stored(page)).toBe(current);

  const history = page.getByRole('dialog', { name: 'Version History' });
  await expect(history).toBeVisible();
  await expect(history.getByRole('button', { name: 'Close Version History' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'About' })).toBeVisible();
});

test('a downgrade or an invalid stored version shows nothing', async ({ page }) => {
  await lastSeen(page, '99.0.0');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(whatsNew(page)).toHaveCount(0);
  expect(await stored(page)).toBe('99.0.0');

  await page.evaluate(key => localStorage.setItem(key, 'not a version'), KEY);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect.poll(() => stored(page)).toBe(current);
  await expect(whatsNew(page)).toHaveCount(0);
});

test('the application starts normally when the browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(whatsNew(page)).toHaveCount(0);
});

test('the dialog follows the Ukrainian interface', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await lastSeen(page, releases[1].version);
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Що нового' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Зрозуміло' }).click();
  await expect(dialog).toBeHidden();
});
