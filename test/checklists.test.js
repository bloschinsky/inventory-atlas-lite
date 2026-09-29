import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Checklists are tested at the service level against an in-memory database, never data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-checklists-test-'));

const { applySchema } = await import('../server/src/db.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { ChecklistRepository } = await import('../server/src/repositories/checklistRepository.js');
const { ChecklistRunRepository } = await import('../server/src/repositories/checklistRunRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { ChecklistRunService } = await import('../server/src/services/checklistRunService.js');
const { ChecklistService } = await import('../server/src/services/checklistService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { countRunItems } = await import('../shared/checklists.js');

const build = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const category = new CategoryService(categoryRepository).create({ name: 'Photo gear' });
  const itemRepository = new ItemRepository(db);
  const itemService = new ItemService({
    itemRepository, customFieldRepository: new CustomFieldRepository(db), itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository
  });
  const checklistRepository = new ChecklistRepository(db);
  const checklistRunRepository = new ChecklistRunRepository(db);
  return {
    db,
    itemService,
    checklists: new ChecklistService({ checklistRepository, checklistRunRepository, itemRepository }),
    runs: new ChecklistRunService({ checklistRepository, checklistRunRepository }),
    add: (name, attributes = {}) => itemService.create({ name, category_id: category.id, ...attributes }),
    rename: (item, name) => itemService.update(item.id, { name, category_id: category.id })
  };
};

const failure = (work, status, code, params) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  if (params) assert.deepEqual(error.params, params);
  return true;
});

const refs = items => items.map(item => ({ item_id: item.id }));
const names = entries => entries.map(entry => entry.name);
const statuses = run => run.items.map(item => item.status);

test('packing and verification checklists keep their items in the chosen order', () => {
  const { add, checklists } = build();
  const [f100, fm2, lens] = [add('Nikon F100', { location: 'Shelf' }), add('Nikon FM2'), add('35mm f/2')];
  const packing = checklists.create({ name: ' Film Trip Kit ', description: 'Weekend', mode: 'packing', items: refs([fm2, f100, lens]) });
  assert.equal(packing.name, 'Film Trip Kit');
  assert.equal(packing.mode, 'packing');
  assert.deepEqual(names(packing.items), ['Nikon FM2', 'Nikon F100', '35mm f/2']);
  assert.equal(packing.items[1].category_name, 'Photo gear');
  assert.equal(packing.items[1].effective_location, 'Shelf');
  assert.equal(packing.items[1].deleted, false);

  const verification = checklists.create({ name: 'Camera shelf', mode: 'verification', items: refs([lens]) });
  assert.equal(verification.mode, 'verification');
  assert.equal(verification.description, null);

  // Reordering and removing keep the existing entries; the order is read back exactly as saved.
  const [fm2Entry, f100Entry, lensEntry] = packing.items;
  const reordered = checklists.update(packing.id, {
    name: 'Film Trip Kit', mode: 'packing', items: [{ id: lensEntry.id }, { id: f100Entry.id }]
  });
  assert.deepEqual(names(reordered.items), ['35mm f/2', 'Nikon F100']);
  assert.deepEqual(names(checklists.get(packing.id).items), ['35mm f/2', 'Nikon F100']);
  assert.equal(reordered.items[0].id, lensEntry.id);
  assert.ok(!reordered.items.some(entry => entry.id === fm2Entry.id));

  assert.deepEqual(checklists.list().map(entry => [entry.name, entry.item_count, entry.last_run]),
    [['Camera shelf', 1, null], ['Film Trip Kit', 2, null]]);
});

