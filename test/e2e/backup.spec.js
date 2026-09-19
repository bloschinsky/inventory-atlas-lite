import { expect, test } from '@playwright/test';

test('downloads a non-empty SQLite backup', async ({ page }) => {
  await page.goto('/data');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download backup' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.sqlite$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const contents = Buffer.concat(chunks);
  expect(contents.length).toBeGreaterThan(0);
  expect(contents.subarray(0, 15).toString()).toBe('SQLite format 3');
});
