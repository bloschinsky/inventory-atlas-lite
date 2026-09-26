import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildTree, expandableKeys, searchTree, UNCONTAINED, visibleRows } from '../client/src/hierarchyTree.js';

// The hierarchy endpoint and the client tree are exercised without HTTP against an in-memory database.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-hierarchy-test-'));

const { applySchema } = await import('../server/src/db.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemService } = await import('../server/src/services/itemService.js');

const build = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const itemService = new ItemService({
    itemRepository: new ItemRepository(db),
    customFieldRepository: new CustomFieldRepository(db),
    itemPhotoRepository: new ItemPhotoRepository(db),
    categoryRepository
  });
  const categoryId = db.prepare("INSERT INTO categories (name) VALUES ('Storage')").run().lastInsertRowid;
  const add = (name, parent = null, location = null) =>
    itemService.create({ name, category_id: categoryId, location, parent_item_id: parent?.id ?? null });
  return { db, itemService, add };
};

// Tree items in the shape of the endpoint, for the client tests that need no database.
const node = (id, name, parentId = null) => ({ id, uuid: `u${id}`, name, parent_id: parentId, children_count: 0 });
const names = rows => rows.map(row => (row.type === 'group' ? `[${UNCONTAINED}]` : row.item.name));
const depths = rows => rows.map(row => row.depth);

test('the hierarchy endpoint returns lightweight flat nodes with inherited locations', () => {
  const { db, itemService, add } = build();
  assert.deepEqual(itemService.hierarchy(), { items: [] });

  const box = add('Box A', null, 'KP Garage');
  const bag = add('Camera Bag', box, 'Hallway');
  const camera = add('Nikon F80', bag);
  add('Coffee mug', null, '  ');
  db.prepare("INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES (?, 'a.png', 'image/png', x'00')").run(camera.id);
  db.prepare("INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES (?, 'b.png', 'image/png', x'00')").run(camera.id);
  const firstPhoto = db.prepare('SELECT MIN(id) AS id FROM item_photos').get().id;

  const { items } = itemService.hierarchy();
  assert.deepEqual(items.map(item => item.name), ['Box A', 'Camera Bag', 'Coffee mug', 'Nikon F80']);
  const byName = Object.fromEntries(items.map(item => [item.name, item]));
  assert.deepEqual(byName['Nikon F80'], {
    id: camera.id, uuid: camera.uuid, name: 'Nikon F80', parent_id: bag.id, category_id: camera.category_id,
    category_name: 'Storage', thumbnail_id: firstPhoto, children_count: 0, effective_location: 'KP Garage'
  });
  assert.equal(byName['Box A'].children_count, 1);
  assert.equal(byName['Box A'].parent_id, null);
  assert.equal(byName['Box A'].thumbnail_id, null);
  // Every nested item shows the outermost container's location, exactly as the item list does.
  assert.equal(byName['Camera Bag'].effective_location, 'KP Garage');
  assert.equal(byName['Coffee mug'].effective_location, null);
  const listed = itemService.list({ pageSize: 100 }).items;
  for (const item of listed) assert.equal(byName[item.name].effective_location, item.effective_location);
});

test('the hierarchy endpoint reads everything in one statement and writes nothing', () => {
  const { db, itemService, add } = build();
  let parent = null;
  for (let depth = 0; depth < 30; depth += 1) parent = add(`Level ${depth}`, parent);
  for (let index = 0; index < 20; index += 1) add(`Loose ${index}`);
  const before = db.prepare('SELECT id, parent_item_id, location, updated_at FROM items ORDER BY id').all();

  const prepare = db.prepare.bind(db);
  const statements = [];
  db.prepare = sql => { statements.push(sql); return prepare(sql); };
  const { items } = itemService.hierarchy();
  db.prepare = prepare;

  assert.equal(items.length, 50);
  assert.equal(statements.length, 1);
  assert.match(statements[0].trim(), /^WITH RECURSIVE/);
  assert.deepEqual(db.prepare('SELECT id, parent_item_id, location, updated_at FROM items ORDER BY id').all(), before);
});