test('invalid definitions, unknown items, and duplicate references are refused', () => {
  const { add, checklists } = build();
  const camera = add('Camera');
  failure(() => checklists.create({ name: ' ', mode: 'packing' }), 400, 'CHECKLIST_NAME_REQUIRED');
  failure(() => checklists.create({ name: 'Kit', mode: 'travel' }), 400, 'CHECKLIST_MODE_INVALID');
  failure(() => checklists.create({ name: 'Kit', mode: 'packing', items: 'Camera' }), 400, 'CHECKLIST_ITEMS_INVALID');
  failure(() => checklists.create({ name: 'Kit', mode: 'packing', items: [{ item_id: 'x' }] }), 400, 'CHECKLIST_ITEMS_INVALID');
  failure(() => checklists.create({ name: 'Kit', mode: 'packing', items: [{ item_id: 999 }, { item_id: 998 }] }), 400,
    'CHECKLIST_ITEMS_NOT_FOUND', { count: 2 });
  failure(() => checklists.create({ name: 'Kit', mode: 'packing', items: refs([camera, camera]) }), 400,
    'CHECKLIST_ITEM_DUPLICATE', { name: 'Camera' });

  const kit = checklists.create({ name: 'Kit', mode: 'packing', items: refs([camera]) });
  // Adding an item the checklist already references is a duplicate too.
  failure(() => checklists.update(kit.id, { name: 'Kit', mode: 'packing', items: [{ id: kit.items[0].id }, { item_id: camera.id }] }), 400,
    'CHECKLIST_ITEM_DUPLICATE', { name: 'Camera' });
  // Another checklist's entry cannot be borrowed.
  const other = checklists.create({ name: 'Other', mode: 'packing', items: refs([camera]) });
  failure(() => checklists.update(kit.id, { name: 'Kit', mode: 'packing', items: [{ id: other.items[0].id }] }), 400, 'CHECKLIST_ITEMS_INVALID');
  failure(() => checklists.get(999), 404, 'CHECKLIST_NOT_FOUND');
  failure(() => checklists.remove(999), 404, 'CHECKLIST_NOT_FOUND');
  // Nothing refused was written.
  assert.deepEqual(names(checklists.get(kit.id).items), ['Camera']);
});

test('a run starts pending, records every check, and keeps correct counts', () => {
  const { add, checklists, runs } = build();
  const items = ['Nikon F100', 'Nikon FM2', 'SB-28'].map(name => add(name));
  const packing = checklists.create({ name: 'Film Trip Kit', mode: 'packing', items: refs(items) });

  const run = runs.start(packing.id);
  assert.equal(run.status, 'in_progress');
  assert.equal(run.mode, 'packing');
  assert.equal(run.checklist_name, 'Film Trip Kit');
  assert.equal(run.completed_at, null);
  assert.deepEqual(statuses(run), ['pending', 'pending', 'pending']);
  assert.deepEqual(run.counts, { total: 3, confirmed: 0, missing: 0, pending: 3, checked: 0 });

  const [f100, fm2, flash] = run.items;
  let current = runs.updateItem(run.id, f100.id, { status: 'confirmed' });
  assert.ok(current.items[0].checked_at);
  current = runs.updateItem(run.id, flash.id, { status: 'missing', note: '  Left at home  ' });
  assert.equal(current.items[2].note, 'Left at home');
  assert.deepEqual(current.counts, { total: 3, confirmed: 1, missing: 1, pending: 1, checked: 2 });

  // Correcting a mistake before completion: back to pending clears the check time.
  current = runs.updateItem(run.id, f100.id, { status: 'pending' });
  assert.equal(current.items[0].checked_at, null);
  runs.updateItem(run.id, f100.id, { status: 'confirmed' });
  runs.updateItem(run.id, fm2.id, { status: 'missing' });
  current = runs.updateItem(run.id, fm2.id, { status: 'confirmed' });
  assert.deepEqual(statuses(current), ['confirmed', 'confirmed', 'missing']);
  assert.deepEqual(current.counts, { total: 3, confirmed: 2, missing: 1, pending: 0, checked: 3 });
  assert.deepEqual(countRunItems(current.items), current.counts);

  // A verification run uses the same states; only the interface labels confirmed as Present.
  const verification = checklists.create({ name: 'Shelf check', mode: 'verification', items: refs(items.slice(0, 1)) });
  const check = runs.start(verification.id);
  assert.equal(check.mode, 'verification');
  assert.equal(runs.updateItem(check.id, check.items[0].id, { status: 'confirmed' }).items[0].status, 'confirmed');

  failure(() => runs.updateItem(run.id, f100.id, { status: 'packed' }), 400, 'CHECKLIST_RUN_STATUS_INVALID');
  failure(() => runs.updateItem(run.id, f100.id, {}), 400, 'INVALID_REQUEST');
  failure(() => runs.updateItem(run.id, f100.id, { note: 42 }), 400, 'CHECKLIST_NOTE_INVALID');
  failure(() => runs.updateItem(run.id, f100.id, { note: 'x'.repeat(501) }), 400, 'CHECKLIST_NOTE_TOO_LONG', { max: 500 });
  failure(() => runs.updateItem(run.id, check.items[0].id, { status: 'missing' }), 404, 'CHECKLIST_RUN_ITEM_NOT_FOUND');
  failure(() => runs.get(999), 404, 'CHECKLIST_RUN_NOT_FOUND');
  failure(() => runs.start(999), 404, 'CHECKLIST_NOT_FOUND');
});

