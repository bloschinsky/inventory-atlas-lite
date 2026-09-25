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
// `expected` is a stable error code, or the full { code, params } body when the parameters matter.
const failure = (work, status, expected) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  if (typeof expected === 'string') assert.equal(error.code, expected);
  else assert.deepEqual({ code: error.code, params: error.params }, expected);
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

  failure(() => itemService.create({ name: ' ', category_id: category.id }), 400, 'ITEM_NAME_REQUIRED');
  failure(() => itemService.create({ name: 'X', category_id: 999 }), 400, 'CATEGORY_REQUIRED');
  failure(() => itemService.create({ name: 'X', category_id: category.id, purchase_date: '2026-02-31' }), 400, 'INVALID_PURCHASE_DATE');
  failure(() => itemService.create({ name: 'X', category_id: category.id, purchase_price: { amount: '1', currency: 'XYZ' } }), 400, 'INVALID_PURCHASE_PRICE_CURRENCY');
  failure(() => itemService.create({ name: 'X', category_id: category.id, serial_number: 'S'.repeat(256) }), 400, { code: 'SERIAL_NUMBER_TOO_LONG', params: { max: 255 } });
  failure(() => itemService.create({ name: 'X', category_id: category.id, field_values: { 999: 'x' } }), 400, { code: 'FIELD_NOT_IN_CATEGORY', params: { fieldId: '999' } });
  failure(() => itemService.get(4242), 404, 'ITEM_NOT_FOUND');
});

test('a failed item creation writes nothing at all', () => {
  const { categoryService, customFieldService, itemService } = build();
  const category = categoryService.create({ name: 'Tools' });
  const rating = customFieldService.create(category.id, { name: 'Rating', type: 'number' });

  failure(
    () => itemService.create({ name: 'Drill', category_id: category.id, field_values: { [rating.id]: 'not a number' } }),
    400,
    { code: 'INVALID_CUSTOM_FIELD_NUMBER', params: { field: 'Rating' } }
  );
  assert.equal(itemService.list().pagination.total, 0);
});

