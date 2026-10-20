import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer, stopServer } from './serverProcess.js';

// The optional Specific location of items: schema and migration, validation, inheritance from the
// outermost container, the list, history, lifecycle, templates, batch import, and the HTTP contract.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-location-detail-test-'));

const { applySchema, CURRENT_SCHEMA, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemTemplateRepository } = await import('../server/src/repositories/itemTemplateRepository.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemLifecycleService } = await import('../server/src/services/itemLifecycleService.js');
const { ItemTemplateService } = await import('../server/src/services/itemTemplateService.js');
const { buildItemColumns } = await import('../server/src/services/itemColumns.js');
const { parseItemImportDocument, reviewItemDraft } = await import('../shared/itemImport.js');

const build = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemHistoryService = new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) });
  const itemService = new ItemService({
    itemRepository, customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository, itemHistoryService
  });
  const category = new CategoryService(categoryRepository).create({ name: 'Gear' });
  return {
    db,
    category,
    itemService,
    lifecycle: new ItemLifecycleService({ itemRepository, itemService, itemHistoryService }),
    templates: new ItemTemplateService({ itemTemplateRepository: new ItemTemplateRepository(db), categoryRepository, customFieldRepository }),
    create: body => itemService.create({ category_id: category.id, ...body }),
    // An update sends the item back as the form does, with only the given changes.
    update: (item, changes) => {
      const current = itemService.get(item.id);
      return itemService.update(item.id, { ...current, parent_item_id: current.parent_item_id, ...changes, field_values: {} });
    },
    history: item => itemService.activity(item.id, {}).events,
    row: item => db.prepare('SELECT location, location_detail, updated_at FROM items WHERE id = ?').get(item.id)
  };
};

const failure = (work, status, code) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  return true;
});

// A version 11 database: everything of the current schema except the version 12 columns.
const version11Database = db => {
  const { create } = build(db);
  create({ name: 'Old lamp', location: 'Attic' });
  db.exec(`
    ALTER TABLE items DROP COLUMN location_detail;
    ALTER TABLE items DROP COLUMN retired_location_detail_snapshot;
    ALTER TABLE item_templates DROP COLUMN location_detail;
    ALTER TABLE item_events DROP COLUMN from_detail;
    ALTER TABLE item_events DROP COLUMN to_detail;
  `);
  db.pragma('user_version = 11');
  return db;
};

test('version 12 adds the Specific location to an existing database and to a restored older backup', async () => {
  assert.equal(SCHEMA_VERSION, 13);
  for (const column of ['location_detail', 'retired_location_detail_snapshot']) assert.ok(CURRENT_SCHEMA.items.includes(column));
  assert.ok(CURRENT_SCHEMA.item_templates.includes('location_detail'));
  assert.ok(CURRENT_SCHEMA.item_events.includes('from_detail') && CURRENT_SCHEMA.item_events.includes('to_detail'));

  const db = version11Database(new Database(':memory:'));
  applySchema(db);
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), 13);
  assert.deepEqual(db.prepare('SELECT name, location, location_detail FROM items').get(), { name: 'Old lamp', location: 'Attic', location_detail: null });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM item_events').get().count, 0, 'no history is fabricated for existing items');

  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-location-detail-restore-')), 'backup.sqlite');
  version11Database(new Database(file)).close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.migratedFrom, 11);
  assert.equal(summary.schemaVersion, 13);
});

test('the Specific location is optional trimmed text, and a request without it keeps the saved value', () => {
  const { create, update, itemService, row } = build();
  const lamp = create({ name: 'Lamp', location: 'Apartment' });
  assert.equal(lamp.location_detail, null);
  assert.equal(lamp.effective_location_detail, null);

  const shelf = update(lamp, { location_detail: '  Bedroom, top shelf  ' });
  assert.equal(shelf.location_detail, 'Bedroom, top shelf');
  assert.equal(shelf.effective_location_detail, 'Bedroom, top shelf');

  // An older client sends the item without the new attribute: nothing is cleared.
  const { location_detail: omitted, ...older } = itemService.get(lamp.id);
  assert.equal(omitted, 'Bedroom, top shelf');
  itemService.update(lamp.id, { ...older, description: 'Desk lamp', field_values: {} });
  assert.equal(row(lamp).location_detail, 'Bedroom, top shelf');
  assert.equal(update(lamp, { location_detail: '   ' }).location_detail, null);

  failure(() => create({ name: 'Bad', location_detail: 5 }), 400, 'INVALID_LOCATION_DETAIL');
  failure(() => create({ name: 'Long', location_detail: 'x'.repeat(256) }), 400, 'LOCATION_DETAIL_TOO_LONG');
  assert.equal(create({ name: 'Edge', location_detail: 'x'.repeat(255) }).location_detail.length, 255);
});