test('completing a run makes it read-only history, and running again never touches it', () => {
  const { add, checklists, runs } = build();
  const items = ['Camera', 'Lens', 'Flash'].map(name => add(name));
  const kit = checklists.create({ name: 'Kit', mode: 'packing', items: refs(items) });
  const first = runs.start(kit.id);
  runs.updateItem(first.id, first.items[0].id, { status: 'confirmed' });
  runs.updateItem(first.id, first.items[1].id, { status: 'missing' });

  // Pending items may remain when a run is completed.
  const completed = runs.complete(first.id);
  assert.equal(completed.status, 'completed');
  assert.ok(completed.completed_at);
  assert.deepEqual(completed.counts, { total: 3, confirmed: 1, missing: 1, pending: 1, checked: 2 });
  failure(() => runs.updateItem(first.id, first.items[2].id, { status: 'confirmed' }), 409, 'CHECKLIST_RUN_COMPLETED');
  failure(() => runs.complete(first.id), 409, 'CHECKLIST_RUN_COMPLETED');

  const second = runs.start(kit.id);
  assert.notEqual(second.id, first.id);
  assert.deepEqual(statuses(second), ['pending', 'pending', 'pending']);
  runs.updateItem(second.id, second.items[0].id, { status: 'missing' });
  assert.deepEqual(statuses(runs.get(first.id)), ['confirmed', 'missing', 'pending']);

  const history = runs.listForChecklist(kit.id);
  assert.deepEqual(history.map(run => [run.id, run.status, run.counts.confirmed, run.counts.missing, run.counts.pending]),
    [[second.id, 'in_progress', 0, 1, 2], [first.id, 'completed', 1, 1, 1]]);
  const listed = checklists.list()[0];
  assert.equal(listed.last_run.id, second.id);
  assert.deepEqual(listed.last_run.counts, { total: 3, confirmed: 0, missing: 1, pending: 2, checked: 1 });
});

test('editing a checklist never changes the snapshot of an existing run', () => {
  const { add, checklists, runs } = build();
  const [camera, lens, flash] = ['Camera', 'Lens', 'Flash'].map(name => add(name));
  const kit = checklists.create({ name: 'Kit', mode: 'packing', items: refs([camera, lens]) });
  const run = runs.start(kit.id);

  checklists.update(kit.id, { name: 'Renamed kit', mode: 'verification', items: [{ id: kit.items[1].id }, { item_id: flash.id }] });
  const unchanged = runs.get(run.id);
  assert.equal(unchanged.checklist_name, 'Kit');
  assert.equal(unchanged.mode, 'packing');
  assert.deepEqual(names(unchanged.items), ['Camera', 'Lens']);

  const next = runs.start(kit.id);
  assert.equal(next.checklist_name, 'Renamed kit');
  assert.equal(next.mode, 'verification');
  assert.deepEqual(names(next.items), ['Lens', 'Flash']);
});

