import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('downloads a non-empty SQLite backup', async ({ page }) => {
  await page.goto('/data');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download backup' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.sqlite$/);
  const file = await download.path();
  const contents = await fs.readFile(file);
  expect(contents.length).toBeGreaterThan(0);
  expect(contents.subarray(0, 15).toString()).toBe('SQLite format 3');
});
