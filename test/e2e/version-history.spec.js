import { expect, test } from '@playwright/test';
import { detail } from './helpers.js';

/*
  The release history is bundled with the application, so these tests treat it as part of the
  interface: they never stub an endpoint, and one of them cuts the network entirely.
*/
const openHistory = async page => {
  await page.getByRole('button', { name: 'About' }).click();
  await page.getByRole('dialog', { name: 'About' }).getByRole('button', { name: 'Version History' }).click();
  const dialog = page.getByRole('dialog', { name: 'Version History' });
  await expect(dialog).toBeVisible();
  return dialog;
};

const versions = async dialog => (await dialog.locator('.step-item h3').allTextContents()).map(text => text.trim());

test('About opens the release timeline, newest first, with the installed version marked', async ({ page }) => {
  await page.goto('/');
  const dialog = await openHistory(page);
  // The running build decides the number; only its release part is listed in the history.
  // About stays open behind the timeline, so its own Version line is still readable.
  const about = page.getByRole('dialog', { name: 'About' });
  const version = (await detail(about, 'Version').innerText()).trim().split('-')[0];
  await expect(dialog.getByRole('button', { name: 'Close Version History' })).toBeFocused();

  const listed = await versions(dialog);
  expect(listed.length).toBeGreaterThan(1);
  const numbers = listed.map(text => text.replace(/^v/, '').split('.').map(Number));
  for (const [index, current] of numbers.slice(1).entries()) {
    const previous = numbers[index];
    expect(previous[0] * 1e6 + previous[1] * 1e3 + previous[2]).toBeGreaterThan(current[0] * 1e6 + current[1] * 1e3 + current[2]);
  }

  // The known releases are there, with their user-facing changes.
  expect(listed).toContain('v0.5.0');
  await expect(dialog.getByText('Added nested items:', { exact: false })).toBeVisible();

  // The installed release is the only one identified as such.
  const installed = dialog.locator('.step-item', { has: page.getByText('Installed', { exact: true }) });
  await expect(installed).toHaveCount(1);
  await expect(installed.locator('h3')).toHaveText(`v${version}`);
});

test('the release timeline scrolls and closes back to About', async ({ page }) => {
  await page.goto('/');
  const dialog = await openHistory(page);

  const body = dialog.locator('.modal-body');
  const scrollable = await body.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return { overflow: element.scrollHeight > element.clientHeight, scrolled: element.scrollTop > 0 };
  });
  expect(scrollable.overflow).toBe(true);
  expect(scrollable.scrolled).toBe(true);

  // Escape closes the history only: the About dialog it was opened from is still there.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const about = page.getByRole('dialog', { name: 'About' });
  await expect(about).toBeVisible();
  await expect(about.getByRole('button', { name: 'Version History' })).toBeFocused();

  await about.getByRole('button', { name: 'Version History' }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(about).toBeVisible();

  // The second Escape closes About, because the history no longer holds the keyboard.
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();
});

test('the release timeline opens with no network access at all', async ({ page }) => {
  await page.goto('/');
  // Everything the page could still ask for after it loaded is refused, including the API.
  await page.route('**/api/**', route => route.abort());
  await page.route('https://**', route => route.abort());

  const dialog = await openHistory(page);
  await expect(dialog.locator('.step-item').first()).toBeVisible();
  expect((await versions(dialog)).length).toBeGreaterThan(1);
});

test.describe('a dark operating system', () => {
  test.use({ colorScheme: 'dark' });

  test('keeps the release timeline readable', async ({ page }) => {
    await page.goto('/');
    const dialog = await openHistory(page);

    const colors = await dialog.locator('.modal-content').evaluate(element => {
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    const luminance = value => value.match(/\d+/g).slice(0, 3).reduce((sum, part) => sum + Number(part), 0) / 3;
    // Dark surface, light text: the dialog follows the Tabler color mode instead of a fixed palette.
    expect(luminance(colors.background)).toBeLessThan(luminance(colors.color));
    expect(luminance(colors.background)).toBeLessThan(128);
    await expect(dialog.locator('.step-item').first()).toBeVisible();
  });
});