test('renamed and deleted items keep run history readable and stay visible in the checklist', () => {
  const { add, checklists, itemService, rename, runs } = build();
  const box = add('Box');
  const [camera, lens] = [add('Camera', { parent_item_id: box.id }), add('Lens')];
  const kit = checklists.create({ name: 'Kit', mode: 'packing', items: refs([camera, lens]) });
  const run = runs.start(kit.id);
  runs.updateItem(run.id, run.items[1].id, { status: 'confirmed' });

  // A rename shows live in the checklist but never rewrites history.
  rename(camera, 'Camera body');
  assert.deepEqual(names(checklists.get(kit.id).items), ['Camera body', 'Lens']);
  assert.deepEqual(names(runs.get(run.id).items), ['Camera', 'Lens']);

  // Moving an item changes nothing about membership.
  itemService.update(camera.id, { name: 'Camera body', category_id: camera.category_id, parent_item_id: null, location: 'Car' });
  assert.equal(checklists.get(kit.id).items[0].effective_location, 'Car');

  // Checklists never block item deletion; the checklist keeps a deleted entry under the last known name.
  itemService.remove(lens.id);
  const afterDelete = checklists.get(kit.id);
  assert.deepEqual(afterDelete.items.map(entry => [entry.name, entry.deleted, entry.item_id]),
    [['Camera body', false, camera.id], ['Lens', true, null]]);
  const history = runs.get(run.id);
  assert.deepEqual(history.items.map(item => [item.name, item.status, item.item_id]), [['Camera', 'pending', camera.id], ['Lens', 'confirmed', null]]);

  // A new run only copies items that still exist; the deleted entry can be kept or removed.
  assert.deepEqual(names(runs.start(kit.id).items), ['Camera body']);
  const kept = checklists.update(kit.id, { name: 'Kit', mode: 'packing', items: afterDelete.items.map(entry => ({ id: entry.id })) });
  assert.equal(kept.items[1].deleted, true);
  const cleaned = checklists.update(kit.id, { name: 'Kit', mode: 'packing', items: [{ id: afterDelete.items[0].id }] });
  assert.deepEqual(names(cleaned.items), ['Camera body']);

  // A checklist left with only deleted items cannot start a run.
  itemService.remove(camera.id);
  failure(() => runs.start(kit.id), 409, 'CHECKLIST_HAS_NO_ITEMS');
  assert.equal(runs.listForChecklist(kit.id).length, 2);
});

test('deleting a checklist keeps its runs as readable history', () => {
  const { add, checklists, db, runs } = build();
  const camera = add('Camera');
  const kit = checklists.create({ name: 'Kit', mode: 'verification', items: refs([camera]) });
  const run = runs.start(kit.id);
  runs.updateItem(run.id, run.items[0].id, { status: 'confirmed' });
  runs.complete(run.id);

  checklists.remove(kit.id);
  failure(() => checklists.get(kit.id), 404, 'CHECKLIST_NOT_FOUND');
  failure(() => runs.listForChecklist(kit.id), 404, 'CHECKLIST_NOT_FOUND');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM checklist_items').get().count, 0);

  const kept = runs.get(run.id);
  assert.equal(kept.checklist_id, null);
  assert.equal(kept.checklist_name, 'Kit');
  assert.deepEqual(kept.items.map(item => [item.name, item.status]), [['Camera', 'confirmed']]);
  assert.deepEqual(runs.list().map(summary => [summary.id, summary.checklist_id, summary.checklist_name]), [[run.id, null, 'Kit']]);
  assert.deepEqual(checklists.list(), []);
});

test('a version 3 database gains the checklist tables in place without losing inventory data', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  db.exec(`
    DROP TABLE checklist_run_items; DROP TABLE checklist_runs; DROP TABLE checklist_items; DROP TABLE checklists;
    INSERT INTO categories (name) VALUES ('Cameras');
    INSERT INTO items (uuid, name, category_id) VALUES ('11111111-1111-4111-8111-111111111111', 'Zenit E', 1);
  `);
  db.pragma('user_version = 3');

  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), 4);
  assert.equal(db.prepare('SELECT name FROM items').get().name, 'Zenit E');
  const checklistRepository = new ChecklistRepository(db);
  const checklistRunRepository = new ChecklistRunRepository(db);
  const checklists = new ChecklistService({ checklistRepository, checklistRunRepository, itemRepository: new ItemRepository(db) });
  const kit = checklists.create({ name: 'Kit', mode: 'packing', items: [{ item_id: 1 }] });
  assert.equal(new ChecklistRunService({ checklistRepository, checklistRunRepository }).start(kit.id).items[0].name, 'Zenit E');
  // Checklist writes advance the database's last update like every other inventory write.
  db.prepare("UPDATE database_metadata SET last_updated_at = '2000-01-01T00:00:00.000Z'").run();
  checklists.update(kit.id, { name: 'Kit 2', mode: 'packing', items: [] });
  assert.notEqual(db.prepare('SELECT last_updated_at FROM database_metadata').get().last_updated_at, '2000-01-01T00:00:00.000Z');
});
