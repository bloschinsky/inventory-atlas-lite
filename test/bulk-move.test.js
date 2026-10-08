import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Bulk Move is tested at the service level against an in-memory database, never data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-bulk-move-test-'));

const { applySchema } = await import('../server/src/db.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
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
  const category = categoryService.create({ name: 'Gear' });
  const itemService = new ItemService({
    itemRepository: new ItemRepository(db), customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository
  });
  return {
    db,
    category,
    itemService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    add: (name, parent = null, attributes = {}) => itemService.create({ name, category_id: category.id, parent_item_id: parent?.id ?? null, ...attributes }),
    parentOf: item => db.prepare('SELECT parent_item_id AS value FROM items WHERE id = ?').get(item.id).value,
    row: item => db.prepare('SELECT * FROM items WHERE id = ?').get(item.id)
  };
};

const failure = (work, status, code, params) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  if (params) assert.deepEqual(error.params, params);
  return true;
});

const ids = items => items.map(item => item.id);

test('unrelated leaf items and containers move into one destination', () => {
  const { add, itemService, parentOf } = build();
  const target = add('Box B4');
  const shelf = add('Shelf');
  const leaves = [add('Camera'), add('Lens', shelf), add('Flash')];
  const containers = [add('Bag'), add('Case', shelf)];
  const cable = add('Cable', containers[0]);

  const result = itemService.bulkMove({ item_ids: ids([...leaves, ...containers]), parent_item_id: target.id });

  assert.deepEqual(result, {
    selected_count: 5, root_count: 5, moved_count: 5, unchanged_count: 0,
    parent: { id: target.id, uuid: target.uuid, name: 'Box B4', lifecycle_status: 'active' },
    moved_root_ids: ids([...leaves, ...containers])
  });
  for (const item of [...leaves, ...containers]) assert.equal(parentOf(item), target.id);
  // Contents of a moved container travel with it.
  assert.equal(parentOf(cable), containers[0].id);
  assert.deepEqual(itemService.get(target.id).children.map(child => child.name), ['Bag', 'Camera', 'Case', 'Flash', 'Lens']);
  assert.deepEqual(itemService.get(shelf.id).children, []);
});

test('a selected parent and child keep their structure; only the parent is reparented', () => {
  const { add, itemService, parentOf } = build();
  const boxA = add('Box A');
  const camera = add('Camera', boxA);
  const boxB = add('Box B');

  const result = itemService.bulkMove({ item_ids: [camera.id, boxA.id], parent_item_id: boxB.id });

  assert.equal(result.root_count, 1);
  assert.deepEqual(result.moved_root_ids, [boxA.id]);
  assert.equal(parentOf(boxA), boxB.id);
  assert.equal(parentOf(camera), boxA.id);
});

test('selection roots skip every selected item below a selected ancestor, at any depth', () => {
  const { add, itemService, parentOf, row } = build();
  const a = add('A');
  const b = add('B', a);
  const c = add('C', b);
  const d = add('D', c);
  const x = add('X');
  const cBefore = row(c);

  const result = itemService.bulkMove({ item_ids: ids([a, c, d]), parent_item_id: x.id });

  assert.deepEqual({ selected: result.selected_count, roots: result.root_count, moved: result.moved_root_ids }, { selected: 3, roots: 1, moved: [a.id] });
  assert.deepEqual([a, b, c, d].map(parentOf), [x.id, a.id, b.id, c.id]);
  // Descendant rows are not rewritten merely because an ancestor moved.
  assert.deepEqual(row(c), cBefore);
});

test('several selected subtrees reduce to their own roots', () => {
  const { add, itemService, parentOf } = build();
  const a = add('A');
  const b = add('B', a);
  const c = add('C');
  const d = add('D', c);
  const x = add('X');

  assert.deepEqual(itemService.bulkMovePreview({ item_ids: ids([b, c, d]) }).root_count, 2);
  const result = itemService.bulkMove({ item_ids: ids([b, c, d]), parent_item_id: x.id });

  assert.deepEqual(result.moved_root_ids.sort(), [b.id, c.id].sort());
  assert.deepEqual([a, b, c, d].map(parentOf), [null, x.id, x.id, c.id]);
});

