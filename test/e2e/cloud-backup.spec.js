import { expect, test } from '@playwright/test';
import { cloudStubURL } from './environment.js';
import { detail } from './helpers.js';

/*
  The real backend runs against a local stub of the Dropbox and Google Drive APIs (see
  cloudProviderStub.js), so the whole OAuth round trip, the upload, and the schedule are exercised
  without any real cloud account.
*/
const stubFiles = async request => (await request.get(`${cloudStubURL}/_stub/files`)).json();

test.beforeEach(async ({ request }) => {
  await request.post(`${cloudStubURL}/_stub/reset`);
});

// Leaves every provider disconnected for the next test, whatever this one did.
test.afterEach(async ({ request }) => {
  for (const provider of ['dropbox', 'google-drive']) await request.delete(`/api/cloud-backup/providers/${provider}`);
});

test('connects Dropbox, backs up now, schedules automatic backups, and disconnects', async ({ page, request }) => {
  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const dropbox = page.getByRole('article', { name: 'Dropbox', exact: true });
  await expect(dropbox.getByText('Not connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Google Drive' }).getByText('Not connected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enable automatic backups')).toBeDisabled();
  await expect(detail(page, 'Last successful backup')).toHaveText('Never');

  // The browser goes to the provider and comes back through the server's OAuth callback.
  await dropbox.getByRole('button', { name: 'Connect Dropbox' }).click();
  await expect(page.getByRole('status')).toHaveText('Dropbox connected.');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dropbox.getByText('Connected', { exact: true })).toBeVisible();
  await expect(dropbox).toContainText('Stub Dropbox User (dropbox-user@example.test)');
  await expect(dropbox).toContainText('Dropbox › Apps › (your app folder) › Backups');

  await dropbox.getByRole('button', { name: 'Test Dropbox connection' }).click();
  await expect(page.getByRole('status')).toHaveText('Connected to Dropbox as Stub Dropbox User (dropbox-user@example.test).');

  await dropbox.getByRole('button', { name: 'Back up to Dropbox now' }).click();
  await expect(page.getByRole('status')).toContainText(/^Backup uploaded to Dropbox as inventory-atlas-lite-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.sqlite\.$/);
  const files = await stubFiles(request);
  expect(files.dropbox).toHaveLength(1);
  await expect(detail(page, 'Last successful backup')).toContainText(`to Dropbox (${files.dropbox[0]})`);
  await expect(detail(page, 'Last attempt')).toContainText('manual, succeeded');
  await expect(detail(page, 'Service')).toHaveText('Dropbox');
  await expect(detail(page, 'Last error')).toHaveText('None');

  // Tokens stay on the server: the settings API never carries any of them.
  const overview = await (await request.get('/api/cloud-backup')).text();
  for (const secret of files.secrets) expect(overview).not.toContain(secret);

  await page.getByLabel('Enable automatic backups').check();
  await expect(page.getByLabel('Back up to', { exact: true })).toHaveValue('dropbox');
  await page.getByLabel('Frequency').selectOption('weekly');
  await page.getByLabel('Day of week').selectOption('Monday');
  await page.getByLabel('Time of day').fill('04:30');
  await page.getByLabel('Retention').selectOption('last');
  await page.getByLabel('Backups to keep').fill('3');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByRole('status')).toHaveText('Backup schedule saved.');
  const { timezone, settings, status } = await (await request.get('/api/cloud-backup')).json();
  expect(settings).toEqual({
    schedule: { enabled: true, provider: 'dropbox', frequency: 'weekly', weekday: 1, time: '04:30' },
    retention: { mode: 'last', keep: 3 }
  });
  expect(new Date(status.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  await expect(page.getByText(`Times use the server time zone: ${timezone}.`)).toBeVisible();
  await expect(detail(page, 'Next scheduled run')).toContainText(`(${timezone})`);

  // The schedule survives a reload because it is stored on the server.
  await page.reload();
  await page.mouse.move(600, 400);
  await expect(page.getByLabel('Enable automatic backups')).toBeChecked();
  await expect(page.getByLabel('Time of day')).toHaveValue('04:30');

  await dropbox.getByRole('button', { name: 'Disconnect Dropbox' }).click();
  await expect(page.getByRole('status')).toHaveText('Dropbox disconnected. Its stored access was removed from this server.');
  await expect(dropbox.getByText('Not connected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enable automatic backups')).not.toBeChecked();
  await expect(detail(page, 'Next scheduled run')).toHaveText('Not scheduled');
});

test('reports a cancelled Google Drive connection and keeps it disconnected', async ({ page, request }) => {
  await request.post(`${cloudStubURL}/_stub/deny`);
  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const drive = page.getByRole('article', { name: 'Google Drive' });
  await drive.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(page.getByRole('alert')).toHaveText('Google Drive access was not granted, so nothing was connected.');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(drive.getByText('Not connected', { exact: true })).toBeVisible();
});
