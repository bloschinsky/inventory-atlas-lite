import assert from 'node:assert/strict';

const [mode, baseUrl, expectedVersion] = process.argv.slice(2);
const itemName = 'Docker persistence smoke item';
const photoBytes = Buffer.from('inventory-atlas-lite-docker-photo');

if (!['create', 'verify'].includes(mode) || !baseUrl || !expectedVersion) {
  throw new Error('Usage: node test/docker-smoke.mjs <create|verify> <base-url> <version>');
}

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  assert.equal(response.ok, true, `${options?.method || 'GET'} ${path} returned ${response.status}`);
  return response;
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const health = await (await request('/api/health')).json();
// The body also carries the restore readiness flags, so this smoke test checks the fields it is
// about instead of the exact shape of the response.
assert.equal(health.status, 'ok');
assert.equal(health.database, 'ok');
assert.equal(health.version, expectedVersion);
assert.equal(health.ready, true, 'the container answers outside restore maintenance');

if (mode === 'create') {
  const category = await (await request('/api/categories', json('POST', { name: 'Docker smoke category' }))).json();
  const field = await (await request(`/api/categories/${category.id}/fields`, json('POST', {
    name: 'Persistence marker', type: 'text'
  }))).json();
  const parent = await (await request('/api/items', json('POST', {
    name: 'Docker smoke container', category_id: category.id
  }))).json();
  const item = await (await request('/api/items', json('POST', {
    name: itemName,
    category_id: category.id,
    parent_item_id: parent.id,
    field_values: { [field.id]: 'survives-recreation' }
  }))).json();
  const photos = new FormData();
  photos.append('photos', new Blob([photoBytes], { type: 'image/png' }), 'smoke.png');
  await request(`/api/items/${item.id}/photos`, { method: 'POST', body: photos });
} else {
  const list = await (await request(`/api/items?search=${encodeURIComponent(itemName)}`)).json();
  assert.equal(list.pagination.total, 1);
  const item = await (await request(`/api/items/${list.items[0].id}`)).json();
  assert.equal(item.parent.name, 'Docker smoke container');
  assert.equal(item.fields.find(field => field.name === 'Persistence marker')?.value, 'survives-recreation');
  assert.equal(item.photos.length, 1);
  const photo = Buffer.from(await (await request(`/api/photos/${item.photos[0].id}`)).arrayBuffer());
  assert.deepEqual(photo, photoBytes);
  const backup = Buffer.from(await (await request('/api/backup')).arrayBuffer());
  assert.equal(backup.subarray(0, 16).toString(), 'SQLite format 3\0');
}
