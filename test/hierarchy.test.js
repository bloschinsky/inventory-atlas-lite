import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildCategoryTree, buildLocationTree, categoryKey, expandableKeys, itemMeta, locationKey, ROOT, rowName, searchTree, uncontainedKey, visibleRows } from '../client/src/hierarchyTree.js';
import { fitViewport, graphBounds, GRAPH_NODE_LIMIT, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from '../client/src/hierarchyGraph.js';
import { useHierarchyExpansion } from '../client/src/useHierarchyExpansion.js';
import { computed, nextTick, ref } from 'vue';

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

/*
  Tree items in the shape of the endpoint, for the client tests that need no database. Rows and graph
  nodes are named for readable assertions: `@Home` is a Location, `@-` No location, `#Gaming` a
  Category, `[uncontained]` a location's Uncontained items group, and anything else an item.
*/
const node = (id, name, parentId = null, location = null) =>
  ({ id, uuid: `u${id}`, name, parent_id: parentId, children_count: 0, effective_location: location });
const GROUP = '[uncontained]';
const nameOf = row => (row.type === 'root' ? '[root]' : row.type === 'location' ? `@${row.group.name ?? '-'}`
  : row.type === 'category' ? `#${row.group.name}` : row.type === 'uncontained' ? GROUP : row.item.name);
const names = rows => rows.map(nameOf);
const depths = rows => rows.map(row => row.depth);
const NONE = locationKey('');
const NONE_GROUP = uncontainedKey('');

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
  for (let index = 0; index < 20; index += 1) add(`Loose ${index}`, null, `Room ${index % 4}`);
  const before = db.prepare('SELECT id, parent_item_id, location, updated_at FROM items ORDER BY id').all();

  const prepare = db.prepare.bind(db);
  const statements = [];
  db.prepare = sql => { statements.push(sql); return prepare(sql); };
  const { items } = itemService.hierarchy();
  db.prepare = prepare;

  assert.equal(items.length, 50);
  assert.equal(statements.length, 1);
  assert.match(statements[0].trim(), /^WITH RECURSIVE/);
  // Grouping by location is a client projection of that one response; it needs no further request.
  assert.deepEqual(buildLocationTree(items).groups.map(location => location.itemCount), [5, 5, 5, 5, 30]);
  assert.deepEqual(db.prepare('SELECT id, parent_item_id, location, updated_at FROM items ORDER BY id').all(), before);
});

test('real endpoint data groups each branch by its top-level location and keeps saved locations', () => {
  const { db, itemService, add } = build();
  const box = add('Box A', null, 'KP Garage');
  const bag = add('Camera Bag', box, 'Home');
  add('Nikon F80', bag, 'Office');
  const battery = add('Car battery', null, 'kp garage');
  const adapter = add('Unknown adapter');
  // The item form trims locations; older rows may still hold spaced or blank text.
  db.prepare("UPDATE items SET location = ' kp garage ' WHERE id = ?").run(battery.id);
  db.prepare("UPDATE items SET location = '   ' WHERE id = ?").run(adapter.id);
  const saved = db.prepare('SELECT id, location FROM items ORDER BY id').all();

  const tree = buildLocationTree(itemService.hierarchy().items);
  const all = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(names(all), ['@KP Garage', 'Box A', 'Camera Bag', 'Nikon F80', GROUP, 'Car battery', '@-', GROUP, 'Unknown adapter']);
  assert.deepEqual(tree.groups.map(location => location.itemCount), [4, 1]);
  // The saved locations of the nested items and of the spaced spelling stay exactly as entered.
  assert.deepEqual(db.prepare('SELECT id, location FROM items ORDER BY id').all(), saved);
  assert.deepEqual(saved.map(row => row.location), ['KP Garage', 'Home', 'Office', ' kp garage ', '   ']);
});

test('an empty inventory builds an empty tree', () => {
  const tree = buildLocationTree([]);
  assert.deepEqual(tree.groups, []);
  assert.deepEqual(visibleRows(tree, new Set()), []);
  assert.deepEqual(expandableKeys(tree), new Set());
});

