import { expect, test } from '@playwright/test';
import { cloudStubURL } from './environment.js';
import { detail } from './helpers.js';

/*
  The real backend runs against a local stub of the Dropbox and Google Drive APIs (see
  cloudProviderStub.js), so the whole OAuth round trip, the upload, and the schedule are exercised
  without any real cloud account.
*/
const stubFiles = async request => (await request.get(`${cloudStubURL}/_stub/files`)).json();

/*
  Settings also loads the AI model list whenever an earlier spec left an API key saved. That list is
  answered here, so it never reaches a real provider and never adds its own alert to the page.
*/
test.beforeEach(async ({ page, request }) => {
  await request.post(`${cloudStubURL}/_stub/reset`);
  await page.route('**/api/ai/models', route => route.fulfill({ json: { models: [] } }));
});

// Leaves every provider disconnected, and Google Drive unconfigured, for the next test.
test.afterEach(async ({ request }) => {
  for (const provider of ['dropbox', 'google-drive']) await request.delete(`/api/cloud-backup/providers/${provider}`);
  await request.delete('/api/cloud-backup/providers/google-drive/app');
});

test('connects Dropbox, backs up now, schedules automatic backups, and disconnects', async ({ page, request }) => {
  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const dropbox = page.getByRole('article', { name: 'Dropbox', exact: true });
  await expect(dropbox.getByText('Not connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Google Drive' }).getByText('Not configured', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enable automatic backups')).toBeDisabled();
  await expect(detail(page, 'Last successful backup')).toHaveText('Never');

  // The browser goes to the provider and comes back through the server's OAuth callback.
  await dropbox.getByRole('button', { name: 'Connect Dropbox' }).click();
  await expect(page.getByRole('status')).toHaveText('Dropbox connected.');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dropbox.getByText('Connected', { exact: true })).toBeVisible();
  await expect(dropbox).toContainText('Stub Dropbox User (dropbox-user@example.test)');
  await expect(dropbox).toContainText('Dropbox › Apps › (your app folder) › Backups');

  // Dropbox is configured through the server environment, so its credentials are read-only here.
  await dropbox.getByText('App credentials', { exact: true }).click();
  await expect(dropbox.getByText('The app credentials come from the server environment')).toBeVisible();
  await expect(dropbox.getByLabel('Dropbox app key')).toHaveCount(0);

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

test('enters Google Drive app credentials in Settings without ever getting the secret back', async ({ page, request }) => {
  const secret = 'e2e-google-ui-secret-7890';
  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const drive = page.getByRole('article', { name: 'Google Drive' });
  await expect(drive.getByText('Not configured', { exact: true })).toBeVisible();

  await drive.getByLabel('Google Drive client ID').fill('e2e-google-client.apps.googleusercontent.com');
  await drive.getByLabel('Google Drive client secret').fill(secret);
  await drive.getByRole('button', { name: 'Save Google Drive app credentials' }).click();
  await expect(page.getByRole('status')).toHaveText('Google Drive app credentials saved.');
  await expect(drive.getByText('Not connected', { exact: true })).toBeVisible();

  await drive.getByText('App credentials', { exact: true }).click();
  await expect(drive.getByLabel('Google Drive client ID')).toHaveValue('e2e-google-client.apps.googleusercontent.com');
  await expect(drive.getByLabel('Google Drive client secret')).toHaveValue('');
  await expect(drive.getByText('Saved client secret: ••••••••7890. Leave this blank to keep it.')).toBeVisible();
  expect(await (await request.get('/api/cloud-backup')).text()).not.toContain(secret);

  // The saved credentials connect, and are locked while the connection exists.
  await drive.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(page.getByRole('status')).toHaveText('Google Drive connected.');
  await expect(drive).toContainText('Stub Google User (drive-user@example.test)');
  await drive.getByText('App credentials', { exact: true }).click();
  await expect(drive.getByLabel('Google Drive client ID')).toBeDisabled();
  await expect(drive.getByRole('button', { name: 'Remove Google Drive app credentials' })).toBeDisabled();

  await drive.getByRole('button', { name: 'Disconnect Google Drive' }).click();
  await expect(page.getByRole('status')).toHaveText('Google Drive disconnected. Its stored access was removed from this server.');
  // The section opened above stays open.
  await drive.getByRole('button', { name: 'Remove Google Drive app credentials' }).click();
  await expect(page.getByRole('status')).toHaveText('Google Drive app credentials removed.');
  await expect(drive.getByText('Not configured', { exact: true })).toBeVisible();
  await expect(drive.getByLabel('Google Drive client ID')).toHaveValue('');
});

test('reports a cancelled Google Drive connection and keeps it disconnected', async ({ page, request }) => {
  const saved = await request.put('/api/cloud-backup/providers/google-drive/app', { data: { clientId: 'e2e-google-client', clientSecret: 'e2e-google-secret' } });
  expect(saved.ok()).toBeTruthy();
  await request.post(`${cloudStubURL}/_stub/deny`);
  await page.goto('/settings');
  await page.mouse.move(600, 400);
  const drive = page.getByRole('article', { name: 'Google Drive' });
  await drive.getByRole('button', { name: 'Connect Google Drive' }).click();
  await expect(page.getByRole('region', { name: 'Cloud Backup' }).getByRole('alert')).toHaveText('Google Drive access was not granted, so nothing was connected.');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(drive.getByText('Not connected', { exact: true })).toBeVisible();
});
