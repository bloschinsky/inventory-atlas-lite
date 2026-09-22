import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// The backend services are built around injected repositories, so the business rules can be
// exercised here without an HTTP server and without the working database in data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-services-test-'));

const { applySchema } = await import('../server/src/db.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { DashboardRepository } = await import('../server/src/repositories/dashboardRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { DashboardService } = await import('../server/src/services/dashboardService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { AiSettingsService } = await import('../server/src/services/aiSettingsService.js');

const build = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemPhotoRepository = new ItemPhotoRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  return {
    db,
    categoryService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    itemService: new ItemService({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository }),
    dashboardService: new DashboardService({ dashboardRepository: new DashboardRepository(db), categoryRepository })
  };
};

// Services report refusals as errors carrying the HTTP status the API answers with.
const failure = (work, status, message) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.message, message);
  return true;
});

test('the item service enforces the item rules and returns the API shape', () => {
  const { categoryService, customFieldService, itemService } = build();
  const category = categoryService.create({ name: 'Cameras' });
  const brand = customFieldService.create(category.id, { name: 'Brand', type: 'text' });
  const owned = customFieldService.create(category.id, { name: 'Owned', type: 'boolean' });

  const created = itemService.create({
    name: '  Camera  ',
    category_id: category.id,
    description: '',
    purchase_date: '2026-01-31',
    purchase_price: { amount: '1200.50', currency: 'eur' },
    serial_number: ' SN-1 ',
    field_values: { [brand.id]: 'Nikon', [owned.id]: 'true' }
  });
  assert.equal(created.name, 'Camera');
  assert.equal(created.description, null);
  assert.equal(created.serial_number, 'SN-1');
  assert.deepEqual(created.purchase_price, { amount: '1200.50', currency: 'EUR' });
  assert.ok(created.uuid);
  assert.equal('purchase_price_amount' in created, false);

  const loaded = itemService.get(created.uuid);
  assert.deepEqual(loaded.fields.map(field => [field.name, field.value]), [['Brand', 'Nikon'], ['Owned', '1']]);
  assert.deepEqual(loaded.photos, []);
  assert.equal(loaded.parent, null);
  assert.deepEqual(loaded.children, []);

  failure(() => itemService.create({ name: ' ', category_id: category.id }), 400, 'Item name is required.');
  failure(() => itemService.create({ name: 'X', category_id: 999 }), 400, 'Valid category is required.');
  failure(() => itemService.create({ name: 'X', category_id: category.id, purchase_date: '2026-02-31' }), 400, 'Purchase date must be a valid date.');
  failure(() => itemService.create({ name: 'X', category_id: category.id, purchase_price: { amount: '1', currency: 'XYZ' } }), 400, 'Purchase price currency must be a valid ISO 4217 code.');
  failure(() => itemService.create({ name: 'X', category_id: category.id, serial_number: 'S'.repeat(256) }), 400, 'Serial number must be 255 characters or fewer.');
  failure(() => itemService.create({ name: 'X', category_id: category.id, field_values: { 999: 'x' } }), 400, 'Field 999 does not belong to the selected category.');
  failure(() => itemService.get(4242), 404, 'Item not found.');
});

test('a failed item creation writes nothing at all', () => {
  const { categoryService, customFieldService, itemService } = build();
  const category = categoryService.create({ name: 'Tools' });
  const rating = customFieldService.create(category.id, { name: 'Rating', type: 'number' });

  failure(
    () => itemService.create({ name: 'Drill', category_id: category.id, field_values: { [rating.id]: 'not a number' } }),
    400,
    `Field ${rating.id} must be a number.`
  );
  assert.equal(itemService.list().pagination.total, 0);
});