test('named locations are virtual nodes with their own containers and Uncontained items', () => {
  const items = [node(1, 'Box A', null, 'Home'), node(2, 'Camera', 1, 'Home'), node(3, 'Keyboard', null, 'Home'),
    node(4, 'Book', null, 'Home'), node(5, 'Box B', null, 'KP Garage'), node(6, 'Cables', 5, 'KP Garage'),
    node(7, 'Car battery', null, 'KP Garage'), node(8, 'Unknown adapter'), node(9, 'Atlas', null, 'Attic')];
  const tree = buildLocationTree(items);

  // Named locations by name, then No location; nothing but locations sits at the root level.
  const collapsed = visibleRows(tree, new Set());
  assert.deepEqual(names(collapsed), ['@Attic', '@Home', '@KP Garage', '@-']);
  assert.ok(collapsed.every(row => row.type === 'location' && row.parent === ROOT && row.depth === 0));
  assert.deepEqual(collapsed.map(row => row.key), ['location:attic', 'location:home', 'location:kp garage', NONE]);

  const all = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(names(all), ['@Attic', GROUP, 'Atlas', '@Home', 'Box A', 'Camera', GROUP, 'Keyboard', 'Book',
    '@KP Garage', 'Box B', 'Cables', GROUP, 'Car battery', '@-', GROUP, 'Unknown adapter']);
  assert.deepEqual(depths(all.slice(3, 9)), [0, 1, 2, 1, 2, 2]);
  // Every group belongs to one location, under its own key; there is no global group any more.
  const groups = all.filter(row => row.type === 'uncontained');
  assert.deepEqual(groups.map(row => row.key), ['uncontained:attic', 'uncontained:home', 'uncontained:kp garage', NONE_GROUP]);
  assert.deepEqual(groups.map(row => row.parent), ['location:attic', 'location:home', 'location:kp garage', NONE]);
  assert.ok(!all.some(row => row.key === 'uncontained'));
  // A location with only containers has no group, and a location row counts its direct children.
  assert.deepEqual(names(visibleRows(buildLocationTree([node(1, 'Box', null, 'Loft'), node(2, 'Lamp', 1, 'Loft')]), new Set(['location:loft']))),
    ['@Loft', 'Box']);
  assert.equal(all.find(row => row.key === 'location:home').childCount, 2);
});

test('location text is normalized for grouping without touching the items', () => {
  const items = [node(1, 'Drill', null, 'GARAGE'), node(2, 'Saw', null, ' garage '), node(3, 'Hammer', null, 'Garage'),
    node(4, 'Nails', null, 'garage'), node(5, 'Mug', null, '   '), node(6, 'Pen', null, ''), node(7, 'Cup')];
  const copy = structuredClone(items);
  const tree = buildLocationTree(items);

  assert.deepEqual(tree.groups.map(location => [location.key, location.name, location.itemCount]),
    [['location:garage', 'garage', 4], [NONE, null, 3]]);
  const garage = visibleRows(tree, new Set(['location:garage', 'uncontained:garage']));
  assert.deepEqual(names(garage).slice(0, 6), ['@garage', GROUP, 'Drill', 'Saw', 'Hammer', 'Nails']);
  // Grouping never rewrites item data, including the spelling of the saved location.
  assert.deepEqual(items, copy);

  // The display name is the most used spelling, and a tie takes the first in code-point order.
  const named = spellings => buildLocationTree(spellings.map((location, index) => node(index + 1, `Item ${index}`, null, location))).groups[0].name;
  assert.equal(named(['garage', ' Garage', 'Garage ']), 'Garage');
  assert.equal(named(['garage', 'Garage']), 'Garage');
  assert.equal(named(['Garage', 'garage']), 'Garage');
});

test('a branch stays whole under the location of its top-level item', () => {
  // The server sends the root location for nested items, but even a differing value never splits a branch.
  const items = [node(1, 'Box A', null, 'KP Garage'), node(2, 'Camera Bag', 1, 'Home'), node(3, 'Nikon F80', 2, 'Office'),
    node(4, 'Strap', 3, null), node(5, 'Tripod', null, 'Office')];
  const tree = buildLocationTree(items);
  const all = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(names(all), ['@KP Garage', 'Box A', 'Camera Bag', 'Nikon F80', 'Strap', '@Office', GROUP, 'Tripod']);
  assert.deepEqual(depths(all), [0, 1, 2, 3, 4, 0, 1, 2]);
  // Counts include every descendant and no virtual node.
  assert.deepEqual(tree.groups.map(location => [location.name, location.itemCount]), [['KP Garage', 4], ['Office', 1]]);
  assert.equal(all[0].itemCount, 4);
  assert.equal(tree.groupOf.get(4).key, 'location:kp garage');

  const deep = Array.from({ length: 200 }, (_, index) => node(index + 1, `Level ${index}`, index || null, 'Cellar'));
  const deepTree = buildLocationTree(deep);
  const deepRows = visibleRows(deepTree, expandableKeys(deepTree));
  assert.equal(deepRows.length, 201);
  assert.equal(deepRows.at(-1).depth, 200);
  assert.equal(deepRows[0].itemCount, 200);
  // A collapsed branch keeps its descendants out of the rows entirely.
  assert.deepEqual(names(visibleRows(deepTree, new Set(['location:cellar']))), ['@Cellar', 'Level 0']);
});