test('a destination that is a selection root or lies inside one is refused and nothing moves', () => {
  const { add, itemService, parentOf } = build();
  const boxA = add('Box A');
  const boxB = add('Box B', boxA);
  const camera = add('Camera', boxB);
  const loose = add('Loose');
  const before = () => [boxA, boxB, camera, loose].map(parentOf);
  const original = before();

  failure(() => itemService.bulkMove({ item_ids: ids([loose, boxA]), parent_item_id: boxA.id }), 400, 'ITEM_CANNOT_CONTAIN_ITSELF');
  // Box B is only selected-adjacent: it lies inside the selected root Box A.
  failure(() => itemService.bulkMove({ item_ids: ids([loose, boxA, camera]), parent_item_id: boxB.id }), 400, 'ITEM_PARENT_CYCLE');
  // A selected item nested under a selected root is still part of the moved subtree.
  failure(() => itemService.bulkMove({ item_ids: ids([boxA, camera]), parent_item_id: camera.id }), 400, 'ITEM_PARENT_CYCLE');
  assert.deepEqual(before(), original);
});

test('unknown items, unknown destinations, and malformed requests reject the whole request', () => {
  const { add, itemService, parentOf } = build();
  const box = add('Box');
  const lens = add('Lens');

  failure(() => itemService.bulkMove({ item_ids: [lens.id, 9999, 'no-such-uuid'], parent_item_id: box.id }), 404, 'BULK_MOVE_ITEMS_NOT_FOUND', { count: 2 });
  failure(() => itemService.bulkMove({ item_ids: [lens.id], parent_item_id: 9999 }), 400, 'PARENT_ITEM_NOT_FOUND');
  failure(() => itemService.bulkMove({ item_ids: [lens.id], parent_item_id: 'box' }), 400, 'PARENT_ITEM_NOT_FOUND');
  failure(() => itemService.bulkMove({ item_ids: [lens.id] }), 400, 'BULK_MOVE_PARENT_REQUIRED');
  failure(() => itemService.bulkMove({ item_ids: [], parent_item_id: box.id }), 400, 'BULK_MOVE_NO_ITEMS');
  failure(() => itemService.bulkMove({ parent_item_id: box.id }), 400, 'BULK_MOVE_NO_ITEMS');
  failure(() => itemService.bulkMove({ item_ids: [lens.id, { id: 1 }], parent_item_id: box.id }), 400, 'BULK_MOVE_INVALID_ITEMS');
  failure(() => itemService.bulkMovePreview({ item_ids: [9999] }), 404, 'BULK_MOVE_ITEMS_NOT_FOUND', { count: 1 });
  assert.equal(parentOf(lens), null);
});

test('duplicate ids and UUIDs naming the same item count once', () => {
  const { add, itemService, parentOf } = build();
  const box = add('Box');
  const lens = add('Lens');

  const result = itemService.bulkMove({ item_ids: [lens.id, lens.id, lens.uuid, lens.uuid.toUpperCase(), String(lens.id)], parent_item_id: box.id });

  assert.deepEqual({ selected: result.selected_count, moved: result.moved_root_ids }, { selected: 1, moved: [lens.id] });
  assert.equal(parentOf(lens), box.id);
});

test('a failure while writing leaves every root where it was', () => {
  const { add, db, itemService, parentOf } = build();
  const box = add('Box');
  const items = [add('One'), add('Two'), add('Three')];
  // The second update fails inside the transaction, after the first row was already written.
  db.exec(`CREATE TRIGGER fail_two BEFORE UPDATE OF parent_item_id ON items WHEN NEW.name = 'Two'
    BEGIN SELECT RAISE(ABORT, 'Disk full'); END`);

  assert.throws(() => itemService.bulkMove({ item_ids: ids(items), parent_item_id: box.id }), /Disk full/);
  assert.deepEqual(items.map(parentOf), [null, null, null]);
});

test('roots already inside the destination are reported unchanged and not written', () => {
  const { add, itemService, parentOf, row } = build();
  const box = add('Box');
  const inside = add('Inside', box);
  const outside = add('Outside');
  const insideBefore = row(inside);

  const partial = itemService.bulkMove({ item_ids: ids([inside, outside]), parent_item_id: box.id });
  assert.deepEqual({ moved: partial.moved_count, unchanged: partial.unchanged_count, ids: partial.moved_root_ids }, { moved: 1, unchanged: 1, ids: [outside.id] });
  assert.deepEqual(row(inside), insideBefore);

  const noop = itemService.bulkMove({ item_ids: ids([inside, outside]), parent_item_id: box.id });
  assert.deepEqual({ moved: noop.moved_count, unchanged: noop.unchanged_count }, { moved: 0, unchanged: 2 });
  assert.equal(parentOf(outside), box.id);
});

