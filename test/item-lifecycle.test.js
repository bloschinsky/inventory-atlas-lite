import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer, stopServer } from './serverProcess.js';

// The item lifecycle (Active / Retired) at the schema, service, and HTTP level, never against data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-lifecycle-test-'));

const { applySchema, CURRENT_SCHEMA, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { ChecklistRepository } = await import('../server/src/repositories/checklistRepository.js');
const { ChecklistRunRepository } = await import('../server/src/repositories/checklistRunRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { DashboardRepository } = await import('../server/src/repositories/dashboardRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { ChecklistRunService } = await import('../server/src/services/checklistRunService.js');
const { ChecklistService } = await import('../server/src/services/checklistService.js');
const { DashboardService } = await import('../server/src/services/dashboardService.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { ItemLifecycleService } = await import('../server/src/services/itemLifecycleService.js');
const { ItemService } = await import('../server/src/services/itemService.js');

const build = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const checklistRepository = new ChecklistRepository(db);
  const checklistRunRepository = new ChecklistRunRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  const category = categoryService.create({ name: 'Gear' });
  const itemHistoryService = new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) });
  const itemService = new ItemService({
    itemRepository, customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository, itemHistoryService
  });
  const lifecycle = new ItemLifecycleService({ itemRepository, itemService, itemHistoryService });
  return {
    db,
    category,
    categoryService,
    itemService,
    lifecycle,
    checklists: new ChecklistService({ checklistRepository, checklistRunRepository, itemRepository }),
    runs: new ChecklistRunService({ checklistRepository, checklistRunRepository, itemRepository }),
    dashboard: new DashboardService({ dashboardRepository: new DashboardRepository(db), categoryRepository }),
    add: (name, parent = null, attributes = {}) => itemService.create({ name, category_id: category.id, parent_item_id: parent?.id ?? null, ...attributes }),
    retire: (item, body = {}) => lifecycle.change(item.id, { status: 'retired', reason: 'sold', ...body }),
    restore: (item, body = {}) => lifecycle.change(item.id, { status: 'active', ...body }),
    row: item => db.prepare('SELECT * FROM items WHERE id = ?').get(item.id),
    names: query => itemService.list({ pageSize: 100, ...query }).items.map(item => item.name).sort()
  };
};

const failure = (work, status, code, params) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  if (params) assert.deepEqual(error.params, params);
  return true;
});