test('containment rules reject impossible parents and protect filled containers', () => {
  const { categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Boxes' });
  const box = itemService.create({ name: 'Box', category_id: category.id });
  const inner = itemService.create({ name: 'Inner box', category_id: category.id, parent_item_id: box.id });

  failure(() => itemService.update(box.id, { name: 'Box', category_id: category.id, parent_item_id: box.id }), 400, 'An item cannot be stored inside itself.');
  failure(() => itemService.update(box.id, { name: 'Box', category_id: category.id, parent_item_id: inner.id }), 400, 'An item cannot be stored inside one of its own contents.');
  failure(() => itemService.create({ name: 'Lost', category_id: category.id, parent_item_id: 9999 }), 400, 'Parent item not found.');
  failure(() => itemService.remove(box.id), 409, 'This item contains 1 item(s). Move or delete them first.');

  // A container is only offered as a parent when it cannot create a cycle.
  assert.deepEqual(itemService.parentCandidates({ excludeId: box.id }).map(row => row.name), []);
  assert.deepEqual(itemService.parentCandidates({}).map(row => row.name), ['Box', 'Inner box']);
});

test('search, sorting, and pagination of the item list stay as the client expects', () => {
  const { categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Media' });
  for (const name of ['Alpha', 'Beta', 'Gamma']) itemService.create({ name, category_id: category.id, description: `${name} disc` });
  itemService.create({ name: '100% cotton', category_id: category.id });

  const page = itemService.list({ page: '2', pageSize: '2', sort: 'name', direction: 'asc' });
  assert.deepEqual(page.pagination, { page: 2, pageSize: 2, total: 4, pages: 2 });
  assert.deepEqual(page.items.map(item => item.name), ['Beta', 'Gamma']);
  assert.deepEqual(itemService.list({ sort: 'name', direction: 'desc' }).items.map(item => item.name), ['Gamma', 'Beta', 'Alpha', '100% cotton']);
  // A wildcard typed by the user is matched literally, not as a LIKE pattern.
  assert.deepEqual(itemService.list({ search: '100%' }).items.map(item => item.name), ['100% cotton']);
  assert.deepEqual(itemService.list({ search: 'disc' }).items.map(item => item.name), ['Alpha', 'Beta', 'Gamma']);
  assert.equal(itemService.list({ pageSize: '500' }).pagination.pageSize, 100);
});

test('categories and their fields guard their own deletions', () => {
  const { categoryService, customFieldService, itemService } = build();
  const category = categoryService.create({ name: 'Instruments' });
  const brand = customFieldService.create(category.id, { name: 'Brand', type: 'text' });
  const item = itemService.create({ name: 'Guitar', category_id: category.id, field_values: { [brand.id]: 'Fender' } });

  failure(() => categoryService.remove(category.id), 409, 'Category is used by 1 item(s). Move or delete them first.');
  failure(() => customFieldService.create(category.id, { name: 'Broken', type: 'colour' }), 400, 'Invalid field type.');
  failure(() => customFieldService.remove(brand.id, false), 409, 'This field has 1 saved value(s). Confirm deletion to remove them.');
  assert.deepEqual(customFieldService.suggestions(brand.id, { search: 'fen' }), [{ value: 'Fender', usage_count: 1 }]);

  customFieldService.remove(brand.id, true);
  assert.deepEqual(customFieldService.listForCategory(category.id), []);
  itemService.remove(item.id);
  categoryService.remove(category.id);
  failure(() => categoryService.requireCategory(category.id), 404, 'Category not found.');
});

test('the batch field document is reviewed again before anything is created', () => {
  const { categoryService, customFieldService } = build();
  const category = categoryService.create({ name: 'Books' });
  customFieldService.create(category.id, { name: 'Author', type: 'text' });

  const created = customFieldService.createBatch(category.id, {
    version: 1,
    fields: [{ name: 'Publisher', type: 'text', required: false }, { name: 'Pages', type: 'number', required: false }]
  });
  assert.deepEqual(created.map(field => [field.name, field.type]), [['Publisher', 'text'], ['Pages', 'number']]);

  // A duplicate of an existing field blocks the whole document, so nothing is written.
  assert.throws(() => customFieldService.createBatch(category.id, {
    version: 1,
    fields: [{ name: 'Series', type: 'text', required: false }, { name: 'Author', type: 'text', required: false }]
  }), error => error.status === 400);
  assert.deepEqual(customFieldService.listForCategory(category.id).map(field => field.name), ['Author', 'Publisher', 'Pages']);
});

test('the dashboard summarizes the inventory and its optional category scope', () => {
  const { categoryService, itemService, dashboardService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const tools = categoryService.create({ name: 'Tools' });
  const box = itemService.create({ name: 'Box', category_id: tools.id, location: 'Shelf' });
  itemService.create({ name: 'Camera', category_id: cameras.id, condition: ' USED ' });
  itemService.create({ name: 'Lens', category_id: cameras.id, parent_item_id: box.id });

  const overview = dashboardService.overview({});
  assert.equal(overview.totalItems, 3);
  assert.deepEqual(overview.scope, { categoryId: null, categoryName: null });
  assert.deepEqual(overview.photoCoverage, { withPhotos: 0, withoutPhotos: 3, percentage: 0 });
  assert.deepEqual(overview.placement, { insideContainer: 1, directLocation: 1, unplaced: 1 });
  assert.deepEqual(overview.categoryDistribution.map(row => [row.label, row.count]), [['Cameras', 2], ['Tools', 1]]);

  const scoped = dashboardService.overview({ categoryId: String(cameras.id) });
  assert.deepEqual(scoped.scope, { categoryId: cameras.id, categoryName: 'Cameras' });
  assert.equal(scoped.totalItems, 2);
  // Conditions are grouped case-insensitively and labelled for display.
  assert.deepEqual(scoped.conditionDistribution, [
    { key: 'not-specified', label: 'Not specified', count: 1 },
    { key: 'used', label: 'Used', count: 1 }
  ]);
  assert.ok(scoped.categoryDistribution.find(row => row.label === 'Cameras').selected);

  failure(() => dashboardService.overview({ categoryId: 'all' }), 400, 'Category ID must be a positive integer.');
  failure(() => dashboardService.overview({ categoryId: '999' }), 404, 'Category not found.');
});

test('the displayed location is inherited from the top-most container', () => {
  const { categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Gear' });
  const save = (item, changes) => itemService.update(item.id, {
    name: item.name, category_id: category.id, location: item.location, parent_item_id: item.parent_item_id, ...changes
  });

  const box = itemService.create({ name: 'Box', category_id: category.id, location: 'Home' });
  const bag = itemService.create({ name: 'Camera Bag', category_id: category.id, location: 'Office', parent_item_id: box.id });
  const camera = itemService.create({ name: 'Camera', category_id: category.id, location: 'Garage', parent_item_id: bag.id });

  // A top-level item keeps its own location; nested ones resolve through every parent level.
  assert.equal(itemService.get(box.id).effective_location, 'Home');
  assert.equal(itemService.get(bag.id).effective_location, 'Home');
  const nested = itemService.get(camera.id);
  assert.equal(nested.effective_location, 'Home');
  assert.deepEqual(nested.effective_location_source, { id: box.id, uuid: box.uuid, name: 'Box' });
  assert.equal(itemService.get(box.id).effective_location_source, null);
  // The saved location of the nested item is never rewritten.
  assert.equal(nested.location, 'Garage');
  assert.deepEqual(
    itemService.list({ sort: 'name' }).items.map(item => [item.name, item.location, item.effective_location]),
    [['Box', 'Home', 'Home'], ['Camera', 'Garage', 'Home'], ['Camera Bag', 'Office', 'Home']]
  );

  // Moving the container moves every descendant without touching their rows.
  save(box, { location: 'Storage unit' });
  assert.equal(itemService.get(camera.id).effective_location, 'Storage unit');
  assert.equal(itemService.get(camera.id).location, 'Garage');

  // Taking an item out of its container shows its own saved location again, with no migration.
  const freed = save(camera, { parent_item_id: null });
  assert.equal(freed.effective_location, 'Garage');
  assert.equal(freed.effective_location_source, null);
  save(camera, { parent_item_id: bag.id });

  // A chain without any location resolves to nothing, so the views show their empty state.
  save(box, { location: '' });
  assert.equal(itemService.get(camera.id).effective_location, null);
  assert.equal(itemService.list({ search: 'Camera Bag' }).items[0].effective_location, null);
});

test('the item list resolves every effective location in one query', () => {
  const { db, categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Crates' });
  let parentId = null;
  for (const name of ['Crate', 'Tray', 'Pouch', 'Tag']) {
    parentId = itemService.create({ name, category_id: category.id, location: name, parent_item_id: parentId }).id;
  }

  const prepare = db.prepare.bind(db);
  let statements = 0;
  db.prepare = sql => { statements += 1; return prepare(sql); };
  const listed = itemService.list({ pageSize: '100', sort: 'name' });
  db.prepare = prepare;

  assert.deepEqual(listed.items.map(item => item.effective_location), ['Crate', 'Crate', 'Crate', 'Crate']);
  // One statement counts the matches and one reads the page, whatever the nesting depth is.
  assert.equal(statements, 2);
});

// The AI settings are a file, not a table, so they are exercised here with a temporary path.
const aiSettings = () => new AiSettingsService({
  settingsPath: path.join(process.env.DATA_DIR, `ai-settings-${Math.random().toString(36).slice(2)}.json`),
  openAiClient: { listModels: async () => [] }
});

const savable = changes => ({ enabled: false, provider: 'openai', model: 'gpt-5.6-luna', ...changes });

test('AI features stay off until a key is saved with them', () => {
  const service = aiSettings();

  // A fresh installation has no settings file, so nothing offers AI before it is configured.
  assert.deepEqual(service.publicSettings(), {
    enabled: false, provider: 'openai', model: 'gpt-5.6-luna', hasApiKey: false, apiKeyMasked: ''
  });

  // Asking for AI without a key is stored as off, so the saved state never promises what cannot run.
  assert.equal(service.write(savable({ enabled: true })).enabled, false);
  assert.equal(service.read().enabled, false);
  assert.throws(() => service.requireUsableSettings('Add a key.'), /Add a key\./);

  // The key and the switch may arrive in the same save.
  const configured = service.write(savable({ enabled: true, apiKey: 'sk-services-test-key' }));
  assert.equal(configured.enabled, true);
  assert.equal(configured.hasApiKey, true);
  assert.equal(service.requireUsableSettings('Add a key.').apiKey, 'sk-services-test-key');

  // Turning AI off keeps the key, so re-enabling needs no new one.
  assert.equal(service.write(savable({ enabled: false })).hasApiKey, true);
  assert.throws(() => service.requireUsableSettings('Add a key.'), /AI features are disabled/);
  assert.equal(service.write(savable({ enabled: true })).enabled, true);

  // Removing the key turns AI off with it.
  const cleared = service.write(savable({ enabled: true, clearApiKey: true }));
  assert.equal(cleared.enabled, false);
  assert.equal(cleared.hasApiKey, false);
});

test('an AI settings file that lost its key reads as disabled', () => {
  const service = aiSettings();
  writeFileSync(service.settingsPath, JSON.stringify({ enabled: true, provider: 'openai', model: 'gpt-5.6-luna', apiKey: '' }));

  assert.equal(service.read().enabled, false);
  assert.equal(service.publicSettings().enabled, false);
});