test('an empty inventory builds an empty tree', () => {
  const tree = buildTree([]);
  assert.deepEqual(visibleRows(tree, new Set()), []);
  assert.deepEqual(expandableKeys(tree), new Set());
});

test('top-level leaves share one virtual Uncontained items group', () => {
  const single = buildTree([node(1, 'Keyboard')]);
  assert.deepEqual(names(visibleRows(single, new Set())), [`[${UNCONTAINED}]`]);
  assert.equal(visibleRows(single, new Set())[0].childCount, 1);

  const tree = buildTree([node(1, 'Book'), node(2, 'Coffee mug'), node(3, 'Keyboard')]);
  const collapsed = visibleRows(tree, new Set());
  assert.deepEqual(names(collapsed), [`[${UNCONTAINED}]`]);
  assert.equal(collapsed[0].childCount, 3);
  const open = visibleRows(tree, new Set([UNCONTAINED]));
  assert.deepEqual(names(open), [`[${UNCONTAINED}]`, 'Book', 'Coffee mug', 'Keyboard']);
  assert.deepEqual(depths(open), [0, 1, 1, 1]);
  // The group is only a view: none of its rows carries anything but real item nodes.
  assert.ok(open.slice(1).every(row => row.type === 'item'));
});

test('top-level containers are root branches and nesting renders at every depth', () => {
  const items = [node(1, 'Box A'), node(2, 'Camera Bag', 1), node(3, 'Nikon F80', 2), node(4, 'Nikon 50mm', 2),
    node(5, 'VHS tapes', 1), node(6, 'Box B'), node(7, 'ThinkPad T460s', 6), node(8, 'Keyboard')];
  const tree = buildTree(items);
  assert.deepEqual(names(visibleRows(tree, new Set())), ['Box A', 'Box B', `[${UNCONTAINED}]`]);

  const all = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(names(all), ['Box A', 'Camera Bag', 'Nikon F80', 'Nikon 50mm', 'VHS tapes', 'Box B',
    'ThinkPad T460s', `[${UNCONTAINED}]`, 'Keyboard']);
  assert.deepEqual(depths(all), [0, 1, 2, 2, 1, 0, 1, 0, 1]);
  // A collapsed branch keeps its descendants out of the rows entirely.
  assert.deepEqual(names(visibleRows(tree, new Set([1]))), ['Box A', 'Camera Bag', 'VHS tapes', 'Box B', `[${UNCONTAINED}]`]);

  const deep = Array.from({ length: 200 }, (_, index) => node(index + 1, `Level ${index}`, index || null));
  const deepRows = visibleRows(buildTree(deep), expandableKeys(buildTree(deep)));
  assert.equal(deepRows.length, 200);
  assert.equal(deepRows.at(-1).depth, 199);
});

test('search keeps the ancestor path of every match and expands only that path', () => {
  const items = [node(1, 'Box A'), node(2, 'Camera Bag', 1), node(3, 'Nikon F80', 2), node(4, 'Strap', 3),
    node(5, 'VHS tapes', 1), node(6, 'Box B'), node(7, 'Lens cloth', 6), node(8, 'Nikon manual')];
  const tree = buildTree(items);

  const nikon = searchTree(tree, '  NIKON ');
  assert.deepEqual([...nikon.matches].sort(), [3, 8]);
  assert.deepEqual(nikon.expanded, new Set([2, 1, UNCONTAINED]));
  const rows = visibleRows(tree, nikon.expanded, nikon.visible);
  assert.deepEqual(names(rows), ['Box A', 'Camera Bag', 'Nikon F80', `[${UNCONTAINED}]`, 'Nikon manual']);
  // The match's own contents stay reachable, collapsed until opened.
  assert.equal(rows[2].childCount, 1);
  assert.deepEqual(names(visibleRows(tree, new Set([...nikon.expanded, 3]), nikon.visible)).slice(0, 4),
    ['Box A', 'Camera Bag', 'Nikon F80', 'Strap']);
  assert.deepEqual(expandableKeys(tree, nikon.visible), new Set([1, 2, 3, UNCONTAINED]));

  const none = searchTree(tree, 'tripod');
  assert.equal(none.matches.size, 0);
  assert.deepEqual(visibleRows(tree, none.expanded, none.visible), []);
});