test('rows are announced by their item, location, or location group name', () => {
  const t = (key, params) => (key === 'hierarchy.noLocation' ? 'No location' : `Uncontained items — ${params.location}`);
  const tree = buildLocationTree([node(1, 'Box', null, ' Home '), node(2, 'Mug'), node(3, 'Lid', 1)]);
  const rows = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(rows.map(row => rowName(row, t)),
    ['Home', 'Box', 'Lid', 'No location', 'Uncontained items — No location', 'Mug']);
});

test('search keeps the location and ancestor path of every match and expands only that path', () => {
  const items = [node(1, 'Box A', null, 'KP Garage'), node(2, 'Camera Bag', 1), node(3, 'Nikon F80', 2), node(4, 'Strap', 3),
    node(5, 'VHS tapes', 1), node(6, 'Box B', null, 'Home'), node(7, 'Lens cloth', 6), node(8, 'Nikon manual')];
  const tree = buildLocationTree(items);

  const nikon = searchTree(tree, '  NIKON ');
  assert.deepEqual([...nikon.matches].sort(), [3, 8]);
  assert.deepEqual(nikon.expanded, new Set([2, 1, 'location:kp garage', NONE, NONE_GROUP]));
  const rows = visibleRows(tree, nikon.expanded, nikon.visible);
  assert.deepEqual(names(rows), ['@KP Garage', 'Box A', 'Camera Bag', 'Nikon F80', '@-', GROUP, 'Nikon manual']);
  // The match's own contents stay reachable, collapsed until opened.
  assert.equal(rows[3].childCount, 1);
  assert.deepEqual(names(visibleRows(tree, new Set([...nikon.expanded, 3]), nikon.visible)).slice(0, 5),
    ['@KP Garage', 'Box A', 'Camera Bag', 'Nikon F80', 'Strap']);
  assert.deepEqual(expandableKeys(tree, nikon.visible), new Set(['location:kp garage', NONE, NONE_GROUP, 1, 2, 3]));
  // A location row keeps counting all of its items while a search narrows its branches.
  assert.equal(rows[0].itemCount, 5);

  const none = searchTree(tree, 'tripod');
  assert.equal(none.matches.size, 0);
  assert.deepEqual(visibleRows(tree, none.expanded, none.visible), []);
});

test('search matches location names and reveals the matching location branch', () => {
  const items = [node(1, 'Tool Box', null, 'KP Garage'), node(2, 'Wrench', 1), node(3, 'Car battery', null, ' kp garage'),
    node(4, 'Garage door remote', null, 'Home'), node(5, 'Book', null, 'Home')];
  const tree = buildLocationTree(items);

  const garage = searchTree(tree, 'GARAGE');
  assert.deepEqual(garage.matches, new Set([4, 'location:kp garage']));
  const rows = visibleRows(tree, garage.expanded, garage.visible);
  // The location opens one level with all of its contents available; the other match keeps its path.
  assert.deepEqual(names(rows), ['@Home', GROUP, 'Garage door remote', '@KP Garage', 'Tool Box', GROUP]);
  assert.equal(rows.find(row => row.key === 'uncontained:kp garage').childCount, 1);
  assert.deepEqual(names(visibleRows(tree, expandableKeys(tree, garage.visible), garage.visible)),
    ['@Home', GROUP, 'Garage door remote', '@KP Garage', 'Tool Box', 'Wrench', GROUP, 'Car battery']);
  // The No location label is interface text, not data, so it is never matched.
  assert.equal(searchTree(buildLocationTree([node(1, 'Mug')]), 'location').matches.size, 0);
});