test('batch item import creates every item through the regular item rules', () => {
  const { categoryService, customFieldService, itemService } = build();
  const category = categoryService.create({ name: 'Computer Equipment' });
  const other = categoryService.create({ name: 'Other' });
  for (const [name, type] of [['Brand', 'text'], ['Ports', 'number'], ['Released', 'date'], ['Working', 'boolean']]) {
    customFieldService.create(category.id, { name, type });
  }
  const document = items => ({ version: 1, category: 'Computer Equipment', items });

  const created = itemService.createBatch({
    categoryId: category.id,
    document: document([
      {
        name: ' Hub ',
        condition: 'Good',
        location: 'Shelf A',
        description: 'Seven-port hub',
        transferredTo: '',
        purchaseDate: '2024-05-01',
        purchasePrice: { amount: 350.5, currency: 'uah' },
        serialNumber: ' HB-7 ',
        customFields: { brand: 'D-Link', Ports: 7, Released: '2019-03-10', Working: true }
      },
      { name: 'Cable', purchasePrice: { amount: null, currency: 'UAH' }, customFields: { Working: false } }
    ])
  });
  assert.equal(created.length, 2);
  const [hub, cable] = created;
  assert.equal(hub.name, 'Hub');
  assert.equal(hub.condition, 'Good');
  assert.equal(hub.location, 'Shelf A');
  assert.equal(hub.description, 'Seven-port hub');
  assert.equal(hub.transferred_to, null);
  assert.equal(hub.purchase_date, '2024-05-01');
  assert.deepEqual(hub.purchase_price, { amount: '350.5', currency: 'UAH' });
  assert.equal(hub.serial_number, 'HB-7');
  assert.equal(hub.category_id, category.id);
  assert.equal(hub.parent_item_id, null);
  assert.match(hub.uuid, /^[0-9a-f-]{36}$/);
  assert.notEqual(hub.uuid, cable.uuid);
  assert.equal(cable.purchase_price, null);
  assert.deepEqual(
    itemService.get(hub.id).fields.map(field => [field.name, field.value]),
    [['Brand', 'D-Link'], ['Ports', '7'], ['Released', '2019-03-10'], ['Working', '1']]
  );
  assert.deepEqual(
    itemService.get(cable.id).fields.map(field => [field.name, field.value]),
    [['Brand', null], ['Ports', null], ['Released', null], ['Working', '0']]
  );

  // Every refusal names the problem and leaves the two items above as the only ones.
  const refused = (body, expected) => failure(() => itemService.createBatch(body), 400, expected);
  const inItem = (index, code, params = {}) => ({ code: 'BATCH_ITEM_INVALID', params: { index, reason: { code, params } } });
  const batch = (items, extra = {}) => ({ categoryId: category.id, document: { ...document(items), ...extra } });
  refused(batch([{ name: 'X' }], { category: 'Other' }), { code: 'IMPORT_CATEGORY_MISMATCH', params: { document: 'Other', selected: 'Computer Equipment' } });
  refused({ categoryId: other.id, document: document([{ name: 'X' }]) }, { code: 'IMPORT_CATEGORY_MISMATCH', params: { document: 'Computer Equipment', selected: 'Other' } });
  refused(batch([{ name: 'X' }], { version: 2 }), { code: 'UNSUPPORTED_DOCUMENT_VERSION', params: { version: '2', expected: 1 } });
  refused(batch([{ name: 'X' }], { source: 'excel' }), { code: 'UNSUPPORTED_DOCUMENT_PROPERTY', params: { property: 'source', supported: 'version, category, items' } });
  refused(batch([]), 'IMPORT_NO_ITEMS');
  refused({ categoryId: category.id, document: { version: 1, category: 'Computer Equipment' } }, 'IMPORT_ITEMS_MISSING');
  refused(batch(Array.from({ length: 101 }, (_value, index) => ({ name: `Item ${index}` }))), { code: 'IMPORT_TOO_MANY_ITEMS', params: { max: 100, count: 101 } });
  // Server-owned values cannot be supplied by an import.
  refused(batch([{ name: 'X', uuid: '00000000-0000-4000-8000-000000000000' }]),
    { code: 'IMPORT_ITEM_UNSUPPORTED_PROPERTY', params: {
      index: 1, property: 'uuid',
      supported: 'name, condition, location, description, transferredTo, purchaseDate, serialNumber, purchasePrice, customFields'
    } });
  refused(batch([{ name: 'X', customFields: { Colour: 'Red' } }]), { code: 'IMPORT_UNKNOWN_CUSTOM_FIELD', params: { index: 1, field: 'Colour', known: 'Brand, Ports, Released, Working' } });
  refused(batch([{ name: 'X' }, { name: 'Y', customFields: { Ports: 'many' } }]), inItem(2, 'INVALID_CUSTOM_FIELD_NUMBER', { field: 'Ports' }));
  refused(batch([{ name: 'X', customFields: { Released: '2024-02-30' } }]), inItem(1, 'INVALID_CUSTOM_FIELD_DATE', { field: 'Released' }));
  refused(batch([{ name: 'X', customFields: { Working: 'maybe' } }]), inItem(1, 'INVALID_CUSTOM_FIELD_BOOLEAN', { field: 'Working' }));
  refused(batch([{ name: 'X', purchasePrice: { amount: '-1', currency: 'UAH' } }]), inItem(1, 'INVALID_PURCHASE_PRICE_AMOUNT'));
  refused(batch([{ name: 'X', purchasePrice: { amount: '1', currency: 'ABC' } }]), inItem(1, 'INVALID_PURCHASE_PRICE_CURRENCY'));
  refused(batch([{ name: 'X', serialNumber: 'S'.repeat(256) }]), inItem(1, 'SERIAL_NUMBER_TOO_LONG', { max: 255 }));
  refused(batch([{ name: 'X' }, { name: '  ' }]), inItem(2, 'ITEM_NAME_REQUIRED'));
  failure(() => itemService.createBatch({ categoryId: 999, document: document([{ name: 'X' }]) }), 400, 'CATEGORY_REQUIRED');
  assert.equal(itemService.list().pagination.total, 2);
});

