import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let port = 32000 + Math.floor(Math.random() * 1000);
let base = `http://127.0.0.1:${port}`;

// Every start claims a fresh port so a previous server socket can never block the next one.
async function startServer(dataDir, environment = {}) {
  port += 1;
  base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/src/index.js', '--production'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...environment }, stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming ready.');
    try { if ((await fetch(`${base}/api/categories`)).ok) return child; } catch {
      // The server may still be starting; retry until the readiness deadline.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error('Server did not become ready.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}

async function request(url, options) {
  const response = await fetch(`${base}${url}`, options);
  assert.ok(response.ok, `${options?.method || 'GET'} ${url} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function failedStatus(url, options) {
  const response = await fetch(`${base}${url}`, options);
  assert.ok(!response.ok, `${options?.method || 'GET'} ${url} unexpectedly succeeded`);
  return response.status;
}

const saveItem = (item, changes) => json('PUT', { name: item.name, category_id: item.category_id, ...changes });

test('inventory acceptance path persists and produces a valid backup', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const category = await request('/api/categories', json('POST', { name: 'Cameras' }));
    const brand = await request(`/api/categories/${category.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));
    const year = await request(`/api/categories/${category.id}/fields`, json('POST', { name: 'Year', type: 'number' }));
    const item = await request('/api/items', json('POST', {
      name: 'Olympus Pen F', category_id: category.id, description: 'Half-frame camera',
      condition: 'Good', location: 'Cabinet A', field_values: { [brand.id]: 'Olympus', [year.id]: '1963' }
    }));

    const photoData = new FormData();
    photoData.append('photos', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'camera.png');
    const photos = await request(`/api/items/${item.id}/photos`, { method: 'POST', body: photoData });
    assert.equal(photos.length, 1);

    const list = await request(`/api/items?search=Olympus&categoryId=${category.id}`);
    assert.equal(list.pagination.total, 1);
    assert.ok(list.items[0].thumbnail_id);

    const dashboard = await request(`/api/dashboard?categoryId=${category.id}`);
    assert.equal(dashboard.totalItems, 1);
    assert.deepEqual(dashboard.photoCoverage, { withPhotos: 1, withoutPhotos: 0, percentage: 100 });
    assert.equal(dashboard.placement.directLocation, 1);
    assert.equal(dashboard.conditionDistribution[0].label, 'Good');

    const backupResponse = await fetch(`${base}/api/backup`);
    assert.ok(backupResponse.ok);
    const backupPath = path.join(dataDir, 'checked-backup.sqlite');
    await writeFile(backupPath, Buffer.from(await backupResponse.arrayBuffer()));
    const backup = new Database(backupPath, { readonly: true });
    assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM items').get().count, 1);
    backup.close();

    await stopServer(server);
    server = await startServer(dataDir);
    const persisted = await request(`/api/items/${item.id}`);
    assert.equal(persisted.name, 'Olympus Pen F');
    assert.equal(persisted.photos.length, 1);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('existing databases migrate and purchase and serial fields round-trip safely', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-purchase-fields-test-'));
  const databasePath = path.join(dataDir, 'inventory.sqlite');
  const legacy = new Database(databasePath);
  legacy.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT, updated_at TEXT);
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id), description TEXT, condition TEXT,
      location TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL, type TEXT NOT NULL, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE item_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id),
      field_id INTEGER NOT NULL REFERENCES custom_fields(id), value TEXT, UNIQUE(item_id, field_id)
    );
    CREATE TABLE item_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id),
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT
    );
    INSERT INTO categories (id, name) VALUES (1, 'Legacy');
    INSERT INTO items (id, uuid, name, category_id, description) VALUES (7, 'legacy-uuid', 'Existing camera', 1, 'Kept intact');
    INSERT INTO custom_fields (id, category_id, name, type) VALUES (3, 1, 'Brand', 'text');
    INSERT INTO item_field_values (item_id, field_id, value) VALUES (7, 3, 'Olympus');
    INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES (7, 'legacy.png', 'image/png', X'8950');
  `);
  legacy.close();

  let server;
  try {
    server = await startServer(dataDir);

    const migrated = await request('/api/items/7');
    assert.equal(migrated.id, 7);
    assert.equal(migrated.description, 'Kept intact');
    assert.equal(migrated.purchase_date, null);
    assert.equal(migrated.purchase_price, null);
    assert.equal(migrated.serial_number, null);
    assert.equal(migrated.fields[0].value, 'Olympus');
    assert.equal(migrated.photos[0].filename, 'legacy.png');

    const migratedDatabase = new Database(databasePath, { readonly: true });
    const columns = new Map(migratedDatabase.pragma('table_info(items)').map(column => [column.name, column]));
    for (const name of ['purchase_date', 'purchase_price_amount', 'purchase_price_currency', 'serial_number']) {
      assert.equal(columns.get(name).notnull, 0);
    }
    migratedDatabase.close();

    const createWithPrice = (name, amount, currency, extra = {}) => request('/api/items', json('POST', {
      name, category_id: 1, purchase_price: { amount, currency }, ...extra
    }));
    const item = await createWithPrice('Purchased camera', '49.99', 'USD', {
      purchase_date: '2024-11-18', serial_number: '  000123ABC-09  '
    });
    await createWithPrice('Local purchase', '1000', 'UAH');
    await createWithPrice('European purchase', '39.50', 'EUR');
    const zeroPrice = await createWithPrice('Free purchase', '0', 'GBP');

    assert.equal(item.purchase_date, '2024-11-18');
    assert.deepEqual(item.purchase_price, { amount: '49.99', currency: 'USD' });
    assert.equal(item.serial_number, '000123ABC-09');
    assert.deepEqual(zeroPrice.purchase_price, { amount: '0', currency: 'GBP' });
    assert.equal((await request('/api/items?search=000123ABC-09')).items[0].id, item.id);

    const updated = await request(`/api/items/${item.id}`, json('PUT', {
      name: item.name, category_id: item.category_id, purchase_date: '2025-02-28',
      purchase_price: { amount: '39.50', currency: 'EUR' }, serial_number: '12A/9382-B'
    }));
    assert.equal(updated.purchase_date, '2025-02-28');
    assert.deepEqual(updated.purchase_price, { amount: '39.50', currency: 'EUR' });
    assert.equal(updated.serial_number, '12A/9382-B');

    const cleared = await request(`/api/items/${item.id}`, json('PUT', {
      name: item.name, category_id: item.category_id, purchase_date: '',
      purchase_price: { amount: '', currency: 'GBP' }, serial_number: ''
    }));
    assert.equal(cleared.purchase_date, null);
    assert.equal(cleared.purchase_price, null);
    assert.equal(cleared.serial_number, null);

    assert.equal(await failedStatus('/api/items', json('POST', { name: 'Bad date', category_id: 1, purchase_date: '2025-02-30' })), 400);
    assert.equal(await failedStatus('/api/items', json('POST', { name: 'Bad amount', category_id: 1, purchase_price: { amount: '50 dollars', currency: 'USD' } })), 400);
    assert.equal(await failedStatus('/api/items', json('POST', { name: 'Negative amount', category_id: 1, purchase_price: { amount: '-1', currency: 'USD' } })), 400);
    assert.equal(await failedStatus('/api/items', json('POST', { name: 'Bad currency', category_id: 1, purchase_price: { amount: '50', currency: 'XXX' } })), 400);

    const backupResponse = await fetch(`${base}/api/backup`);
    assert.ok(backupResponse.ok);
    const backupPath = path.join(dataDir, 'purchase-fields-backup.sqlite');
    await writeFile(backupPath, Buffer.from(await backupResponse.arrayBuffer()));
    const backup = new Database(backupPath, { readonly: true });
    assert.deepEqual(
      backup.prepare('SELECT purchase_price_amount, purchase_price_currency FROM items WHERE name = ?').get('European purchase'),
      { purchase_price_amount: '39.50', purchase_price_currency: 'EUR' }
    );
    backup.close();
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('item nesting keeps a valid hierarchy and survives restart and backup', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-nesting-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const category = await request('/api/categories', json('POST', { name: 'Storage' }));
    const create = name => request('/api/items', json('POST', { name, category_id: category.id }));
    const boxA = await create('Box A');
    const boxB = await create('Box B');
    const lens = await create('Helios 44-2');

    // Assign a parent, then read it back from both sides of the relationship.
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxA.id }));
    const nested = await request(`/api/items/${lens.id}`);
    assert.equal(nested.parent_item_id, boxA.id);
    assert.equal(nested.parent.name, 'Box A');
    // The items list carries the direct parent so it can be shown as a column.
    const listed = await request(`/api/items?search=Helios`);
    assert.equal(listed.items[0].parent_id, boxA.id);
    assert.equal(listed.items[0].parent_name, 'Box A');
    const containerA = await request(`/api/items/${boxA.id}`);
    assert.deepEqual(containerA.children.map(child => child.name), ['Helios 44-2']);
    assert.equal(containerA.children[0].category_name, 'Storage');

    // Move to another container and then back to the top level.
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxB.id }));
    assert.equal((await request(`/api/items/${boxB.id}`)).children.length, 1);
    assert.equal((await request(`/api/items/${boxA.id}`)).children.length, 0);
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: null }));
    assert.equal((await request(`/api/items/${lens.id}`)).parent_item_id, null);

    // Parent candidates exclude the edited item and its descendants.
    await request(`/api/items/${boxB.id}`, saveItem(boxB, { parent_item_id: boxA.id }));
    const candidates = await request(`/api/items/parent-candidates?excludeId=${boxA.id}`);
    assert.deepEqual(candidates.map(candidate => candidate.name).sort(), ['Helios 44-2']);

    // Cycles are rejected: self-parenting, a direct cycle, and an indirect one.
    assert.equal(await failedStatus(`/api/items/${boxA.id}`, saveItem(boxA, { parent_item_id: boxA.id })), 400);
    assert.equal(await failedStatus(`/api/items/${boxA.id}`, saveItem(boxA, { parent_item_id: boxB.id })), 400);
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxB.id }));
    assert.equal(await failedStatus(`/api/items/${boxA.id}`, saveItem(boxA, { parent_item_id: lens.id })), 400);
    assert.equal(await failedStatus(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: 999999 })), 400);

    // A container with contents cannot be deleted until the contents are moved away.
    assert.equal(await failedStatus(`/api/items/${boxB.id}`, { method: 'DELETE' }), 409);
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: null }));
    await request(`/api/items/${boxB.id}`, { method: 'DELETE' });
    assert.equal((await request(`/api/items/${boxA.id}`)).children.length, 0);

    // The remaining hierarchy survives a backup and a restart.
    await request(`/api/items/${lens.id}`, saveItem(lens, { parent_item_id: boxA.id }));
    const backupResponse = await fetch(`${base}/api/backup`);
    assert.ok(backupResponse.ok);
    const backupPath = path.join(dataDir, 'nesting-backup.sqlite');
    await writeFile(backupPath, Buffer.from(await backupResponse.arrayBuffer()));
    const backup = new Database(backupPath, { readonly: true });
    assert.equal(backup.prepare('SELECT parent_item_id FROM items WHERE id = ?').get(lens.id).parent_item_id, boxA.id);
    backup.close();

    await stopServer(server);
    server = await startServer(dataDir);
    assert.equal((await request(`/api/items/${lens.id}`)).parent.name, 'Box A');
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('text field suggestions reuse existing values of the same field only', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-suggestions-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const cameras = await request('/api/categories', json('POST', { name: 'Cameras' }));
    const brand = await request(`/api/categories/${cameras.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));
    const year = await request(`/api/categories/${cameras.id}/fields`, json('POST', { name: 'Year', type: 'number' }));
    const lenses = await request('/api/categories', json('POST', { name: 'Lenses' }));
    const lensBrand = await request(`/api/categories/${lenses.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));

    const addCamera = value => request('/api/items', json('POST', { name: `Camera ${value}`, category_id: cameras.id, field_values: { [brand.id]: value } }));
    for (const value of ['Pentax', 'Pentax', 'Pentax', '  pentax ', 'Olympus', 'Olympus', 'Canon', '   ', '']) await addCamera(value);
    await request('/api/items', json('POST', { name: 'Summicron', category_id: lenses.id, field_values: { [lensBrand.id]: 'Leica' } }));

    // Values are grouped case-insensitively, ordered by usage and then alphabetically.
    const all = await request(`/api/fields/${brand.id}/suggestions`);
    assert.deepEqual(all, [
      { value: 'Pentax', usage_count: 4 },
      { value: 'Olympus', usage_count: 2 },
      { value: 'Canon', usage_count: 1 }
    ]);

    // A field with the same name in another category keeps a separate set of suggestions.
    assert.deepEqual(await request(`/api/fields/${lensBrand.id}/suggestions`), [{ value: 'Leica', usage_count: 1 }]);

    // Prefix matching is case-insensitive, and user wildcards are matched literally.
    assert.deepEqual((await request(`/api/fields/${brand.id}/suggestions?search=pe`)).map(s => s.value), ['Pentax']);
    assert.deepEqual((await request(`/api/fields/${brand.id}/suggestions?search=%20PE%20`)).map(s => s.value), ['Pentax']);
    assert.deepEqual(await request(`/api/fields/${brand.id}/suggestions?search=ta`), []);
    assert.deepEqual(await request(`/api/fields/${brand.id}/suggestions?search=%25`), []);

    // A newly saved value becomes available without any extra administration.
    await addCamera('Zenit');
    assert.deepEqual(await request(`/api/fields/${brand.id}/suggestions?search=ze`), [{ value: 'Zenit', usage_count: 1 }]);

    // The default limit is 10 and the maximum is 20, whatever the client asks for.
    const tagCategory = await request('/api/categories', json('POST', { name: 'Bulk' }));
    const tag = await request(`/api/categories/${tagCategory.id}/fields`, json('POST', { name: 'Tag', type: 'text' }));
    for (let index = 0; index < 22; index++) {
      await request('/api/items', json('POST', { name: `Bulk ${index}`, category_id: tagCategory.id, field_values: { [tag.id]: `Tag ${String(index).padStart(2, '0')}` } }));
    }
    assert.equal((await request(`/api/fields/${tag.id}/suggestions`)).length, 10);
    assert.equal((await request(`/api/fields/${tag.id}/suggestions?limit=5`)).length, 5);
    assert.equal((await request(`/api/fields/${tag.id}/suggestions?limit=50`)).length, 20);

    // Suggestions exist only for existing text fields.
    assert.equal(await failedStatus('/api/fields/999999/suggestions'), 404);
    assert.equal(await failedStatus(`/api/fields/${year.id}/suggestions`), 400);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('the health endpoint reports the running version while SQLite is usable', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-test-'));
  let server;
  try {
    server = await startServer(dataDir);
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    const health = await response.json();
    const expected = JSON.parse(await readFile('package.json', 'utf8')).version;
    assert.deepEqual(health, { status: 'ok', database: 'ok', version: expected });

    // Deployment scripts poll this endpoint, so it must not leak paths or other diagnostics.
    assert.deepEqual(Object.keys(health).sort(), ['database', 'status', 'version']);
  } finally {
    if (server) await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('AI settings stay server-side and image analysis returns a validated inventory draft', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-ai-test-'));
  let appServer;
  let providerRequest;
  const providerServer = createServer(async (req, res) => {
    let rawBody = '';
    for await (const chunk of req) rawBody += chunk.toString();
    providerRequest = {
      authorization: req.headers.authorization,
      body: JSON.parse(rawBody)
    };
    const prompt = JSON.parse(providerRequest.body.input[0].content[0].text);
    const cameras = prompt.inventorySchema.categories.find(category => category.name === 'Cameras');
    const brand = cameras.fields.find(field => field.name === 'Brand');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      output_text: JSON.stringify({
        categoryId: cameras.id,
        confidence: 0.87,
        needsDetailedImageAnalysis: false,
        baseFields: {
          name: 'Visible camera', description: 'Camera with a visible maker label', condition: null,
          location: null, purchase_date: null, purchase_price_amount: null,
          purchase_price_currency: null, serial_number: 'ABC-123'
        },
        dynamicFields: [
          { fieldId: brand.id, value: 'Olympus' },
          { fieldId: 999999, value: 'discard me' }
        ],
        warnings: ['Verify the exact model.']
      }),
      usage: { input_tokens: 100, output_tokens: 50 }
    }));
  });
  await new Promise(resolve => providerServer.listen(0, '127.0.0.1', resolve));
  const providerPort = providerServer.address().port;
  const imageData = () => {
    const data = new FormData();
    data.append('image', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'camera.png');
    data.append('hint', 'The label may say Olympus.');
    return data;
  };
  try {
    appServer = await startServer(dataDir, { OPENAI_BASE_URL: `http://127.0.0.1:${providerPort}` });
    assert.equal(await failedStatus('/api/ai/items/analyze', { method: 'POST', body: imageData() }), 409);

    const emptySettings = await request('/api/settings/ai');
    assert.deepEqual(emptySettings, { enabled: false, provider: 'openai', model: 'gpt-4o-mini', hasApiKey: false, apiKeyMasked: '' });
    await request('/api/settings/ai', json('PUT', { enabled: true, provider: 'openai', model: 'gpt-4o-mini' }));
    assert.equal(await failedStatus('/api/ai/items/analyze', { method: 'POST', body: imageData() }), 409);

    const configured = await request('/api/settings/ai', json('PUT', {
      enabled: true, provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test-not-a-real-secret'
    }));
    assert.equal(configured.hasApiKey, true);
    assert.equal(configured.apiKeyMasked, '••••••••cret');
    assert.ok(!JSON.stringify(configured).includes('sk-test'));

    const cameras = await request('/api/categories', json('POST', { name: 'Cameras' }));
    const brand = await request(`/api/categories/${cameras.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));
    await request('/api/items', json('POST', { name: 'Existing private inventory item', category_id: cameras.id }));
    const draft = await request('/api/ai/items/analyze', { method: 'POST', body: imageData() });
    assert.equal(draft.categoryId, cameras.id);
    assert.equal(draft.baseFields.name, 'Visible camera');
    assert.equal(draft.baseFields.serial_number, 'ABC-123');
    assert.equal(draft.dynamicFields[brand.id], 'Olympus');
    assert.equal(draft.dynamicFields['999999'], undefined);
    assert.deepEqual(draft.warnings, ['Verify the exact model.']);

    assert.equal(providerRequest.authorization, 'Bearer sk-test-not-a-real-secret');
    assert.equal(providerRequest.body.model, 'gpt-4o-mini');
    assert.equal(providerRequest.body.store, false);
    assert.equal(providerRequest.body.input[0].content[1].detail, 'low');
    assert.equal(providerRequest.body.text.format.type, 'json_schema');
    assert.equal(providerRequest.body.text.format.strict, true);
    assert.ok(!JSON.stringify(providerRequest.body).includes('Existing private inventory item'));

    const invalidImage = new FormData();
    invalidImage.append('image', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
    assert.equal(await failedStatus('/api/ai/items/analyze', { method: 'POST', body: invalidImage }), 400);
    const unsupportedImage = new FormData();
    unsupportedImage.append('image', new Blob(['plain text'], { type: 'text/plain' }), 'fake.txt');
    assert.equal(await failedStatus('/api/ai/items/analyze', { method: 'POST', body: unsupportedImage }), 400);
  } finally {
    if (appServer) await stopServer(appServer);
    await new Promise(resolve => providerServer.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
