import { expect, test } from '@playwright/test';
import { detail } from './helpers.js';

const repository = 'https://github.com/bloschinsky/inventory-atlas-lite';
const releaseUrl = `${repository}/releases/tag/v9.9.9`;

/*
  The update panel is driven by the backend, and the backend is driven by GitHub and by a privileged
  updater that no test may run. The browser tests therefore answer the update endpoints themselves
  and cover what belongs to the browser: the states of the panel and the way it survives a restart.
*/
const answerUpdateApi = async (page, { check, status, health } = {}) => {
  const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (check) await page.route('**/api/update/check', route => route.fulfill(json(check)));
  if (status) {
    await page.route('**/api/update/apply', route => route.fulfill({ ...json(status.at(0)), status: 202 }));
    let index = 0;
    await page.route('**/api/update/status', route => route.fulfill(json(status[Math.min(index++, status.length - 1)])));
  }
  if (health) await page.route('**/api/health', route => route.fulfill(json(health)));
};

const openAbout = async page => {
  await page.goto('/');
  await page.getByRole('button', { name: 'About' }).click();
  return page.getByRole('dialog', { name: 'About' });
};

test('the About dialog shows the build metadata and is operated with the keyboard', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'About' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'About' });
  await expect(dialog).toBeVisible();
  // Opening the dialog moves the focus into it.
  await expect(dialog.getByRole('button', { name: 'Close About' })).toBeFocused();

  await expect(dialog.getByText('Inventory Atlas Lite', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Developed by Artem Bloschinsky')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', repository);
  // The release timeline is reached from here; test/e2e/version-history.spec.js covers it.
  await expect(dialog.getByRole('button', { name: 'Version History' })).toBeVisible();

  // The values belong to the build that is running, so only their presence is asserted.
  for (const label of ['Version', 'Build', 'Build date']) {
    await expect(detail(dialog, label)).not.toBeEmpty();
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the About dialog closes with its own button', async ({ page }) => {
  await page.goto('/categories');
  await page.getByRole('button', { name: 'About' }).click();

  const dialog = page.getByRole('dialog', { name: 'About' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  // The dialog is an overlay only: it never leaves the page that opened it.
  await expect(page).toHaveURL('/categories');
});

test('the About entry in the mobile drawer replaces it with the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation menu' }).click();

  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await drawer.getByRole('button', { name: 'About' }).click();
  await expect(drawer).toBeHidden();

  const dialog = page.getByRole('dialog', { name: 'About' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', repository);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the About dialog reports an installation that is already up to date', async ({ page }) => {
  await answerUpdateApi(page, {
    check: {
      currentVersion: '9.9.9', latestVersion: '9.9.9', updateAvailable: false,
      releaseUrl, publishedAt: '2026-09-19T12:00:00Z', deploymentType: 'proxmox-lxc', canSelfUpdate: true
    }
  });
  const dialog = await openAbout(page);

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(dialog.getByText('Inventory Atlas Lite is up to date.')).toBeVisible();
});

test('a deployment that cannot update itself offers the release page instead', async ({ page }) => {
  await answerUpdateApi(page, {
    check: {
      currentVersion: '0.9.0', latestVersion: '9.9.9', updateAvailable: true,
      releaseUrl, publishedAt: '2026-09-19T12:00:00Z', deploymentType: 'docker', canSelfUpdate: false
    }
  });
  const dialog = await openAbout(page);

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(dialog.getByText('New version available: 9.9.9')).toBeVisible();
  await expect(dialog.getByText('This Docker installation cannot update itself automatically.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Update to 9.9.9' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'View release' })).toHaveAttribute('href', releaseUrl);
});

test('a supported deployment asks for confirmation before it updates', async ({ page }) => {
  await answerUpdateApi(page, {
    check: {
      currentVersion: '0.9.0', latestVersion: '9.9.9', updateAvailable: true,
      releaseUrl, publishedAt: '2026-09-19T12:00:00Z', deploymentType: 'proxmox-lxc', canSelfUpdate: true
    }
  });
  const dialog = await openAbout(page);

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await dialog.getByRole('button', { name: 'Update to 9.9.9' }).click();

  await expect(dialog.getByText('Update Inventory Atlas Lite')).toBeVisible();
  await expect(dialog.getByText('0.9.0 → 9.9.9')).toBeVisible();
  await expect(dialog.getByText('A database backup will be created automatically.')).toBeVisible();

  // Nothing is started until the confirmation is given.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByRole('button', { name: 'Update to 9.9.9' })).toBeVisible();
});

test('the update panel follows the updater through the restart and reloads the page', async ({ page }) => {
  await answerUpdateApi(page, {
    check: {
      currentVersion: '0.9.0', latestVersion: '9.9.9', updateAvailable: true,
      releaseUrl, publishedAt: '2026-09-19T12:00:00Z', deploymentType: 'proxmox-lxc', canSelfUpdate: true
    },
    status: [
      { state: 'preparing', fromVersion: '0.9.0', toVersion: '9.9.9' },
      { state: 'installing', fromVersion: '0.9.0', toVersion: '9.9.9' },
      { state: 'success', fromVersion: '0.9.0', toVersion: '9.9.9' }
    ],
    health: { status: 'ok', database: 'ok', version: '9.9.9' }
  });
  const dialog = await openAbout(page);

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await dialog.getByRole('button', { name: 'Update to 9.9.9' }).click();
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();

  // The panel follows the status the updater reports, which it polls every few seconds.
  await expect(dialog.getByText('Preparing the update...')).toBeVisible();
  await expect(dialog.getByText('Installing the update...')).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByText('Update completed successfully.')).toBeVisible({ timeout: 15000 });
  // The new version is running, so the page reloads itself and the dialog is gone with it.
  await expect(dialog).toBeHidden({ timeout: 15000 });
});