// A version 5 database without any lifecycle column, as an older installation or backup has it.
const legacyDatabase = (db = new Database(':memory:')) => {
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT, description TEXT, condition TEXT, location TEXT,
      parent_item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE custom_fields (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE, type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(category_id, name));
    CREATE TABLE item_field_values (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE, value TEXT, UNIQUE(item_id, field_id));
    CREATE TABLE item_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO categories (name) VALUES ('Cameras');
    INSERT INTO items (uuid, name, category_id, location, parent_item_id) VALUES
      ('11111111-1111-4111-8111-111111111111', 'Bag', 1, 'Closet', NULL),
      ('22222222-2222-4222-8222-222222222222', 'Zenit E', 1, NULL, 1);
  `);
  db.pragma('user_version = 5');
  return db;
};

test('the schema stores the lifecycle with constraints, and every new item is active', () => {
  const { db, add, itemService } = build();
  assert.equal(SCHEMA_VERSION, 10);
  for (const column of ['lifecycle_status', 'retired_at', 'retired_reason', 'retired_location_snapshot', 'retired_parent_name_snapshot']) {
    assert.ok(CURRENT_SCHEMA.items.includes(column), column);
  }
  assert.ok(CURRENT_SCHEMA.checklist_runs.includes('skipped_retired_count'));
  const camera = add('Camera');
  assert.equal(camera.lifecycle_status, 'active');
  assert.equal(camera.retirement, null);
  assert.equal(itemService.get(camera.id).lifecycle_status, 'active');
  assert.throws(() => db.prepare("UPDATE items SET lifecycle_status = 'archived' WHERE id = ?").run(camera.id), /CHECK/);
  assert.throws(() => db.prepare("UPDATE items SET retired_reason = 'borrowed' WHERE id = ?").run(camera.id), /CHECK/);
});

test('an older database migrates every item to active, idempotently, and an old backup restores cleanly', async () => {
  const db = legacyDatabase();
  applySchema(db);
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION);
  assert.deepEqual(db.prepare('SELECT DISTINCT lifecycle_status, retired_at, retired_reason FROM items').all(),
    [{ lifecycle_status: 'active', retired_at: null, retired_reason: null }]);
  // The migrated inventory works with the lifecycle at once.
  const { lifecycle, itemService } = build(db);
  const result = lifecycle.change(2, { status: 'retired', reason: 'gifted' });
  assert.equal(result.item.retirement.last_location, 'Closet');
  assert.equal(itemService.list().pagination.total, 1);

  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-lifecycle-restore-')), 'backup.sqlite');
  legacyDatabase(new Database(file)).close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.migratedFrom, 5);
  assert.equal(summary.schemaVersion, SCHEMA_VERSION);
  const migrated = new Database(file, { readonly: true });
  try {
    assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM items WHERE lifecycle_status = 'active'").get().count, 2);
  } finally { migrated.close(); }
});

test('retiring a leaf keeps its data, snapshots where it was, and detaches it from its container', () => {
  const { add, retire, row, itemService } = build();
  const shelf = add('Shelf', null, { location: 'Garage' });
  const box = add('Box', shelf, { location: 'Ignored' });
  const lens = add('Lens', box, { location: 'Own saved place', is_new: true, condition_grade: 'good', serial_number: 'SN-1' });
  const before = row(lens);

  const result = retire(lens, { reason: 'sold', recipient: 'Olena', note: 'Paid in cash', retired_at: '2026-01-02T10:00:00Z' });
  assert.equal(result.affected_count, 1);
  assert.equal(result.item.lifecycle_status, 'retired');
  assert.deepEqual(result.item.retirement, {
    reason: 'sold', retired_at: '2026-01-02T10:00:00.000Z', recipient: 'Olena', note: 'Paid in cash',
    last_location: 'Garage', former_parent: { uuid: box.uuid, name: 'Box' }
  });
  const after = row(lens);
  assert.equal(after.parent_item_id, null);
  // Nothing but the lifecycle changes: the saved location, New, Condition, the serial and the UUID stay.
  for (const column of ['uuid', 'location', 'is_new', 'condition_grade', 'serial_number', 'name']) assert.equal(after[column], before[column], column);
  // A retired item still opens directly, by id and by UUID (QR).
  assert.equal(itemService.get(lens.uuid).lifecycle_status, 'retired');
  assert.equal(itemService.get(box.id).children.length, 0);
});

test('a retired item keeps its snapshot when its former container moves later', () => {
  const { add, retire, itemService } = build();
  const garage = add('Shelf', null, { location: 'Garage' });
  const attic = add('Attic rack', null, { location: 'Attic' });
  const box = add('Box', garage);
  const lens = add('Lens', box);
  retire(lens);
  itemService.bulkMove({ item_ids: [box.id], parent_item_id: attic.id });
  itemService.update(box.id, { name: 'Renamed box', category_id: box.category_id, parent_item_id: attic.id });
  const retirement = itemService.get(lens.id).retirement;
  assert.equal(retirement.last_location, 'Garage');
  assert.equal(retirement.former_parent.name, 'Box');
});

test('a container with contents needs an explicit choice, then retires its whole subtree atomically', () => {
  const { add, retire, row, itemService, lifecycle } = build();
  const shelf = add('Shelf', null, { location: 'Garage' });
  const bag = add('Bag', shelf);
  const pouch = add('Pouch', bag);
  const cable = add('Cable', pouch);
  const flash = add('Flash', bag);

  failure(() => retire(bag), 409, 'ITEM_RETIRE_HAS_CONTENTS', { count: 3 });
  assert.equal(row(bag).lifecycle_status, 'active');

  const result = retire(bag, { include_contents: true, reason: 'stolen' });
  assert.equal(result.affected_count, 4);
  for (const item of [bag, pouch, cable, flash]) {
    const stored = row(item);
    assert.equal(stored.lifecycle_status, 'retired', item.name);
    assert.equal(stored.retired_reason, 'stolen');
    assert.equal(stored.retired_location_snapshot, 'Garage');
  }
  // Only the subtree root leaves the active shelf; the nesting inside the subtree stays.
  assert.equal(row(bag).parent_item_id, null);
  assert.equal(row(pouch).parent_item_id, bag.id);
  assert.equal(row(cable).parent_item_id, pouch.id);
  assert.equal(itemService.get(shelf.id).children.length, 0);
  // Retiring a nested retired item again is refused, like any repeated transition.
  failure(() => retire(cable), 409, 'ITEM_ALREADY_RETIRED');
  failure(() => lifecycle.change(shelf.id, { status: 'active' }), 409, 'ITEM_NOT_RETIRED');
});

test('a failure while retiring a subtree leaves every item as it was', () => {
  const { db, add, retire, row } = build();
  const bag = add('Bag');
  const pouch = add('Pouch', bag);
  db.exec(`CREATE TRIGGER fail_retire BEFORE UPDATE OF lifecycle_status ON items WHEN NEW.id = ${pouch.id}
    BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);
  assert.throws(() => retire(bag, { include_contents: true }), /simulated failure/);
  assert.equal(row(bag).lifecycle_status, 'active');
  assert.equal(row(pouch).lifecycle_status, 'active');
});

