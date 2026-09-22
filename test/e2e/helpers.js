import { expect } from '@playwright/test';

// Unique names keep tests independent even though they share one test database.
let counter = 0;
export const unique = prefix => `${prefix} ${Date.now().toString(36)}-${counter++}`;

// Value of the definition list entry shown for a label on the item details page.
export const detail = (page, label) => page.locator(`dt:text-is("${label}") + dd`);

const post = async (request, url, data) => {
  const response = await request.post(url, { data });
  expect(response.ok(), `POST ${url} returned ${response.status()}`).toBeTruthy();
  return response.json();
};

// Setup shortcut for data that is not the behavior under test. It goes through the
// same isolated test API as the browser, so it never touches data/inventory.sqlite.
export async function createCategory(request, name, fields = []) {
  const category = await post(request, '/api/categories', { name });
  for (const field of fields) await post(request, `/api/categories/${category.id}/fields`, field);
  return category;
}

export const createItem = (request, data) => post(request, '/api/items', data);

// AI visibility is a saved server setting shared by the whole suite, so a spec that depends on it
// states the state it needs instead of inheriting whatever ran before it.
export async function setAiEnabled(request, enabled) {
  const response = await request.put('/api/settings/ai', { data: { enabled, provider: 'openai', model: 'gpt-5.6-luna' } });
  expect(response.ok(), `PUT /api/settings/ai returned ${response.status()}`).toBeTruthy();
}