// Graph view: the same rows laid out as nodes and parent -> child edges, named for readable assertions.
const graphOf = (tree, expanded, visible = null) => layoutGraph(visibleRows(tree, expanded, visible));
const nodeNames = graph => graph.nodes.map(nameOf);
const edgeNames = graph => {
  const byKey = new Map(graph.nodes.map(n => [n.key, nameOf(n)]));
  return graph.edges.map(edge => `${byKey.get(edge.from)} -> ${byKey.get(edge.to)}`);
};
const sample = () => buildLocationTree([node(1, 'Box A', null, 'Home'), node(2, 'Camera Bag', 1), node(3, 'Nikon F80', 2), node(4, 'Nikon 50mm', 2),
  node(5, 'Cables', 1), node(6, 'Box B', null, 'KP Garage'), node(7, 'ThinkPad T460s', 6), node(8, 'Keyboard', null, 'Home'),
  node(9, 'Coffee mug')]);
const HOME = 'location:home';

test('the graph draws the location nodes under the virtual root', () => {
  assert.deepEqual(layoutGraph([]).nodes.map(n => n.key), [ROOT]);
  const tree = sample();
  const collapsed = graphOf(tree, new Set());
  assert.deepEqual(nodeNames(collapsed), ['[root]', '@Home', '@KP Garage', '@-']);
  assert.deepEqual(edgeNames(collapsed), ['[root] -> @Home', '[root] -> @KP Garage', '[root] -> @-']);
  assert.equal(collapsed.nodes[0].type, 'root');
  assert.deepEqual(collapsed.nodes.slice(1).map(n => [n.type, n.itemCount, n.childCount]), [['location', 6, 2], ['location', 2, 1], ['location', 1, 1]]);
});

test('graph edges follow the locations and parent_id at every level and are the same data as the tree', () => {
  const tree = sample();
  const all = graphOf(tree, expandableKeys(tree));
  assert.deepEqual(edgeNames(all), ['[root] -> @Home', '@Home -> Box A', 'Box A -> Camera Bag', 'Camera Bag -> Nikon F80',
    'Camera Bag -> Nikon 50mm', 'Box A -> Cables', `@Home -> ${GROUP}`, `${GROUP} -> Keyboard`, '[root] -> @KP Garage',
    '@KP Garage -> Box B', 'Box B -> ThinkPad T460s', '[root] -> @-', `@- -> ${GROUP}`, `${GROUP} -> Coffee mug`]);
  for (const edge of all.edges) {
    const child = tree.byId.get(edge.to);
    if (typeof edge.from === 'number') assert.equal(child.parent_id, edge.from);
    else if (child) assert.equal(child.parent_id, null);
  }
  // Every node has exactly one incoming edge, so the edge target alone identifies an edge.
  assert.equal(new Set(all.edges.map(edge => edge.to)).size, all.edges.length);
  // Left to right: each child sits one column after its parent, and each parent midway along its children.
  const at = new Map(all.nodes.map(n => [n.key, n.position]));
  for (const edge of all.edges) assert.ok(at.get(edge.to).x > at.get(edge.from).x);
  assert.equal(at.get(2).y, (at.get(3).y + at.get(4).y) / 2);
  assert.equal(at.get(HOME).y, (at.get(1).y + at.get('uncontained:home').y) / 2);
});

test('collapsing a graph branch removes its descendants and expanding restores them', () => {
  const tree = sample();
  const open = graphOf(tree, new Set([HOME, 1, 2]));
  assert.deepEqual(nodeNames(open), ['[root]', '@Home', 'Box A', 'Camera Bag', 'Nikon F80', 'Nikon 50mm', 'Cables', GROUP, '@KP Garage', '@-']);
  const closed = graphOf(tree, new Set([HOME, 2]));
  assert.deepEqual(nodeNames(closed), ['[root]', '@Home', 'Box A', GROUP, '@KP Garage', '@-']);
  assert.equal(closed.edges.length, closed.nodes.length - 1);
  // Collapsing a location hides its whole branch, whatever is opened inside it.
  assert.deepEqual(nodeNames(graphOf(tree, new Set([1, 2]))), ['[root]', '@Home', '@KP Garage', '@-']);
  // The layout is recomputed without the gap the hidden branch took, and is the same every time.
  assert.ok(closed.nodes.at(-1).position.y < open.nodes.at(-1).position.y);
  assert.deepEqual(graphOf(tree, new Set([HOME, 1, 2])), open);
});

test('graph nodes never overlap, however the branches are opened', () => {
  const tree = sample();
  for (const expanded of [new Set(), new Set([HOME, 1]), expandableKeys(tree), new Set([NONE, NONE_GROUP, 'location:kp garage', 6])]) {
    const { nodes } = graphOf(tree, expanded);
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b) continue;
        const apart = Math.abs(a.position.x - b.position.x) >= NODE_WIDTH || Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT;
        assert.ok(apart, `${nameOf(a)} overlaps ${nameOf(b)}`);
      }
    }
  }
});