test('invalid transitions and inputs are refused with structured errors', () => {
  const { add, lifecycle, retire } = build();
  const camera = add('Camera');
  failure(() => lifecycle.change(camera.id, null), 400, 'INVALID_REQUEST');
  failure(() => lifecycle.change(camera.id, { status: 'archived' }), 400, 'ITEM_LIFECYCLE_STATUS_INVALID');
  failure(() => lifecycle.change(camera.id, { status: 'retired' }), 400, 'ITEM_RETIREMENT_REASON_REQUIRED');
  failure(() => retire(camera, { reason: 'borrowed' }), 400, 'ITEM_RETIREMENT_REASON_INVALID');
  failure(() => retire(camera, { retired_at: 'yesterday' }), 400, 'ITEM_RETIRED_AT_INVALID');
  failure(() => retire(camera, { retired_at: '2999-01-01T00:00:00Z' }), 400, 'ITEM_RETIRED_AT_INVALID');
  failure(() => retire(camera, { recipient: 'x'.repeat(256) }), 400, 'ITEM_RETIREMENT_RECIPIENT_TOO_LONG', { max: 255 });
  failure(() => retire(camera, { note: 'x'.repeat(2001) }), 400, 'ITEM_RETIREMENT_NOTE_TOO_LONG', { max: 2000 });
  failure(() => retire(camera, { include_contents: 'yes' }), 400, 'INVALID_REQUEST');
  failure(() => lifecycle.change(999, { status: 'retired', reason: 'lost' }), 404, 'ITEM_NOT_FOUND');
  assert.equal(add('Other').lifecycle_status, 'active');
  // Every reason is accepted; the date defaults to now.
  for (const reason of ['sold', 'gifted', 'lost', 'stolen', 'disposed', 'consumed', 'other']) {
    const item = add(`Item ${reason}`);
    const { item: retired } = retire(item, { reason });
    assert.equal(retired.retirement.reason, reason);
    assert.ok(Math.abs(Date.parse(retired.retirement.retired_at) - Date.now()) < 60000);
  }
});

test('restoring a retired subtree keeps its nesting and never reattaches it to the old container', () => {
  const { add, retire, restore, row, itemService } = build();
  const shelf = add('Shelf', null, { location: 'Garage' });
  const bag = add('Bag', shelf, { location: 'Saved bag place', condition_grade: 'fair' });
  const pouch = add('Pouch', bag);
  retire(bag, { include_contents: true });

  const result = restore(bag);
  assert.equal(result.affected_count, 2);
  assert.equal(result.item.lifecycle_status, 'active');
  assert.equal(result.item.retirement, null);
  assert.equal(row(bag).parent_item_id, null);
  assert.equal(row(bag).location, 'Saved bag place');
  assert.equal(row(bag).condition_grade, 'fair');
  assert.equal(row(pouch).parent_item_id, bag.id);
  assert.equal(row(pouch).lifecycle_status, 'active');
  assert.equal(row(pouch).retired_reason, null);
  assert.equal(itemService.get(shelf.id).children.length, 0);
});

