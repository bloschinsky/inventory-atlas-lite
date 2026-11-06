import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test } from './fixtures.js';
import { dataDir, e2eAdmin } from './environment.js';
import { createCategory, createItem, unique } from './helpers.js';

const signedOut = { cookies: [], origins: [] };
const phone = { width: 390, height: 844 };
let counter = 0;
const accountName = prefix => `${prefix}-${Date.now().toString(36)}-${counter++}`;

async function createViewer(request) {
  const viewer = { username: accountName('viewer'), password: 'viewer-e2e-password' };
  const response = await request.post('/api/security/users', { data: { ...viewer, role: 'viewer' } });
  expect(response.ok(), `POST /api/security/users returned ${response.status()}`).toBeTruthy();
  return viewer;
}

async function signIn(page, { username, password }) {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('signed out', () => {
  test.use({ storageState: signedOut });

  test('a deep link asks to sign in first and then opens the page that was asked for', async ({ page, request }) => {
    const category = await createCategory(request, unique('Auth category'));
    const item = await createItem(request, { name: unique('Deep link item'), category_id: category.id });

    await page.goto(`/items/${item.id}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=/items/${item.id}$`));
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // The application shell and its data stay out of reach.
    await expect(page.getByRole('navigation')).toHaveCount(0);

    await signIn(page, { username: e2eAdmin.username, password: 'not-the-password' });
    await expect(page.getByRole('alert')).toContainText('The username or password is not correct');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');

    await signIn(page, e2eAdmin);
    await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: item.name })).toBeVisible();

    // Signing out ends the session and comes back to the sign-in page.
    await page.mouse.move(600, 400);
    await page.getByRole('button', { name: `Account: ${e2eAdmin.username}` }).first().click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=\/dashboard$/);
  });

  test('the sign-in and recovery pages work in Ukrainian on a phone', async ({ page }) => {
    await page.setViewportSize(phone);
    await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
    await page.getByRole('link', { name: 'Забули пароль? Скористайтеся кодом відновлення' }).click();
    await expect(page).toHaveURL(/\/recover$/);
    await expect(page.getByRole('heading', { name: 'Код відновлення' })).toBeVisible();
    await expect(page.getByText('npm run auth -- recover <username>')).toBeVisible();
    await page.getByLabel('Код відновлення').fill('AAAA-BBBB-CCCC-DDDD-EEEE');
    await page.getByLabel("Ім'я користувача").fill(e2eAdmin.username);
    await page.getByLabel('Новий пароль').fill('some-new-password-1');
    await page.getByLabel('Повторіть пароль').fill('some-new-password-2');
    await expect(page.getByText('Паролі не збігаються.')).toBeVisible();
    await page.getByLabel('Повторіть пароль').fill('some-new-password-1');
    await page.getByRole('button', { name: 'Задати пароль і увійти' }).click();
    await expect(page.getByRole('alert')).toContainText('Код відновлення недійсний');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(phone.width);
    // Setup is over, so its page leads to sign-in.
    await page.goto('/setup');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a viewer browses read-only: no changing actions, no administration, and no way around it by address', async ({ page, request }) => {
    const category = await createCategory(request, unique('Viewer category'));
    const item = await createItem(request, { name: unique('Viewer item'), category_id: category.id });
    const viewer = await createViewer(request);

    await page.goto('/items');
    await signIn(page, viewer);
    await expect(page).toHaveURL(/\/items$/);
    await page.mouse.move(600, 400);
    await expect(page.getByRole('heading', { level: 1, name: 'Items' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Move to…' })).toHaveCount(0);
    const navigation = page.locator('.navbar-vertical');
    await expect(navigation.getByRole('link', { name: 'Hierarchy' })).toBeAttached();
    for (const hidden of ['Templates', 'Categories & Fields', 'Data / Backup']) {
      await expect(navigation.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    await page.goto(`/items/${item.id}`);
    await page.mouse.move(600, 400);
    await expect(page.getByRole('heading', { level: 1, name: item.name })).toBeVisible();
    await expect(page.getByRole('button', { name: 'QR Code' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0);

    // Typed addresses of pages that change data lead back to the Items list.
    for (const address of ['/items/new', `/items/${item.id}/edit`, '/categories', '/data', '/templates']) {
      await page.goto(address);
      await expect(page).toHaveURL(/\/items$/);
    }
    // Settings offers the interface and the person's own sessions only.
    await page.goto('/settings/users');
    await expect(page).toHaveURL(/\/settings\/interface$/);
    const sections = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(sections.getByRole('link')).toHaveText(['Interface', 'Sessions']);
    await sections.getByRole('link', { name: 'Sessions' }).click();
    await expect(page.getByText('This browser', { exact: true })).toBeVisible();

    // The account menu names the role.
    await page.goto('/dashboard');
    await page.mouse.move(600, 400);
    await page.getByRole('button', { name: `Account: ${viewer.username}` }).first().click();
    await expect(page.getByText('Viewer / Read-only')).toBeVisible();
  });
});

test('Security & Access: an administrator adds and disables a viewer, creates a token shown once, and revokes it', async ({ page }) => {
  const viewerName = accountName('ui-viewer');
  await page.goto('/settings/users');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('heading', { name: 'Users' })).toBeVisible();
  await dialog.getByLabel('Username').fill(viewerName);
  await dialog.getByLabel('Password', { exact: true }).fill('ui-viewer-password');
  await dialog.getByLabel('Confirm password').fill('ui-viewer-password');
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(dialog.getByRole('status')).toHaveText(`The account ${viewerName} was created.`);
  const row = dialog.getByRole('row', { name: new RegExp(viewerName) });
  await expect(row).toContainText('Viewer / Read-only');
  await row.getByRole('button', { name: `Disable ${viewerName}` }).click();
  await expect(row).toContainText('Disabled');
  await expect(row.getByRole('button', { name: `Enable ${viewerName}` })).toBeVisible();
  // The signed-in administrator's own row offers nothing that could lock them out.
  await expect(dialog.getByRole('row', { name: new RegExp(e2eAdmin.username) }).getByRole('button')).toHaveCount(0);

  await page.getByRole('link', { name: 'API Access' }).click();
  const tokenName = unique('Script token');
  await dialog.getByLabel('Name').fill(tokenName);
  await expect(dialog.getByLabel('Read-only')).toBeChecked();
  await dialog.getByRole('button', { name: 'Create token' }).click();
  const value = dialog.getByLabel('Token', { exact: true });
  await expect(value).toHaveValue(/^ial_[0-9a-f]{16}_/);
  const token = await value.inputValue();
  await dialog.getByRole('button', { name: 'Done, I saved it' }).click();
  await expect(value).toHaveCount(0);
  const tokenRow = dialog.getByRole('row', { name: new RegExp(tokenName) });
  await expect(tokenRow).toContainText('Read-only');
  await expect(tokenRow).toContainText('Active');
  await expect(tokenRow).not.toContainText(token.split('_')[2]);

  page.once('dialog', confirm => confirm.accept());
  await tokenRow.getByRole('button', { name: `Revoke ${tokenName}` }).click();
  await expect(tokenRow).toContainText('Revoked');

  await page.getByRole('link', { name: 'Sessions' }).click();
  await expect(dialog.getByText('This browser', { exact: true })).toBeVisible();
});

test('an older sign-in confirms the password before creating an account, then carries on', async ({ browser, baseURL }) => {
  // A separate sign-in, so the suite's shared session is never aged.
  const context = await browser.newContext({ baseURL, storageState: signedOut });
  const page = await context.newPage();
  await page.goto('/settings/users');
  await signIn(page, e2eAdmin);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('heading', { name: 'Users' })).toBeVisible();

  // The password was last confirmed long ago.
  const sessionId = (await context.cookies()).find(cookie => cookie.name === 'ial_session').value.split('.')[0];
  const store = new Database(path.join(dataDir, 'auth.sqlite'));
  store.prepare('UPDATE sessions SET authenticated_at = 0 WHERE id = ?').run(sessionId);
  store.close();

  const name = accountName('confirmed');
  await dialog.getByLabel('Username').fill(name);
  await dialog.getByLabel('Password', { exact: true }).fill('confirmed-password');
  await dialog.getByLabel('Confirm password').fill('confirmed-password');
  await dialog.getByRole('button', { name: 'Create user' }).click();

  const confirm = page.getByRole('dialog', { name: 'Confirm your password' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByLabel('Password')).toBeFocused();
  await confirm.getByLabel('Password').fill('wrong-password');
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(confirm.getByRole('alert')).toHaveText('The password is not correct.');
  await confirm.getByLabel('Password').fill(e2eAdmin.password);
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByRole('status')).toHaveText(`The account ${name} was created.`);
  await context.close();
});
