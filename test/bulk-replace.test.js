import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Bulk Replace Value is tested at the service level against an in-memory database, never data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-bulk-replace-test-'));

const { applySchema } = await import('../server/src/db.js');
const { BulkReplaceRepository } = await import('../server/src/repositories/bulkReplaceRepository.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { BulkReplaceService } = await import('../server/src/services/bulkReplaceService.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { ItemService } = await import('../server/src/services/itemService.js');

const build = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  const bulkReplaceRepository = new BulkReplaceRepository(db);
  const category = categoryService.create({ name: 'Gear' });
  const itemService = new ItemService({
    itemRepository: new ItemRepository(db), customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository
  });
  return {
    db,
    category,
    categoryService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    itemService,
    bulkReplaceRepository,
    bulkReplaceService: new BulkReplaceService({ bulkReplaceRepository }),
    // Items of the default category; `raw` columns are written as stored, bypassing the input trimming.
    add: (name, attributes = {}, raw = {}) => {
      const item = itemService.create({ name, category_id: category.id, ...attributes });
      for (const [column, value] of Object.entries(raw)) db.prepare(`UPDATE items SET ${column} = ? WHERE id = ?`).run(value, item.id);
      return item;
    },
    column: (column, id) => db.prepare(`SELECT ${column} AS value FROM items WHERE id = ?`).get(id).value,
    fieldValue: (fieldId, itemId) => db.prepare('SELECT value FROM item_field_values WHERE field_id = ? AND item_id = ?').get(fieldId, itemId).value
  };
};

const failure = (work, status, code) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  return true;
});

const location = { type: 'core', key: 'location' };

test('Location is replaced only where the whole saved value matches, ignoring case and surrounding spaces', () => {
  const { add, column, bulkReplaceService } = build();
  const exact = add('Exact', { location: 'Garage' });
  const lower = add('Lower', {}, { location: ' garage ' });
  const upper = add('Upper', { location: 'GARAGE' });
  const partial = ['TP Garage', 'Big Garage', 'KP Garage'].map(value => add(value, { location: value }));
  const empty = add('Nowhere');

  const result = bulkReplaceService.apply({ field: location, from: '  garage', to: '  KP Garage ' });

  assert.deepEqual(result, { updated: 3 });
  for (const item of [exact, lower, upper]) assert.equal(column('location', item.id), 'KP Garage');
  assert.deepEqual(partial.map(item => column('location', item.id)), ['TP Garage', 'Big Garage', 'KP Garage']);
  assert.equal(column('location', empty.id), null);
});

test('case-insensitive matching covers letters beyond ASCII', () => {
  const { add, column, bulkReplaceService } = build();
  const shed = add('Shed item', { location: 'ГАРАЖ' });
  assert.deepEqual(bulkReplaceService.apply({ field: location, from: 'гараж', to: 'Сарай' }), { updated: 1 });
  assert.equal(column('location', shed.id), 'Сарай');
});

test('the preview reports the matches and the existing target value without writing anything', () => {
  const { add, db, bulkReplaceService } = build();
  add('Drill', { location: 'Garage' });
  add('Saw', {}, { location: 'garage ' });
  add('Tent', { location: 'KP Garage' });
  add('Rope', { location: 'kp garage' });
  add('Lamp', { location: 'TP Garage' });
  const before = db.prepare('SELECT id, location, updated_at FROM items ORDER BY id').all();

  const preview = bulkReplaceService.preview({ field: location, from: 'Garage', to: 'KP Garage' });

  assert.deepEqual(preview.field, location);
  assert.equal(preview.from, 'Garage');
  assert.equal(preview.to, 'KP Garage');
  assert.equal(preview.count, 2);
  assert.equal(preview.existingCount, 2);
  assert.deepEqual(preview.items.map(item => [item.name, item.category_name, item.value]), [['Drill', 'Gear', 'Garage'], ['Saw', 'Gear', 'garage ']]);
  assert.deepEqual(db.prepare('SELECT id, location, updated_at FROM items ORDER BY id').all(), before);

  const nothing = bulkReplaceService.preview({ field: location, from: 'Attic', to: 'Loft' });
  assert.equal(nothing.count, 0);
  assert.deepEqual(nothing.items, []);
});

test('records that already hold the target keep their row untouched while new ones join them', () => {
  const { add, db, column, bulkReplaceService } = build();
  const moved = add('Drill', { location: 'Garage' });
  const kept = add('Tent', { location: 'KP Garage' });
  db.prepare("UPDATE items SET updated_at = '2020-01-01 00:00:00'").run();

  assert.deepEqual(bulkReplaceService.apply({ field: location, from: 'Garage', to: 'KP Garage' }), { updated: 1 });

  assert.equal(column('location', moved.id), 'KP Garage');
  assert.notEqual(column('updated_at', moved.id), '2020-01-01 00:00:00');
  assert.equal(column('updated_at', kept.id), '2020-01-01 00:00:00');
  assert.deepEqual(bulkReplaceService.values(location), [{ value: 'KP Garage', usage_count: 2 }]);
});