test('a batch import that fails while writing rolls back every item', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const itemRepository = new ItemRepository(db);
  const category = new CategoryService(categoryRepository).create({ name: 'Tools' });
  // The third insert fails after two items have already been written inside the transaction.
  let inserts = 0;
  const insert = itemRepository.insert.bind(itemRepository);
  itemRepository.insert = attributes => {
    if (++inserts === 3) throw new Error('Disk full.');
    return insert(attributes);
  };
  const itemService = new ItemService({
    itemRepository, categoryRepository, customFieldRepository: new CustomFieldRepository(db), itemPhotoRepository: new ItemPhotoRepository(db)
  });

  assert.throws(() => itemService.createBatch({
    categoryId: category.id,
    document: { version: 1, category: 'Tools', items: [{ name: 'Drill' }, { name: 'Saw' }, { name: 'Hammer' }] }
  }), /Disk full/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM items').get().count, 0);
});

test('containment rules reject impossible parents and protect filled containers', () => {
  const { categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Boxes' });
  const box = itemService.create({ name: 'Box', category_id: category.id });
  const inner = itemService.create({ name: 'Inner box', category_id: category.id, parent_item_id: box.id });

  failure(() => itemService.update(box.id, { name: 'Box', category_id: category.id, parent_item_id: box.id }), 400, 'ITEM_CANNOT_CONTAIN_ITSELF');
  failure(() => itemService.update(box.id, { name: 'Box', category_id: category.id, parent_item_id: inner.id }), 400, 'ITEM_PARENT_CYCLE');
  failure(() => itemService.create({ name: 'Lost', category_id: category.id, parent_item_id: 9999 }), 400, 'PARENT_ITEM_NOT_FOUND');
  failure(() => itemService.remove(box.id), 409, { code: 'ITEM_HAS_CHILDREN', params: { count: 1 } });

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

test('core columns sort type-correctly with empty values last in both directions', () => {
  const { categoryService, itemService } = build();
  const tools = categoryService.create({ name: 'tools' });
  const books = categoryService.create({ name: 'Books' });
  const add = (name, category, extra = {}) => itemService.create({ name, category_id: category.id, ...extra });
  add('Cheap', tools, { purchase_price: { amount: '9.5', currency: 'USD' }, purchase_date: '2024-02-01', serial_number: 'b-2' });
  add('Dear', books, { purchase_price: { amount: '100', currency: 'EUR' }, purchase_date: '2023-12-31', serial_number: 'A-1' });
  add('Unpriced', tools, { condition: 'good' });
  const names = query => itemService.list(query).items.map(item => item.name);

  // Prices compare as numbers (9.5 < 100), not as text ("100" < "9.5").
  assert.deepEqual(names({ sort: 'purchasePrice' }), ['Cheap', 'Dear', 'Unpriced']);
  assert.deepEqual(names({ sort: 'purchasePrice', direction: 'desc' }), ['Dear', 'Cheap', 'Unpriced']);
  assert.deepEqual(names({ sort: 'purchaseDate' }), ['Dear', 'Cheap', 'Unpriced']);
  assert.deepEqual(names({ sort: 'serialNumber' }), ['Dear', 'Cheap', 'Unpriced']);
  assert.deepEqual(names({ sort: 'condition', direction: 'desc' }), ['Unpriced', 'Cheap', 'Dear']);
  assert.deepEqual(names({ sort: 'category' }), ['Dear', 'Cheap', 'Unpriced']);
  // An unknown or hostile sort key is never SQL: it falls back to the name order.
  assert.deepEqual(names({ sort: 'name; DROP TABLE items', direction: 'sideways' }), ['Cheap', 'Dear', 'Unpriced']);
  assert.deepEqual(names({ sort: 'custom:text:missing' }), ['Cheap', 'Dear', 'Unpriced']);
  assert.equal(itemService.list().pagination.total, 3);
});

test('same-name custom fields merge into one column that is searched, sorted, and loaded on request', () => {
  const { categoryService, customFieldService, itemService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const audio = categoryService.create({ name: 'Audio' });
  const cameraBrand = customFieldService.create(cameras.id, { name: 'Brand', type: 'text' });
  const audioBrand = customFieldService.create(audio.id, { name: 'brand', type: 'text' });
  const cameraYear = customFieldService.create(cameras.id, { name: 'Year', type: 'number' });
  const audioYear = customFieldService.create(audio.id, { name: 'Year', type: 'text' });
  const bought = customFieldService.create(cameras.id, { name: 'Bought', type: 'date' });
  const add = (name, category, values) => itemService.create({ name, category_id: category.id, field_values: values });
  add('Leica', cameras, { [cameraBrand.id]: 'Leica', [cameraYear.id]: '9', [bought.id]: '2020-05-01' });
  add('Nikon', cameras, { [cameraBrand.id]: 'nikon', [cameraYear.id]: '10', [bought.id]: '2019-01-01' });
  add('Amp', audio, { [audioBrand.id]: 'Marantz', [audioYear.id]: 'vintage' });
  add('Bare', cameras, {});

  const custom = itemService.columns().fields.filter(column => !column.core);
  // Compatible fields share one column; the same name with another type stays a separate column.
  assert.deepEqual(custom.map(column => [column.key, column.label, column.type, column.fieldIds]), [
    ['custom:date:bought', 'Bought', 'date', [bought.id]],
    ['custom:text:brand', 'Brand', 'text', [cameraBrand.id, audioBrand.id]],
    ['custom:number:year', 'Year', 'number', [cameraYear.id]],
    ['custom:text:year', 'Year', 'text', [audioYear.id]]
  ]);
  assert.ok(itemService.columns().fields.some(column => column.core && column.key === 'name' && column.required));

  const names = query => itemService.list(query).items.map(item => item.name);
  assert.deepEqual(names({ sort: 'custom:text:brand' }), ['Leica', 'Amp', 'Nikon', 'Bare']);
  assert.deepEqual(names({ sort: 'custom:text:brand', direction: 'desc' }), ['Nikon', 'Amp', 'Leica', 'Bare']);
  // Numbers compare numerically and dates chronologically; items without a value stay last.
  assert.deepEqual(names({ sort: 'custom:number:year' }), ['Leica', 'Nikon', 'Amp', 'Bare']);
  assert.deepEqual(names({ sort: 'custom:number:year', direction: 'desc' }), ['Nikon', 'Leica', 'Amp', 'Bare']);
  assert.deepEqual(names({ sort: 'custom:date:bought' }), ['Nikon', 'Leica', 'Amp', 'Bare']);

  // Only the requested columns carry values, keyed by the column, never every field of the item.
  const listed = itemService.list({ sort: 'name', fields: 'custom:text:brand,custom:unknown:x,name' }).items;
  assert.deepEqual(listed.map(item => item.custom_values), [
    { 'custom:text:brand': 'Marantz' }, {}, { 'custom:text:brand': 'Leica' }, { 'custom:text:brand': 'nikon' }
  ]);
  assert.deepEqual(itemService.list({ sort: 'name' }).items[0].custom_values, {});

  // Search reaches text custom values whether or not their column is shown, and combines with the
  // category filter, the sort, and the pagination.
  assert.deepEqual(names({ search: 'maran' }), ['Amp']);
  assert.deepEqual(names({ search: '2020' }), []);
  assert.deepEqual(names({ search: 'i', categoryId: String(cameras.id), sort: 'custom:text:brand', direction: 'desc' }), ['Nikon', 'Leica']);
  const page = itemService.list({ search: 'i', sort: 'custom:text:brand', pageSize: '1', page: '2' });
  assert.deepEqual([page.items.map(item => item.name), page.pagination.total], [['Amp'], 3]);
});

test('Transferred To is optional free text that never touches the location', () => {
  const { categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Tools' });
  const base = { category_id: category.id, location: 'Garage' };

  const kept = itemService.create({ name: 'Drill', ...base });
  assert.equal(kept.transferred_to, null);
  const lent = itemService.create({ name: 'Saw', ...base, transferred_to: '  Vasyl  ' });
  assert.equal(lent.transferred_to, 'Vasyl');
  assert.equal(lent.location, 'Garage');

  // Null to a value, one value to another, and back to null, while the location stays as saved.
  const save = (item, transferredTo) => itemService.update(item.id, { name: item.name, ...base, transferred_to: transferredTo });
  assert.equal(save(kept, 'Father').transferred_to, 'Father');
  assert.equal(save(kept, 'Sold via OLX').transferred_to, 'Sold via OLX');
  const cleared = save(kept, '   ');
  assert.equal(cleared.transferred_to, null);
  assert.equal(cleared.location, 'Garage');
  assert.equal(save(kept, '').transferred_to, null);

  failure(() => itemService.create({ name: 'Too long', ...base, transferred_to: 'x'.repeat(256) }), 400,
    { code: 'TRANSFERRED_TO_TOO_LONG', params: { max: 255 } });
  failure(() => itemService.create({ name: 'Not text', ...base, transferred_to: 42 }), 400, 'INVALID_TRANSFERRED_TO');

  // The normal item search finds everything handed to the same person.
  itemService.create({ name: 'Ladder', ...base, transferred_to: 'vasyl ' });
  assert.deepEqual(itemService.list({ search: 'Vasyl' }).items.map(item => item.name), ['Ladder', 'Saw']);
  assert.equal(itemService.list({ search: 'Vasyl' }).items[0].transferred_to, 'vasyl');
});

test('Transferred To suggestions are distinct saved values, most used first', () => {
  const { categoryService, itemService } = build();
  const category = categoryService.create({ name: 'Books' });
  for (const [index, value] of ['Vasyl', ' vasyl', 'VASYL ', 'Father', 'Workshop', '', null].entries()) {
    itemService.create({ name: `Book ${index}`, category_id: category.id, transferred_to: value });
  }

  // Case and surrounding whitespace do not create duplicates, and empty values are never offered.
  const all = itemService.transferredToSuggestions();
  assert.deepEqual(all.map(suggestion => suggestion.usage_count), [3, 1, 1]);
  assert.equal(all[0].value.toLowerCase(), 'vasyl');
  assert.deepEqual(all.slice(1).map(suggestion => suggestion.value), ['Father', 'Workshop']);
  assert.deepEqual(itemService.transferredToSuggestions({ search: ' wo ' }).map(suggestion => suggestion.value), ['Workshop']);
  assert.deepEqual(itemService.transferredToSuggestions({ search: '%' }), []);
  assert.equal(itemService.transferredToSuggestions({ limit: '1' }).length, 1);
});

test('categories and their fields guard their own deletions', () => {
  const { categoryService, customFieldService, itemService } = build();
  const category = categoryService.create({ name: 'Instruments' });
  const brand = customFieldService.create(category.id, { name: 'Brand', type: 'text' });
  const item = itemService.create({ name: 'Guitar', category_id: category.id, field_values: { [brand.id]: 'Fender' } });

  failure(() => categoryService.remove(category.id), 409, { code: 'CATEGORY_IN_USE', params: { count: 1 } });
  failure(() => customFieldService.create(category.id, { name: 'Broken', type: 'colour' }), 400, { code: 'UNSUPPORTED_FIELD_TYPE', params: { type: 'colour' } });
  failure(() => customFieldService.remove(brand.id, false), 409, { code: 'FIELD_HAS_VALUES', params: { count: 1 } });
  assert.deepEqual(customFieldService.suggestions(brand.id, { search: 'fen' }), [{ value: 'Fender', usage_count: 1 }]);

  customFieldService.remove(brand.id, true);
  assert.deepEqual(customFieldService.listForCategory(category.id), []);
  itemService.remove(item.id);
  categoryService.remove(category.id);
  failure(() => categoryService.requireCategory(category.id), 404, 'CATEGORY_NOT_FOUND');
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

  failure(() => dashboardService.overview({ categoryId: 'all' }), 400, 'INVALID_CATEGORY_ID');
  failure(() => dashboardService.overview({ categoryId: '999' }), 404, 'CATEGORY_NOT_FOUND');
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
  settingsPath: path.join(process.env.DATA_DIR, `ai-settings-${Math.random().toString(36).slice(2)}.json`)
});

const savable = changes => ({ enabled: false, provider: 'openai', model: 'gpt-5.6-luna', ...changes });

test('AI features stay off until a key is saved with them', () => {
  const service = aiSettings();

  // A fresh installation has no settings file, so nothing offers AI before it is configured.
  assert.deepEqual(service.publicSettings(), {
    enabled: false, provider: 'openai', displayName: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna',
    imageInput: 'auto', hasApiKey: false, apiKeyMasked: ''
  });

  // Asking for AI without a key is stored as off, so the saved state never promises what cannot run.
  assert.equal(service.write(savable({ enabled: true })).enabled, false);
  assert.equal(service.read().enabled, false);
  assert.throws(() => service.requireUsableSettings(), { status: 409, code: 'AI_API_KEY_MISSING' });

  // The key and the switch may arrive in the same save.
  const configured = service.write(savable({ enabled: true, apiKey: 'sk-services-test-key' }));
  assert.equal(configured.enabled, true);
  assert.equal(configured.hasApiKey, true);
  assert.equal(service.requireUsableSettings().apiKey, 'sk-services-test-key');

  // Turning AI off keeps the key, so re-enabling needs no new one.
  assert.equal(service.write(savable({ enabled: false })).hasApiKey, true);
  assert.throws(() => service.requireUsableSettings(), { status: 409, code: 'AI_DISABLED' });
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

test('label data is returned in selection order with the effective location and reports missing items', () => {
  const { categoryService, itemService } = build();
  const boxes = categoryService.create({ name: 'Boxes' });
  const cables = categoryService.create({ name: 'Cables' });
  const crate = itemService.create({ name: 'Crate', category_id: boxes.id, description: 'Blue lid', location: 'Garage' });
  const cable = itemService.create({ name: 'USB cable', category_id: cables.id, location: 'Desk', parent_item_id: crate.id });
  const loose = itemService.create({ name: 'Loose cable', category_id: cables.id });
  const deleted = itemService.create({ name: 'Gone', category_id: cables.id });
  itemService.remove(deleted.id);

  const result = itemService.labels({ uuids: [cable.uuid, ` ${crate.uuid.toUpperCase()} `, deleted.uuid, loose.uuid, cable.uuid] });
  assert.deepEqual(result, {
    items: [
      { uuid: cable.uuid, name: 'USB cable', description: null, category_name: 'Cables', effective_location: 'Garage' },
      { uuid: crate.uuid, name: 'Crate', description: 'Blue lid', category_name: 'Boxes', effective_location: 'Garage' },
      { uuid: loose.uuid, name: 'Loose cable', description: null, category_name: 'Cables', effective_location: null }
    ],
    missing: [deleted.uuid]
  });

  failure(() => itemService.labels({}), 400, 'LABELS_NO_ITEMS');
  failure(() => itemService.labels({ uuids: [] }), 400, 'LABELS_NO_ITEMS');
  failure(() => itemService.labels({ uuids: [crate.id] }), 400, 'LABELS_INVALID_UUIDS');
  const tooMany = Array.from({ length: 501 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  failure(() => itemService.labels({ uuids: tooMany }), 400, { code: 'LABELS_TOO_MANY', params: { max: 500, count: 501 } });
});