test('restoring a formerly nested item takes it out of its retired container, into a chosen place', () => {
  const { add, retire, restore, row, lifecycle } = build();
  const rack = add('Rack', null, { location: 'Basement' });
  const bag = add('Bag');
  const pouch = add('Pouch', bag);
  const cable = add('Cable', pouch);
  const retiredBox = add('Old box');
  retire(bag, { include_contents: true });
  retire(retiredBox);

  // An active item never goes into a retired container.
  failure(() => restore(pouch, { parent_item_id: retiredBox.id }), 400, 'ITEM_PARENT_LIFECYCLE_MISMATCH');
  failure(() => restore(pouch, { parent_item_id: 999 }), 400, 'PARENT_ITEM_NOT_FOUND');
  assert.equal(row(pouch).lifecycle_status, 'retired');

  const result = restore(pouch, { parent_item_id: rack.id });
  assert.equal(result.affected_count, 2);
  assert.equal(row(pouch).parent_item_id, rack.id);
  assert.equal(row(cable).parent_item_id, pouch.id);
  assert.equal(row(cable).lifecycle_status, 'active');
  assert.equal(row(bag).lifecycle_status, 'retired');
  assert.equal(result.item.effective_location, 'Basement');

  // A top-level restore may set a new saved location; leaving it out keeps the saved one.
  lifecycle.change(retiredBox.id, { status: 'active', location: '  Hall  ' });
  assert.equal(row(retiredBox).location, 'Hall');
  failure(() => restore(retiredBox), 409, 'ITEM_NOT_RETIRED');
});

test('active and retired items never mix in one container', () => {
  const { add, retire, itemService } = build();
  const box = add('Box');
  const oldBox = add('Old box');
  const oldLens = add('Old lens');
  retire(oldBox);
  retire(oldLens);
  failure(() => add('Camera', oldBox), 400, 'ITEM_PARENT_LIFECYCLE_MISMATCH');
  failure(() => itemService.update(box.id, { name: 'Box', category_id: box.category_id, parent_item_id: oldBox.id }), 400, 'ITEM_PARENT_LIFECYCLE_MISMATCH');
  failure(() => itemService.update(oldLens.id, { name: 'Old lens', category_id: box.category_id, parent_item_id: box.id }), 400, 'ITEM_PARENT_LIFECYCLE_MISMATCH');
  // A retired item may be kept inside another retired container.
  itemService.update(oldLens.id, { name: 'Old lens', category_id: box.category_id, parent_item_id: oldBox.id });
  assert.equal(itemService.get(oldLens.id).parent.id, oldBox.id);

  failure(() => itemService.bulkMove({ item_ids: [oldLens.id, add('Flash').id], parent_item_id: box.id }), 409, 'BULK_MOVE_RETIRED_ITEMS', { count: 1 });
  failure(() => itemService.bulkMove({ item_ids: [add('Strap').id], parent_item_id: oldBox.id }), 400, 'ITEM_PARENT_LIFECYCLE_MISMATCH');

  const candidates = query => itemService.parentCandidates(query).map(item => item.name).sort();
  assert.deepEqual(candidates({}), ['Box', 'Flash', 'Strap']);
  assert.deepEqual(candidates({ lifecycle: 'retired', excludeId: String(oldLens.id) }), ['Old box']);
  assert.deepEqual(itemService.bulkMovePreview({ item_ids: [box.id] }).candidates.map(item => item.name).sort(), ['Flash', 'Strap']);
});