test('the update panel names the phase and the step the updater is working on', async ({ page }) => {
  const running = step => ({ state: 'preparing', step, fromVersion: '0.9.0', toVersion: '9.9.9' });
  await answerUpdateApi(page, {
    check: {
      currentVersion: '0.9.0', latestVersion: '9.9.9', updateAvailable: true,
      releaseUrl, publishedAt: '2026-09-19T12:00:00Z', deploymentType: 'proxmox-lxc', canSelfUpdate: true
    },
    status: [running('downloading_archive'), running('building_client')]
  });
  const dialog = await openAbout(page);

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await dialog.getByRole('button', { name: 'Update to 9.9.9' }).click();
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();

  const phases = dialog.getByRole('list', { name: 'Update phases' });
  await expect(phases.getByRole('listitem')).toHaveText(['Download', 'Build', 'Back up', 'Install', 'Verify']);
  await expect(dialog.getByText('Compiling the Vue client with Vite...')).toBeVisible({ timeout: 15000 });
  await expect(phases.locator('[aria-current="step"]')).toHaveText('Build');
  // A long step explains what it is doing while it runs.
  await expect(dialog.getByText(/Tree-shaking|single-file components|chunks|Minifying|Fingerprinting/)).toBeVisible();
  await expect(dialog.getByText(/\d+:\d{2} elapsed/)).toBeVisible();
});

test('a failed update reports the version that was restored', async ({ page }) => {
  await answerUpdateApi(page, {
    check: {
      currentVersion: '0.9.0', latestVersion: '9.9.9', updateAvailable: true,
      releaseUrl, publishedAt: '2026-09-19T12:00:00Z', deploymentType: 'proxmox-lxc', canSelfUpdate: true
    },
    status: [{ state: 'rolled_back', fromVersion: '0.9.0', toVersion: '0.9.0' }]
  });
  const dialog = await openAbout(page);

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await dialog.getByRole('button', { name: 'Update to 9.9.9' }).click();
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();

  await expect(dialog.getByText('Update failed.')).toBeVisible();
  await expect(dialog.getByText('Inventory Atlas Lite was restored to version 0.9.0. Your database was preserved.')).toBeVisible();
});