test('Condition and Transferred To are replaced on their own column only', () => {
  const { add, column, bulkReplaceService } = build();
  const item = add('Camera', { condition: 'Used', location: 'Used', transferred_to: 'Anna' });
  const other = add('Lens', { transferred_to: 'Anna Smith' });

  assert.deepEqual(bulkReplaceService.apply({ field: { type: 'core', key: 'condition' }, from: 'used', to: 'Good' }), { updated: 1 });
  assert.deepEqual(bulkReplaceService.apply({ field: { type: 'core', key: 'transferredTo' }, from: 'ANNA', to: 'Anna K.' }), { updated: 1 });

  assert.equal(column('condition', item.id), 'Good');
  assert.equal(column('location', item.id), 'Used');
  assert.equal(column('transferred_to', item.id), 'Anna K.');
  assert.equal(column('transferred_to', other.id), 'Anna Smith');
  // The replacement follows the regular Transferred To input limit.
  failure(() => bulkReplaceService.apply({ field: { type: 'core', key: 'transferredTo' }, from: 'Anna K.', to: 'x'.repeat(256) }), 400, 'TRANSFERRED_TO_TOO_LONG');
});

test('a custom text field is replaced by its id and never mixed with a same-name field elsewhere', () => {
  const { add, db, category, categoryService, customFieldService, itemService, fieldValue, bulkReplaceService } = build();
  const lenses = categoryService.create({ name: 'Lenses' });
  const brand = customFieldService.create(category.id, { name: 'Brand', type: 'text' });
  const otherBrand = customFieldService.create(lenses.id, { name: 'brand', type: 'text' });
  const camera = add('Camera', { field_values: { [brand.id]: ' creative ' } });
  const speaker = add('Speaker', { field_values: { [brand.id]: 'Creative Labs' } });
  const lens = itemService.create({ name: 'Lens', category_id: lenses.id, field_values: { [otherBrand.id]: 'Creative' } });
  db.prepare("UPDATE items SET updated_at = '2020-01-01 00:00:00'").run();

  const fields = bulkReplaceService.fields();
  assert.deepEqual(fields.core, ['condition', 'location', 'transferredTo']);
  assert.deepEqual(fields.custom.map(field => [field.id, field.name, field.category_name]), [[brand.id, 'Brand', 'Gear'], [otherBrand.id, 'brand', 'Lenses']]);
  assert.deepEqual(bulkReplaceService.values({ type: 'custom', fieldId: brand.id }), [
    { value: 'creative', usage_count: 1 }, { value: 'Creative Labs', usage_count: 1 }
  ]);

  const preview = bulkReplaceService.preview({ field: { type: 'custom', fieldId: brand.id }, from: 'Creative', to: 'Creative Labs' });
  assert.deepEqual(preview.field, { type: 'custom', fieldId: brand.id, name: 'Brand', category_name: 'Gear' });
  assert.deepEqual([preview.count, preview.existingCount], [1, 1]);

  assert.deepEqual(bulkReplaceService.apply({ field: { type: 'custom', fieldId: String(brand.id) }, from: 'Creative', to: 'Creative Labs' }), { updated: 1 });
  assert.equal(fieldValue(brand.id, camera.id), 'Creative Labs');
  assert.equal(fieldValue(brand.id, speaker.id), 'Creative Labs');
  assert.equal(fieldValue(otherBrand.id, lens.id), 'Creative');
  // The changed item counts as updated; the others keep their timestamp.
  const updatedAt = id => db.prepare('SELECT updated_at FROM items WHERE id = ?').get(id).updated_at;
  assert.notEqual(updatedAt(camera.id), '2020-01-01 00:00:00');
  assert.equal(updatedAt(speaker.id), '2020-01-01 00:00:00');
  assert.equal(updatedAt(lens.id), '2020-01-01 00:00:00');
});