test('the effective location follows the new container while saved values and other data stay', () => {
  const { add, category, customFieldService, db, itemService, row } = build();
  const serial = customFieldService.create(category.id, { name: 'Mount', type: 'text' });
  const garage = add('Garage rack', null, { location: 'Garage' });
  const boxA = add('Box A', garage, { location: 'Old shelf', description: 'Plastic' });
  const camera = add('Camera', boxA, { location: 'Drawer', serial_number: 'SN-1', field_values: { [serial.id]: 'EF' } });
  const home = add('Home cabinet', null, { location: 'Home' });
  const boxB = add('Box B', home);
  db.prepare('INSERT INTO item_photos (item_id, filename, mime_type, data, sort_order) VALUES (?, ?, ?, ?, 0)')
    .run(camera.id, 'camera.jpg', 'image/jpeg', Buffer.from('jpg'));
  const [boxBefore, cameraBefore] = [row(boxA), row(camera)];
  assert.equal(itemService.get(camera.id).effective_location, 'Garage');

  itemService.bulkMove({ item_ids: ids([boxA, camera]), parent_item_id: boxB.id });

  const movedCamera = itemService.get(camera.id);
  assert.equal(movedCamera.effective_location, 'Home');
  assert.equal(movedCamera.effective_location_source.name, 'Home cabinet');
  assert.equal(itemService.get(boxA.id).effective_location, 'Home');
  // Only the moved root's link and update time change; the descendant row is untouched.
  const { parent_item_id: parentId, updated_at: updated, ...boxRest } = row(boxA);
  const { parent_item_id: oldParent, updated_at: oldUpdated, ...boxRestBefore } = boxBefore;
  assert.equal(parentId, boxB.id);
  assert.notEqual(oldParent, parentId);
  assert.ok(updated >= oldUpdated);
  assert.deepEqual(boxRest, boxRestBefore);
  assert.deepEqual(row(camera), cameraBefore);
  assert.equal(movedCamera.location, 'Drawer');
  assert.deepEqual(movedCamera.fields.map(field => field.value), ['EF']);
  assert.equal(movedCamera.photos.length, 1);
  // The list and the hierarchy read the same inherited location.
  const listed = itemService.list({ search: 'Camera' }).items[0];
  assert.deepEqual({ parent: listed.parent_name, location: listed.effective_location }, { parent: 'Box A', location: 'Home' });
  const node = itemService.hierarchy().items.find(item => item.id === camera.id);
  assert.deepEqual({ parent: node.parent_id, location: node.effective_location }, { parent: boxA.id, location: 'Home' });
});

test('the preview offers only destinations outside every selected subtree', () => {
  const { add, itemService } = build();
  const boxA = add('Box A');
  const boxB = add('Box B', boxA);
  add('Camera', boxB);
  const loose = add('Loose');
  add('Shelf', null);
  const twin = add('Shelf', boxA);

  const preview = itemService.bulkMovePreview({ item_ids: [boxB.uuid, loose.id] });
  assert.deepEqual({ selected: preview.selected_count, roots: preview.root_count }, { selected: 2, roots: 2 });
  assert.deepEqual(preview.candidates.map(item => [item.name, item.parent_name]), [['Box A', null], ['Shelf', null], ['Shelf', 'Box A']]);
  assert.deepEqual(itemService.bulkMovePreview({ item_ids: [boxA.id], search: 'shel' }).candidates.map(item => item.id).includes(twin.id), false);
});

test('single-item Stored inside editing keeps its own cycle protection', () => {
  const { add, category, itemService, parentOf } = build();
  const box = add('Box');
  const inner = add('Inner', box);
  const deep = add('Deep', inner);
  const save = (item, parentId) => itemService.update(item.id, { name: item.name, category_id: category.id, parent_item_id: parentId });

  failure(() => save(box, deep.id), 400, 'ITEM_PARENT_CYCLE');
  failure(() => save(box, box.id), 400, 'ITEM_CANNOT_CONTAIN_ITSELF');
  save(deep, box.id);
  assert.equal(parentOf(deep), box.id);
  assert.deepEqual(itemService.parentCandidates({ excludeId: inner.id }).map(item => item.name), ['Box', 'Deep']);
});