test('a graph search reveals the nested match with its location and path and fits around it', () => {
  const tree = sample();
  const nikon = searchTree(tree, 'f80');
  const graph = graphOf(tree, nikon.expanded, nikon.visible);
  assert.deepEqual(nodeNames(graph), ['[root]', '@Home', 'Box A', 'Camera Bag', 'Nikon F80']);
  const bounds = graphBounds(graph.nodes, nikon.matches);
  assert.deepEqual(bounds, { ...graph.nodes.at(-1).position, width: NODE_WIDTH, height: NODE_HEIGHT });
  // A matching location is a graph node as well, so a location search fits around it.
  const garage = searchTree(tree, 'garage');
  const garageGraph = graphOf(tree, garage.expanded, garage.visible);
  assert.deepEqual(nodeNames(garageGraph), ['[root]', '@KP Garage', 'Box B']);
  assert.ok(graphBounds(garageGraph.nodes, garage.matches));
  // One node is centred at no more than 100%; a huge area is shown from its start at the minimum zoom.
  assert.deepEqual(fitViewport({ x: 0, y: 0, width: 240, height: 64 }, 1000, 500, 0.1), { x: 380, y: 218, zoom: 1 });
  const huge = fitViewport({ x: 0, y: 0, width: 100000, height: 100000 }, 1000, 500, 0.1);
  assert.deepEqual(huge, { x: 50, y: 25, zoom: 0.1 });
});

test('a large collapsed inventory draws only the visible nodes and the node limit still applies', () => {
  const items = Array.from({ length: 2000 }, (_, index) => node(index + 1, `Loose ${index}`, null, `Room ${index % 2}`));
  items.push(node(3000, 'Crate', null, 'Room 0'), ...Array.from({ length: 500 }, (_, index) => node(3001 + index, `Packed ${index}`, 3000)));
  const tree = buildLocationTree(items);
  const graph = graphOf(tree, new Set());
  assert.deepEqual(nodeNames(graph), ['[root]', '@Room 0', '@Room 1']);
  assert.deepEqual(graph.nodes.slice(1).map(n => n.itemCount), [1501, 1000]);
  assert.deepEqual(nodeNames(graphOf(tree, new Set(['location:room 0']))), ['[root]', '@Room 0', 'Crate', GROUP, '@Room 1']);
  // Opening a large branch exceeds the limit the Graph view checks before drawing (rows + the root).
  const rows = visibleRows(tree, new Set(['location:room 0', 3000]));
  assert.equal(rows.length, 504);
  assert.ok(rows.length + 1 > GRAPH_NODE_LIMIT);
  assert.ok(visibleRows(tree, new Set(['location:room 0'])).length + 1 <= GRAPH_NODE_LIMIT);
});

/*
  Category projection. Ids of the sample categories are chosen so that id order differs from name
  order; `children_count` is the physical count the endpoint sends, which a category row must not use.
*/
const CATEGORIES = { Photography: 1, Containers: 2, Accessories: 3, 'Computer Equipment': 4 };
const item = (id, name, category, parentId = null, location = null, childrenCount = 0) =>
  ({ ...node(id, name, parentId, location), category_id: CATEGORIES[category], category_name: category, children_count: childrenCount });
const catalog = () => [
  item(1, 'Box A', 'Containers', null, 'KP Garage', 1),
  item(2, 'Nikon F65', 'Photography', 1, 'KP Garage', 3),
  item(3, 'Nikon 50mm', 'Photography', 2, 'KP Garage'),
  item(4, 'Film Roll', 'Photography', 2, 'KP Garage'),
  item(5, 'Battery', 'Accessories', 2, 'KP Garage'),
  // Camera -> Camera Bag -> Lens: the bag of another category sits between two photography items.
  item(6, 'Camera', 'Photography', null, 'Home', 1),
  item(7, 'Camera Bag', 'Containers', 6, 'Home', 1),
  item(8, 'Lens', 'Photography', 7, 'Home'),
  item(9, 'Main PC', 'Computer Equipment', null, 'Office', 2),
  item(10, 'ASUS Motherboard', 'Computer Equipment', 9, 'Office', 1),
  item(11, 'Ryzen 7 3700X', 'Computer Equipment', 10, 'Office'),
  item(12, 'RTX 3060', 'Computer Equipment', 9, 'Office'),
  item(13, 'ThinkPad T14s', 'Computer Equipment')
];
const PHOTO = categoryKey(CATEGORIES.Photography);
const COMPUTER = categoryKey(CATEGORIES['Computer Equipment']);
const rowByName = (rows, name) => rows.find(row => row.type === 'item' && row.item.name === name);