test('unsupported fields and invalid values are refused before anything is written', () => {
  const { add, category, customFieldService, bulkReplaceService } = build();
  const year = customFieldService.create(category.id, { name: 'Year', type: 'number' });
  add('Drill', { location: 'Garage' });

  for (const key of ['name', 'description', 'serialNumber', 'purchaseDate', 'category', 'storedInside', 'location = 1; --', 'constructor', undefined]) {
    failure(() => bulkReplaceService.preview({ field: { type: 'core', key }, from: 'a', to: 'b' }), 400, 'BULK_REPLACE_UNSUPPORTED_FIELD');
  }
  failure(() => bulkReplaceService.apply({ field: { column: 'location' }, from: 'a', to: 'b' }), 400, 'BULK_REPLACE_UNSUPPORTED_FIELD');
  failure(() => bulkReplaceService.apply({ from: 'a', to: 'b' }), 400, 'BULK_REPLACE_UNSUPPORTED_FIELD');
  failure(() => bulkReplaceService.apply({ field: { type: 'custom', fieldId: 999 }, from: 'a', to: 'b' }), 404, 'FIELD_NOT_FOUND');
  failure(() => bulkReplaceService.apply({ field: { type: 'custom', fieldId: 'x' }, from: 'a', to: 'b' }), 404, 'FIELD_NOT_FOUND');
  failure(() => bulkReplaceService.apply({ field: { type: 'custom', fieldId: year.id }, from: '1', to: '2' }), 400, 'BULK_REPLACE_TEXT_ONLY');
  failure(() => bulkReplaceService.values({ type: 'custom', fieldId: year.id }), 400, 'BULK_REPLACE_TEXT_ONLY');
  failure(() => bulkReplaceService.apply({ field: location, from: '  ', to: 'b' }), 400, 'BULK_REPLACE_SOURCE_REQUIRED');
  failure(() => bulkReplaceService.apply({ field: location, from: 'Garage' }), 400, 'BULK_REPLACE_TARGET_REQUIRED');
  failure(() => bulkReplaceService.apply({ field: location, from: 'Garage', to: ' ' }), 400, 'BULK_REPLACE_TARGET_REQUIRED');
  failure(() => bulkReplaceService.apply({ field: location, from: 'Garage', to: ' GARAGE ' }), 400, 'BULK_REPLACE_SAME_VALUE');
  assert.deepEqual(bulkReplaceService.values(location), [{ value: 'Garage', usage_count: 1 }]);
});

test('the replacement finds its matches again instead of trusting an earlier preview', () => {
  const { add, db, column, bulkReplaceService } = build();
  const drill = add('Drill', { location: 'Garage' });
  const saw = add('Saw', { location: 'Garage' });
  const request = { field: location, from: 'Garage', to: 'Workshop' };
  assert.equal(bulkReplaceService.preview(request).count, 2);

  // After the preview one item moves away and another one arrives.
  db.prepare("UPDATE items SET location = 'Attic' WHERE id = ?").run(saw.id);
  const tent = add('Tent', { location: 'garage' });

  assert.deepEqual(bulkReplaceService.apply(request), { updated: 2 });
  assert.deepEqual([drill, saw, tent].map(item => column('location', item.id)), ['Workshop', 'Attic', 'Workshop']);
  assert.deepEqual(bulkReplaceService.apply(request), { updated: 0 });
});

test('a replacement that fails while writing leaves every value as it was', () => {
  const { add, category, customFieldService, fieldValue, bulkReplaceRepository, bulkReplaceService } = build();
  const brand = customFieldService.create(category.id, { name: 'Brand', type: 'text' });
  const items = ['Camera', 'Speaker'].map(name => add(name, { field_values: { [brand.id]: 'Creative' } }));
  // The field values are already rewritten inside the transaction when the second statement fails.
  bulkReplaceRepository.touchItems = () => { throw new Error('Disk full.'); };

  assert.throws(() => bulkReplaceService.apply({ field: { type: 'custom', fieldId: brand.id }, from: 'Creative', to: 'Creative Labs' }), /Disk full/);
  assert.deepEqual(items.map(item => fieldValue(brand.id, item.id)), ['Creative', 'Creative']);
});

test("replacing a container's saved Location moves its contents through inheritance only", () => {
  const { add, column, itemService, bulkReplaceService } = build();
  const box = add('Box A', { location: 'Garage' });
  const camera = add('Camera', { parent_item_id: box.id });
  const lens = add('Lens', { location: 'Office', parent_item_id: camera.id });

  assert.equal(bulkReplaceService.preview({ field: location, from: 'Garage', to: 'KP Garage' }).count, 1);
  assert.deepEqual(bulkReplaceService.apply({ field: location, from: 'Garage', to: 'KP Garage' }), { updated: 1 });

  assert.equal(column('location', box.id), 'KP Garage');
  assert.equal(column('location', camera.id), null);
  assert.equal(column('location', lens.id), 'Office');
  assert.equal(itemService.get(camera.id).effective_location, 'KP Garage');
  assert.equal(itemService.get(lens.id).effective_location, 'KP Garage');
});

test('value discovery lists distinct saved values with their usage, filtered and limited', () => {
  const { add, bulkReplaceService } = build();
  for (const value of ['Home', 'home', ' HOME', 'Garage', 'KP Garage', 'Office']) add(value, {}, { location: value });

  assert.deepEqual(bulkReplaceService.values(location), [
    { value: 'Home', usage_count: 3 },
    { value: 'Garage', usage_count: 1 },
    { value: 'KP Garage', usage_count: 1 },
    { value: 'Office', usage_count: 1 }
  ]);
  assert.deepEqual(bulkReplaceService.values(location, { search: ' gar', limit: '1' }), [{ value: 'Garage', usage_count: 1 }]);
});
