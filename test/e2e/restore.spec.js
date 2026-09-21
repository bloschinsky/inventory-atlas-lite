import { expect, test } from '@playwright/test';
import { createCategory, createItem, unique } from './helpers.js';

// The suite shares one isolated database, so this test restores a backup of that database taken
// moments earlier: the restored state is the shared state plus the records created here.
test('validates a backup, requires the typed confirmation, and reloads with the restored data', async ({ page, request }) => {
  const category = await createCategory(request, unique('Restore category'));
  const kept = unique('Kept by restore');
  await createItem(request, { name: kept, category_id: category.id });

  const download = await request.get('/api/backup');
  expect(download.ok()).toBeTruthy();
  const backup = await download.body();

  const removed = unique('Added after the backup');
  await createItem(request, { name: removed, category_id: category.id });

  await page.goto('/data');
  // A fresh page can keep the pointer at (0, 0), which expands the folded sidebar over the content.
  await page.mouse.move(600, 400);

  const restoreButton = page.getByRole('button', { name: 'Restore backup' });
  await expect(restoreButton).toHaveCount(0);

  await page.getByLabel('Backup file').setInputFiles({
    name: 'inventory-restore-test.sqlite', mimeType: 'application/octet-stream', buffer: backup
  });
  await expect(page.getByText('inventory-restore-test.sqlite')).toBeVisible();

  await page.getByRole('button', { name: 'Validate backup' }).click();
  await expect(page.getByRole('heading', { name: 'Validation result' })).toBeVisible();
  await expect(page.getByText('This replaces all current data')).toBeVisible();

  // The destructive action stays disabled until the confirmation phrase is typed exactly.
  await expect(restoreButton).toBeDisabled();
  await page.getByLabel('Type RESTORE to confirm').fill('yes');
  await expect(restoreButton).toBeDisabled();
  await page.getByLabel('Type RESTORE to confirm').fill('RESTORE');
  await expect(restoreButton).toBeEnabled();

  await restoreButton.click();
  await expect(page.getByText('Backup restored successfully')).toBeVisible();
  await expect(page.getByText(/pre-restore-.*\.sqlite/)).toBeVisible();

  // The page reloads itself into the items list, which then shows the restored inventory.
  await page.waitForURL('**/items', { timeout: 15000 });
  const search = page.getByPlaceholder('Search name, description or serial number…');
  await search.fill(kept);
  await expect(page.getByRole('link', { name: kept, exact: true })).toBeVisible();

  await search.fill(removed);
  await expect(page.getByText('No matching items')).toBeVisible();
});