test('every category is one virtual node keyed by its id and counting its items', () => {
  const tree = buildCategoryTree(catalog());
  assert.equal(tree.mode, 'category');
  const collapsed = visibleRows(tree, new Set());
  // Categories by name, never by id; nothing but categories sits at the root level.
  assert.deepEqual(names(collapsed), ['#Accessories', '#Computer Equipment', '#Containers', '#Photography']);
  assert.ok(collapsed.every(row => row.type === 'category' && row.parent === ROOT && row.depth === 0));
  assert.deepEqual(collapsed.map(row => row.key), ['category:3', 'category:4', 'category:2', 'category:1']);
  // Each count is every item of the category, wherever it is stored; virtual nodes are never counted.
  assert.deepEqual(collapsed.map(row => row.itemCount), [1, 5, 2, 5]);
  // Two categories with one name stay two nodes, because the key is the id.
  const twins = buildCategoryTree([{ ...node(1, 'A'), category_id: 7, category_name: 'Tools' }, { ...node(2, 'B'), category_id: 8, category_name: 'Tools' }]);
  assert.deepEqual(twins.groups.map(group => group.key), ['category:7', 'category:8']);
  assert.deepEqual(buildCategoryTree([]).groups, []);
});

test('the category projection keeps only direct same-category nesting and shows every item once', () => {
  const items = catalog();
  const copy = structuredClone(items);
  const tree = buildCategoryTree(items);
  const all = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(names(all), ['#Accessories', 'Battery',
    '#Computer Equipment', 'Main PC', 'ASUS Motherboard', 'Ryzen 7 3700X', 'RTX 3060', 'ThinkPad T14s',
    '#Containers', 'Box A', 'Camera Bag',
    '#Photography', 'Nikon F65', 'Nikon 50mm', 'Film Roll', 'Camera', 'Lens']);
  assert.deepEqual(depths(all.slice(2, 8)), [0, 1, 2, 3, 2, 1]);
  // Every item appears exactly once, and there is no Uncontained items group in this grouping.
  const itemRows = all.filter(row => row.type === 'item');
  assert.equal(itemRows.length, items.length);
  assert.equal(new Set(itemRows.map(row => row.key)).size, items.length);
  assert.ok(!all.some(row => row.type === 'uncontained'));

  // A cross-category parent is left out: Nikon F65 is a root of Photography, and Box A never enters it.
  assert.equal(rowByName(all, 'Nikon F65').parent, PHOTO);
  assert.equal(rowByName(all, 'Box A').group.name, 'Containers');
  // No relation is invented across the bag: Lens stays a root of Photography, not a child of Camera.
  assert.equal(rowByName(all, 'Lens').parent, PHOTO);
  assert.equal(rowByName(all, 'Camera').childCount, 0);
  assert.equal(rowByName(all, 'Camera Bag').parent, categoryKey(CATEGORIES.Containers));
  // Same-category nesting holds at any depth.
  assert.equal(rowByName(all, 'Ryzen 7 3700X').parent, 10);
  assert.equal(rowByName(all, 'ASUS Motherboard').parent, 9);

  // Counts follow the projection, not the physical children_count (3, with the battery).
  const nikon = rowByName(all, 'Nikon F65');
  assert.equal(nikon.item.children_count, 3);
  assert.deepEqual([nikon.childCount, nikon.contentCount], [2, 2]);
  assert.deepEqual([rowByName(all, 'Camera').contentCount, rowByName(all, 'Main PC').contentCount], [0, 2]);
  assert.deepEqual(expandableKeys(tree), new Set(['category:3', 'category:4', 'category:2', 'category:1', 2, 9, 10]));
  // The projection never rewrites the items.
  assert.deepEqual(items, copy);
});

