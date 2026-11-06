import assert from 'node:assert/strict';

/*
  The release image smoke test (`.github/workflows/release.yml`). `create` runs on a fresh container
  whose first administrator is set up with the one-time code that `docker exec … auth.js init` printed
  (SMOKE_SETUP_CODE), then stores data through the signed-in API. `verify` runs on a new container over
  the same volume: the security store and the account must have survived, the API must still refuse
  anonymous requests, and the data must read back after signing in. Only the documented setup and
  sign-in flow is used; nothing in the image is weakened for the test.
*/
const [mode, baseUrl, expectedVersion] = process.argv.slice(2);
const itemName = 'Docker persistence smoke item';
const photoBytes = Buffer.from('inventory-atlas-lite-docker-photo');
const admin = { username: 'smoke-admin', password: 'docker-smoke-admin-password' };

if (!['create', 'verify'].includes(mode) || !baseUrl || !expectedVersion) {
  throw new Error('Usage: node test/docker-smoke.mjs <create|verify> <base-url> <version>');
}

// The signed-in session: its cookie on every request, its anti-CSRF token on every change.
const session = { cookie: '', csrfToken: '' };

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (session.cookie) headers.set('Cookie', session.cookie);
  if (session.csrfToken && options.method && options.method !== 'GET') headers.set('X-CSRF-Token', session.csrfToken);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  assert.equal(response.ok, true, `${options.method || 'GET'} ${path} returned ${response.status}`);
  return response;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function startSession(path, body) {
  const response = await request(path, json('POST', body));
  session.cookie = response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).find(cookie => /ial_session=./.test(cookie));
  session.csrfToken = (await response.json()).csrfToken;
  assert.ok(session.cookie && session.csrfToken, `${path} started a session`);
}

const health = await (await request('/api/health')).json();
// The body also carries the restore readiness flags, so this smoke test checks the fields it is
// about instead of the exact shape of the response.
assert.equal(health.status, 'ok');
assert.equal(health.database, 'ok');
assert.equal(health.version, expectedVersion);
assert.equal(health.ready, true, 'the container answers outside restore maintenance');
assert.equal((await fetch(`${baseUrl}/api/items`)).status, 401, 'the API refuses anonymous requests');
const state = await (await request('/api/auth/session')).json();

if (mode === 'create') {
  assert.equal(state.setupRequired, true, 'a fresh container waits for its first administrator');
  const code = process.env.SMOKE_SETUP_CODE;
  assert.ok(code, 'SMOKE_SETUP_CODE holds the code printed by auth.js init');
  await startSession('/api/auth/setup', { code, ...admin });

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
  // The recreated container reuses the volume's security store: no new setup, the same account.
  assert.equal(state.setupRequired, false, 'the account survived the container recreation');
  await startSession('/api/auth/login', admin);
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
  assert.equal(backup.toString('latin1').includes('argon2'), false, 'the inventory backup carries no account');
}