test('a nested item shows the Specific location of its outermost container, at any depth, without rewriting its own', () => {
  const { create, update, itemService, row } = build();
  const cabinet = create({ name: 'Cabinet', location: 'Apartment', location_detail: 'Bedroom, wardrobe' });
  const bag = create({ name: 'Camera Bag', location: 'Garage', location_detail: 'Stale shelf', parent_item_id: cabinet.id });
  const camera = create({ name: 'Camera', location_detail: 'Own spot', parent_item_id: bag.id });

  for (const item of [bag, camera]) {
    const shown = itemService.get(item.id);
    assert.deepEqual([shown.effective_location, shown.effective_location_detail], ['Apartment', 'Bedroom, wardrobe']);
    assert.deepEqual(shown.effective_location_source, { id: cabinet.id, uuid: cabinet.uuid, name: 'Cabinet' });
  }
  assert.equal(itemService.get(camera.id).location_detail, 'Own spot', 'the saved own value stays in the response');

  // A root without a Specific location shows none: a nested item's stale value never takes over.
  const before = row(camera);
  update(cabinet, { location: 'Living room', location_detail: '' });
  const moved = itemService.get(camera.id);
  assert.deepEqual([moved.effective_location, moved.effective_location_detail], ['Living room', null]);
  assert.deepEqual(row(camera), before, 'the move wrote nothing to the item inside');
  assert.equal(row(bag).location_detail, 'Stale shelf');

  // The list, the hierarchy, and labels resolve the same placement in their single statements.
  update(cabinet, { location_detail: 'Lower cabinet' });
  const listed = itemService.list({ sort: 'name' }).items.find(item => item.id === camera.id);
  assert.deepEqual([listed.effective_location, listed.effective_location_detail, listed.location_detail], ['Living room', 'Lower cabinet', 'Own spot']);
  const node = itemService.hierarchy().items.find(item => item.id === camera.id);
  assert.deepEqual([node.effective_location, node.effective_location_detail], ['Living room', 'Lower cabinet']);
  assert.equal(itemService.labels({ uuids: [camera.uuid] }).items[0].effective_location_detail, 'Lower cabinet');

  // Leaving the container makes the item's own saved value effective again.
  const freed = update(camera, { parent_item_id: null });
  assert.deepEqual([freed.effective_location_detail, freed.effective_location_source], ['Own spot', null]);
});

test('the list sorts by the effective Specific location and searches it, never the hidden own value', () => {
  const { create, itemService } = build();
  const kitchen = create({ name: 'Pantry box', location: 'Home', location_detail: 'Kitchen, upper cupboard' });
  create({ name: 'Spice jar', location_detail: 'Bathroom', parent_item_id: kitchen.id });
  create({ name: 'Garage drill', location: 'Garage', location_detail: 'Workbench' });
  create({ name: 'Loose note' });

  const names = query => itemService.list(query).items.map(item => item.name);
  assert.deepEqual(names({ search: 'kitchen', sort: 'name' }), ['Pantry box', 'Spice jar']);
  assert.equal(itemService.list({ search: 'kitchen' }).pagination.total, 2);
  assert.deepEqual(names({ search: 'Bathroom' }), [], 'a hidden saved value is not where the item is');
  assert.deepEqual(names({ sort: 'locationDetail' }), ['Pantry box', 'Spice jar', 'Garage drill', 'Loose note']);
  assert.deepEqual(names({ sort: 'locationDetail', direction: 'desc' }), ['Garage drill', 'Pantry box', 'Spice jar', 'Loose note']);

  const column = buildItemColumns([]).find(entry => entry.key === 'locationDetail');
  assert.deepEqual({ type: column.type, sortable: column.sortable, visibleByDefault: column.visibleByDefault }, {
    type: 'text', sortable: true, visibleByDefault: false
  });
});

test('history records real changes of the effective placement as one event per item and operation', () => {
  const { create, update, history } = build();
  const box = create({ name: 'Box', location: 'Apartment', location_detail: 'Bedroom, wardrobe' });
  const camera = create({ name: 'Camera', parent_item_id: box.id });
  const lamp = create({ name: 'Lamp', location: 'Office' });

  // Both fields in one save are one move.
  update(box, { location: 'Studio', location_detail: 'Shelf B' });
  const [boxMove] = history(box);
  assert.deepEqual([boxMove.type, boxMove.from, boxMove.from_detail, boxMove.to, boxMove.to_detail],
    ['location_changed', 'Apartment', 'Bedroom, wardrobe', 'Studio', 'Shelf B']);
  assert.equal(history(box).length, 1);

  // The contents moved with the box, in the same operation.
  const [cameraMove] = history(camera);
  assert.deepEqual([cameraMove.operation_id, cameraMove.from_detail, cameraMove.to_detail, cameraMove.via_item.name],
    [boxMove.operation_id, 'Bedroom, wardrobe', 'Shelf B', 'Box']);

  // A Specific location change alone is a move; spacing and letter case are not.
  update(lamp, { location_detail: 'Desk drawer' });
  assert.deepEqual(history(lamp).map(event => [event.from, event.from_detail, event.to, event.to_detail]),
    [['Office', null, 'Office', 'Desk drawer']]);
  update(lamp, { location_detail: ' desk DRAWER ' });
  assert.equal(history(lamp).length, 1);

  // Editing the hidden saved value of a nested item moves nothing.
  update(camera, { location_detail: 'Somewhere old' });
  assert.equal(history(camera).length, 1);
});