test('category rows keep the location and the direct physical container as metadata', () => {
  const t = (key, params) => (key === 'hierarchy.storedIn' ? `Stored inside: ${params.name}` : key);
  const categoryTree = buildCategoryTree(catalog());
  const rows = visibleRows(categoryTree, expandableKeys(categoryTree));
  const meta = name => itemMeta(rowByName(rows, name), t);
  assert.equal(meta('Nikon F65'), 'KP Garage · Stored inside: Box A');
  assert.equal(meta('Lens'), 'Home · Stored inside: Camera Bag');
  assert.equal(meta('Battery'), 'KP Garage · Stored inside: Nikon F65');
  // The container is not repeated when it is the parent shown, and a loose item has only its location.
  assert.equal(meta('Nikon 50mm'), 'KP Garage');
  assert.equal(rowByName(rows, 'Nikon 50mm').storedIn, null);
  assert.equal(meta('ThinkPad T14s'), '');
  assert.equal(rowByName(rows, 'Battery').storedIn.id, 2);

  // In the location grouping every container is the parent shown, so the line stays category · location.
  const locationTree = buildLocationTree(catalog());
  const locationRows = visibleRows(locationTree, expandableKeys(locationTree));
  assert.ok(locationRows.filter(row => row.type === 'item').every(row => row.storedIn === null));
  assert.equal(itemMeta(rowByName(locationRows, 'Nikon F65'), t), 'Photography · KP Garage');
  assert.equal(rowByName(locationRows, 'Nikon F65').contentCount, 3);
});

test('category search matches item and category names with same-category paths only', () => {
  const tree = buildCategoryTree(catalog());

  const ryzen = searchTree(tree, 'RYZEN');
  assert.deepEqual(ryzen.matches, new Set([11]));
  assert.deepEqual(ryzen.expanded, new Set([10, 9, COMPUTER]));
  assert.deepEqual(names(visibleRows(tree, ryzen.expanded, ryzen.visible)), ['#Computer Equipment', 'Main PC', 'ASUS Motherboard', 'Ryzen 7 3700X']);

  // A cross-category physical parent is never inserted into the path.
  const lens = searchTree(tree, 'lens');
  assert.deepEqual(names(visibleRows(tree, lens.expanded, lens.visible)), ['#Photography', 'Lens']);
  const film = searchTree(tree, 'film');
  assert.deepEqual(names(visibleRows(tree, film.expanded, film.visible)), ['#Photography', 'Nikon F65', 'Film Roll']);
  assert.ok(!film.visible.has(1));

  // A matching category opens one level with all of its items available.
  const photo = searchTree(tree, 'photo');
  assert.deepEqual(photo.matches, new Set([PHOTO]));
  assert.deepEqual(names(visibleRows(tree, photo.expanded, photo.visible)), ['#Photography', 'Nikon F65', 'Camera', 'Lens']);
  assert.deepEqual(names(visibleRows(tree, expandableKeys(tree, photo.visible), photo.visible)),
    ['#Photography', 'Nikon F65', 'Nikon 50mm', 'Film Roll', 'Camera', 'Lens']);

  // The same query gives the result of each projection.
  const locationTree = buildLocationTree(catalog());
  const inLocation = searchTree(locationTree, 'film');
  assert.deepEqual(names(visibleRows(locationTree, inLocation.expanded, inLocation.visible)), ['@KP Garage', 'Box A', 'Nikon F65', 'Film Roll']);
  assert.equal(searchTree(tree, 'garage').matches.size, 0);
  assert.equal(rowName(visibleRows(tree, new Set())[0], () => 'unused'), 'Accessories');
});

test('the category graph draws the category projection deterministically within the node limit', () => {
  const tree = buildCategoryTree(catalog());
  const graph = graphOf(tree, new Set([PHOTO, COMPUTER, 2, 9, 10]));
  assert.deepEqual(edgeNames(graph), ['[root] -> #Accessories', '[root] -> #Computer Equipment', '#Computer Equipment -> Main PC',
    'Main PC -> ASUS Motherboard', 'ASUS Motherboard -> Ryzen 7 3700X', 'Main PC -> RTX 3060', '#Computer Equipment -> ThinkPad T14s',
    '[root] -> #Containers', '[root] -> #Photography', '#Photography -> Nikon F65', 'Nikon F65 -> Nikon 50mm', 'Nikon F65 -> Film Roll',
    '#Photography -> Camera', '#Photography -> Lens']);
  // An item edge exists only where the projection keeps the direct same-category parent.
  for (const edge of graph.edges) {
    if (typeof edge.from !== 'number') continue;
    const child = tree.byId.get(edge.to);
    assert.equal(child.parent_id, edge.from);
    assert.equal(tree.byId.get(edge.from).category_id, child.category_id);
  }
  assert.deepEqual(graphOf(buildCategoryTree(catalog()), new Set([PHOTO, COMPUTER, 2, 9, 10])), graph);
  assert.deepEqual(nodeNames(graphOf(tree, new Set([PHOTO]))), ['[root]', '#Accessories', '#Computer Equipment', '#Containers', '#Photography', 'Nikon F65', 'Camera', 'Lens']);

  const many = Array.from({ length: 600 }, (_, index) => ({ ...node(index + 1, `Game ${index}`), category_id: 1, category_name: 'Gaming' }));
  const large = buildCategoryTree(many);
  assert.deepEqual(nodeNames(graphOf(large, new Set())), ['[root]', '#Gaming']);
  assert.ok(visibleRows(large, new Set([categoryKey(1)])).length + 1 > GRAPH_NODE_LIMIT);
});

