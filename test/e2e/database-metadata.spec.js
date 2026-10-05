import { expect, test } from '@playwright/test';
import { detail, unique } from './helpers.js';

test('the database can be renamed in Settings and shows its identity', async ({ page, request }) => {
  const metadata = await (await request.get('/api/database/metadata')).json();
  const name = unique('Garage');

  await page.goto('/settings/database');
  await page.mouse.move(600, 400);
  const card = page.getByRole('region', { name: 'Database' });
  const nameInput = card.getByLabel('Database name');
  await expect(nameInput).toHaveValue(metadata.name);
  await expect(detail(card, 'Last updated')).not.toBeEmpty();
  // Technical values stay folded away until asked for.
  await expect(card.getByText(metadata.database_uuid)).toBeHidden();

  // An empty name is refused by the form before it reaches the server.
  await nameInput.fill('');
  await card.getByRole('button', { name: 'Save name' }).click();
  expect(await nameInput.evaluate(input => input.validity.valueMissing)).toBe(true);

  await nameInput.fill(`  ${name}  `);
  await card.getByRole('button', { name: 'Save name' }).click();
  await expect(card.getByRole('status')).toHaveText('Database name saved.');
  await expect(nameInput).toHaveValue(name);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Database' }).getByLabel('Database name')).toHaveValue(name);
  const reloaded = page.getByRole('region', { name: 'Database' });
  await reloaded.getByText('Technical details').click();
  await expect(reloaded.getByText(metadata.database_uuid)).toBeVisible();
  await expect(detail(reloaded, 'Schema version')).toHaveText(String(metadata.schema_version));
  await expect(detail(reloaded, 'Created')).not.toBeEmpty();
});