test('retirement snapshots the Specific location, and Restore can set it again', () => {
  const { create, lifecycle, history, row } = build();
  const box = create({ name: 'Box', location: 'Garage', location_detail: 'Rack 2' });
  const lens = create({ name: 'Lens', location_detail: 'Old', parent_item_id: box.id });

  const retired = lifecycle.change(lens.id, { status: 'retired', reason: 'sold' }).item;
  assert.deepEqual([retired.retirement.last_location, retired.retirement.last_location_detail], ['Garage', 'Rack 2']);
  assert.equal(row(lens).location_detail, 'Old', 'retiring never rewrites the saved value');
  const [retiredEvent] = history(lens);
  assert.deepEqual([retiredEvent.from, retiredEvent.from_detail], ['Garage', 'Rack 2']);

  const restored = lifecycle.change(lens.id, { status: 'active', location: 'Studio', location_detail: 'Drawer 1' }).item;
  assert.deepEqual([restored.effective_location, restored.effective_location_detail, restored.retirement], ['Studio', 'Drawer 1', null]);
  assert.deepEqual([history(lens)[0].to, history(lens)[0].to_detail], ['Studio', 'Drawer 1']);

  // Without location_detail the saved value is kept.
  lifecycle.change(lens.id, { status: 'retired', reason: 'lost' });
  assert.equal(lifecycle.change(lens.id, { status: 'active', location: 'Studio' }).item.location_detail, 'Drawer 1');
});

test('templates keep a Specific location default and pass it to the item draft', () => {
  const { templates, category } = build();
  const template = templates.create({ name: 'Shelf kit', category_id: category.id, location_detail: 'Top shelf', field_values: {} });
  assert.equal(template.location_detail, 'Top shelf');
  assert.equal(templates.itemDraft(template.id).baseFields.location_detail, 'Top shelf');
  const { location_detail: omitted, ...older } = template;
  assert.equal(omitted, 'Top shelf');
  assert.equal(templates.update(template.id, { ...older, name: 'Shelf kit 2' }).location_detail, 'Top shelf');
  assert.equal(templates.update(template.id, { ...older, location_detail: null }).location_detail, null);
});

test('batch import accepts an optional locationDetail and reviews it with the item rules', () => {
  const { itemService, category } = build();
  const document = {
    version: 1, category: 'Gear',
    items: [{ name: 'Tent', location: 'Garage', locationDetail: 'Top rack' }, { name: 'Stove' }]
  };
  const drafts = parseItemImportDocument(JSON.stringify(document), { categoryName: 'Gear', fields: [] });
  assert.deepEqual(drafts.map(draft => draft.locationDetail), ['Top rack', '']);
  assert.equal(reviewItemDraft({ ...drafts[0], locationDetail: 'x'.repeat(256) }, []).locationDetail.code, 'LOCATION_DETAIL_TOO_LONG');
  const created = itemService.createBatch({ categoryId: category.id, document });
  assert.deepEqual(created.map(item => item.location_detail), ['Top rack', null]);
});

test('the HTTP API stores, inherits, and keeps the Specific location for older clients', async () => {
  const { child, base } = await startServer(await mkdtemp(path.join(os.tmpdir(), 'inventory-location-detail-api-')));
  const call = async (url, method = 'GET', body) => {
    const response = await fetch(`${base}${url}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const category = (await call('/api/categories', 'POST', { name: 'Gear' })).body;
    const box = (await call('/api/items', 'POST', { name: 'Box', category_id: category.id, location: 'Home', location_detail: 'Kitchen' })).body;
    const cup = (await call('/api/items', 'POST', { name: 'Cup', category_id: category.id, parent_item_id: box.id })).body;
    assert.deepEqual([cup.effective_location, cup.effective_location_detail, cup.effective_location_source.name], ['Home', 'Kitchen', 'Box']);

    // An older client's full update without the new attribute keeps it.
    const updated = await call(`/api/items/${box.id}`, 'PUT', { name: 'Box', category_id: category.id, location: 'Home' });
    assert.equal(updated.body.location_detail, 'Kitchen');
    const found = (await call('/api/items?search=kitchen')).body;
    assert.deepEqual(found.items.map(item => item.name).sort(), ['Box', 'Cup']);

    const refused = await call('/api/items', 'POST', { name: 'Bad', category_id: category.id, location_detail: 'x'.repeat(256) });
    assert.deepEqual([refused.status, refused.body], [400, { error: { code: 'LOCATION_DETAIL_TOO_LONG', params: { max: 255 } } }]);
  } finally {
    await stopServer(child);
  }
});