test('the list filters by lifecycle on the server, before pagination, with search and sorting', () => {
  const { add, retire, itemService, names } = build();
  for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) add(name);
  retire(add('Echo'));
  retire(add('Foxtrot', null, { description: 'searchable' }));
  assert.deepEqual(names({}), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
  assert.deepEqual(names({ lifecycle: 'active' }), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
  assert.deepEqual(names({ lifecycle: 'retired' }), ['Echo', 'Foxtrot']);
  assert.equal(names({ lifecycle: 'all' }).length, 6);
  assert.deepEqual(names({ lifecycle: 'retired', search: 'searchable' }), ['Foxtrot']);
  assert.deepEqual(names({ lifecycle: 'active', search: 'searchable' }), []);

  const page = itemService.list({ lifecycle: 'all', pageSize: 4, page: 2, sort: 'name' });
  assert.deepEqual(page.items.map(item => item.name), ['Echo', 'Foxtrot']);
  assert.deepEqual(page.pagination, { page: 2, pageSize: 4, total: 6, pages: 2 });
  assert.equal(itemService.list({ lifecycle: 'retired', pageSize: 1 }).pagination.total, 2);
  const listed = itemService.list({ lifecycle: 'retired', sort: 'name' }).items[0];
  assert.equal(listed.lifecycle_status, 'retired');
  assert.equal(listed.retirement.reason, 'sold');
  failure(() => itemService.list({ lifecycle: 'archived' }), 400, 'ITEM_LIFECYCLE_FILTER_INVALID');
});

test('the hierarchy shows active items by default and stays a valid forest in every view', () => {
  const { add, retire, itemService } = build();
  const shelf = add('Shelf', null, { location: 'Garage' });
  add('Lens', shelf);
  const bag = add('Bag', shelf);
  add('Pouch', bag);
  retire(bag, { include_contents: true });
  const view = lifecycle => itemService.hierarchy({ lifecycle }).items;
  const valid = nodes => {
    const ids = new Set(nodes.map(node => node.id));
    assert.equal(ids.size, nodes.length);
    for (const node of nodes) assert.ok(node.parent_id === null || ids.has(node.parent_id), `${node.name} keeps its parent`);
  };
  for (const lifecycle of [undefined, 'active', 'retired', 'all']) valid(view(lifecycle));
  assert.deepEqual(view().map(node => node.name), ['Lens', 'Shelf']);
  assert.deepEqual(view('retired').map(node => [node.name, node.lifecycle_status]), [['Bag', 'retired'], ['Pouch', 'retired']]);
  assert.equal(view('all').length, 4);
  failure(() => itemService.hierarchy({ lifecycle: 'gone' }), 400, 'ITEM_LIFECYCLE_FILTER_INVALID');
});

test('the dashboard describes the active inventory and reports retired items separately', () => {
  const { add, retire, dashboard, category, categoryService } = build();
  const other = categoryService.create({ name: 'Books' });
  add('Camera', null, { location: 'Desk' });
  add('Lens', null, { location: 'Desk' });
  retire(add('Old phone', null, { location: 'Drawer' }));
  retire(add('Old charger'));
  add('Novel', null, { category_id: other.id });
  const overview = dashboard.overview();
  assert.equal(overview.totalItems, 3);
  assert.equal(overview.retiredItems, 2);
  assert.equal(overview.addedLast30Days, 3);
  assert.equal(overview.recentActivity.reduce((sum, day) => sum + day.count, 0), 3);
  assert.deepEqual(overview.locationDistribution.map(entry => [entry.label, entry.count]), [['Desk', 2], ['Unknown', 1]]);
  assert.equal(overview.categoryDistribution.find(entry => entry.categoryId === category.id).count, 2);
  const scoped = dashboard.overview({ categoryId: String(other.id) });
  assert.deepEqual([scoped.totalItems, scoped.retiredItems], [1, 0]);
});

test('checklists keep retired entries marked, and new runs and audits leave them out', () => {
  const { add, retire, restore, checklists, runs } = build();
  const bag = add('Bag');
  const camera = add('Camera', bag);
  const lens = add('Lens', bag);
  const tripod = add('Tripod');
  const checklist = checklists.create({ name: 'Trip', mode: 'packing', items: [camera, lens, tripod].map(item => ({ item_id: item.id })) });
  const before = runs.start(checklist.id);
  assert.equal(before.items.length, 3);
  assert.equal(before.skipped_retired_count, 0);
  runs.complete(before.id);

  retire(tripod, { reason: 'lost' });
  assert.deepEqual(checklists.get(checklist.id).items.map(entry => [entry.name, entry.retired]),
    [['Camera', false], ['Lens', false], ['Tripod', true]]);
  const after = runs.start(checklist.id);
  assert.deepEqual(after.items.map(item => item.name), ['Camera', 'Lens']);
  assert.equal(after.skipped_retired_count, 1);
  // The completed run keeps its history, with the retired item marked.
  const history = runs.get(before.id);
  assert.equal(history.items.length, 3);
  assert.deepEqual(history.items.map(item => item.retired), [false, false, true]);
  assert.equal(runs.list().find(run => run.id === after.id).skipped_retired_count, 1);

  // A container audit covers active contents only; a retired container has nothing to audit.
  assert.equal(runs.startAudit(bag.id, { scope: 'nested' }).items.length, 2);
  retire(bag, { include_contents: true });
  failure(() => runs.startAudit(bag.id, {}), 409, 'CHECKLIST_AUDIT_NO_CONTENTS');
  restore(tripod);
  retire(add('Spare'));
  failure(() => runs.start(checklists.create({ name: 'Gone', mode: 'packing', items: [{ item_id: camera.id }] }).id), 409, 'CHECKLIST_HAS_NO_ITEMS');
});

test('labels and deletion still work for retired items, and deleting stays a separate action', () => {
  const { add, retire, itemService, row } = build();
  const lens = add('Lens', null, { location: 'Desk' });
  retire(lens);
  assert.deepEqual(itemService.labels({ uuids: [lens.uuid] }).items.map(item => item.name), ['Lens']);
  assert.ok(row(lens));
  itemService.remove(lens.id);
  assert.equal(row(lens), undefined);
});

test('the HTTP API retires, filters, opens, and restores an item', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-lifecycle-http-'));
  const { child, base } = await startServer(dataDir);
  const call = async (url, method = 'GET', body) => {
    const response = await fetch(`${base}${url}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const category = (await call('/api/categories', 'POST', { name: 'Gear' })).body;
    const box = (await call('/api/items', 'POST', { name: 'Box', category_id: category.id, location: 'Garage' })).body;
    const lens = (await call('/api/items', 'POST', { name: 'Lens', category_id: category.id, parent_item_id: box.id })).body;

    const refused = await call(`/api/items/${box.id}/lifecycle`, 'PATCH', { status: 'retired', reason: 'sold' });
    assert.deepEqual(refused, { status: 409, body: { error: { code: 'ITEM_RETIRE_HAS_CONTENTS', params: { count: 1 } } } });
    const retired = await call(`/api/items/${lens.id}/lifecycle`, 'PATCH', { status: 'retired', reason: 'gifted', recipient: 'Anna' });
    assert.equal(retired.status, 200);
    assert.equal(retired.body.affected_count, 1);
    assert.equal(retired.body.item.retirement.recipient, 'Anna');
    assert.equal(retired.body.item.retirement.last_location, 'Garage');

    assert.deepEqual((await call('/api/items')).body.items.map(item => item.name), ['Box']);
    assert.deepEqual((await call('/api/items?lifecycle=retired')).body.items.map(item => item.name), ['Lens']);
    assert.equal((await call('/api/items?lifecycle=all')).body.pagination.total, 2);
    assert.equal((await call('/api/items?lifecycle=bogus')).body.error.code, 'ITEM_LIFECYCLE_FILTER_INVALID');
    assert.deepEqual((await call('/api/items/hierarchy?lifecycle=retired')).body.items.map(item => item.name), ['Lens']);
    // Direct links and QR lookups by UUID keep opening the retired item.
    assert.equal((await call(`/api/items/${lens.uuid}`)).body.lifecycle_status, 'retired');
    assert.deepEqual((await call('/api/dashboard')).body.retiredItems, 1);

    const again = await call(`/api/items/${lens.id}/lifecycle`, 'PATCH', { status: 'retired', reason: 'gifted' });
    assert.equal(again.body.error.code, 'ITEM_ALREADY_RETIRED');
    const restored = await call(`/api/items/${lens.id}/lifecycle`, 'PATCH', { status: 'active', parent_item_id: box.id });
    assert.equal(restored.body.item.lifecycle_status, 'active');
    assert.equal(restored.body.item.parent.id, box.id);
    assert.equal((await call(`/api/items/${lens.id}/lifecycle`, 'PATCH', { status: 'gone' })).body.error.code, 'ITEM_LIFECYCLE_STATUS_INVALID');
  } finally {
    await stopServer(child);
  }
});
