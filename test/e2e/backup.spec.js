import { expect, test } from '@playwright/test';

test('downloads a non-empty SQLite backup', async ({ page }) => {
  await page.goto('/data');

  const downloadPromise = page.waitForEvent('download');
  // The desktop sidebar intentionally overlays the left edge of the page while expanded. Keyboard
  // activation tests the download itself without making this test depend on the sidebar animation.
  await page.getByRole('link', { name: 'Download backup' }).focus();
  await page.keyboard.press('Enter');
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.sqlite$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const contents = Buffer.concat(chunks);
  expect(contents.length).toBeGreaterThan(0);
  expect(contents.subarray(0, 15).toString()).toBe('SQLite format 3');
});