test('real endpoint data projects by category and reading it writes nothing', () => {
  const { db, itemService } = build();
  const photography = db.prepare("INSERT INTO categories (name) VALUES ('Photography')").run().lastInsertRowid;
  const storage = db.prepare("SELECT id FROM categories WHERE name = 'Storage'").get().id;
  const add = (name, category, parent = null, location = null) =>
    itemService.create({ name, category_id: category, location, parent_item_id: parent?.id ?? null });
  const box = add('Box A', storage, null, 'KP Garage');
  const camera = add('Nikon F65', photography, box);
  add('Nikon 50mm', photography, camera);
  const bag = add('Camera Bag', storage, camera);
  add('Lens', photography, bag);
  const before = db.prepare('SELECT id, parent_item_id, category_id, location, updated_at FROM items ORDER BY id').all();

  const tree = buildCategoryTree(itemService.hierarchy().items);
  const rows = visibleRows(tree, expandableKeys(tree));
  assert.deepEqual(names(rows), ['#Photography', 'Lens', 'Nikon F65', 'Nikon 50mm', '#Storage', 'Box A', 'Camera Bag']);
  assert.deepEqual(rows.filter(row => row.type === 'category').map(row => [row.key, row.itemCount]),
    [[categoryKey(photography), 3], [categoryKey(storage), 2]]);
  const t = (key, params) => `in ${params.name}`;
  assert.equal(itemMeta(rowByName(rows, 'Lens'), t), 'KP Garage · in Camera Bag');
  assert.equal(itemMeta(rowByName(rows, 'Camera Bag'), t), 'KP Garage · in Nikon F65');
  assert.deepEqual(db.prepare('SELECT id, parent_item_id, category_id, location, updated_at FROM items ORDER BY id').all(), before);
});

test('each grouping keeps its own opened branches while Tree and Graph share them', async () => {
  const items = ref(catalog());
  const group = ref('location');
  const query = ref('');
  const tree = computed(() => (group.value === 'category' ? buildCategoryTree : buildLocationTree)(items.value));
  const search = computed(() => (query.value.trim() ? searchTree(tree.value, query.value) : null));
  const { rows, toggle, expandAll, collapseAll } = useHierarchyExpansion(tree, search);

  toggle('location:kp garage');
  toggle(1);
  assert.deepEqual(names(rows.value).slice(0, 3), ['@Home', '@KP Garage', 'Box A']);
  assert.ok(rowByName(rows.value, 'Nikon F65'));

  // Item 2 was never opened in this grouping, and the location keys mean nothing here.
  group.value = 'category';
  assert.deepEqual(names(rows.value), ['#Accessories', '#Computer Equipment', '#Containers', '#Photography']);
  toggle(PHOTO);
  toggle(2);
  assert.deepEqual(names(rows.value).slice(3), ['#Photography', 'Nikon F65', 'Nikon 50mm', 'Film Roll', 'Camera', 'Lens']);

  group.value = 'location';
  assert.deepEqual(names(rows.value), ['@Home', '@KP Garage', 'Box A', 'Nikon F65', '@Office', '@-']);
  group.value = 'category';
  assert.equal(rows.value.length, 9);
  collapseAll();
  assert.equal(rows.value.length, 4);
  expandAll();
  assert.equal(rows.value.length, 17);

  // A search switched to the other grouping is recomputed for that projection.
  query.value = 'film';
  await nextTick();
  assert.deepEqual(names(rows.value), ['#Photography', 'Nikon F65', 'Film Roll']);
  group.value = 'location';
  await nextTick();
  assert.deepEqual(names(rows.value), ['@KP Garage', 'Box A', 'Nikon F65', 'Film Roll']);
  query.value = '';
  await nextTick();
  assert.deepEqual(names(rows.value), ['@Home', '@KP Garage', 'Box A', 'Nikon F65', '@Office', '@-']);
});
