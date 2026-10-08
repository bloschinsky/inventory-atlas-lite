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
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
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
    itemHistoryService: new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) }),
    itemRepository, customFieldRepository: new CustomFieldRepository(db), itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository
  });
  const checklistRepository = new ChecklistRepository(db);
  const checklistRunRepository = new ChecklistRunRepository(db);
  return {
    db,
    itemService,
    checklists: new ChecklistService({ checklistRepository, checklistRunRepository, itemRepository }),
    runs: new ChecklistRunService({ checklistRepository, checklistRunRepository, itemRepository }),
    checklistRunRepository,
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
  assert.deepEqual(runs.list().map(summary => [summary.id, summary.checklist_id, summary.checklist_name, summary.source]), [[run.id, null, 'Kit', 'checklist']]);
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
  assert.equal(Number(db.pragma('user_version', { simple: true })), 8);
  assert.equal(db.prepare('SELECT name FROM items').get().name, 'Zenit E');
  const checklistRepository = new ChecklistRepository(db);
  const checklistRunRepository = new ChecklistRunRepository(db);
  const checklists = new ChecklistService({ checklistRepository, checklistRunRepository, itemRepository: new ItemRepository(db) });
  const kit = checklists.create({ name: 'Kit', mode: 'packing', items: [{ item_id: 1 }] });
  const runs = new ChecklistRunService({ checklistRepository, checklistRunRepository, itemRepository: new ItemRepository(db) });
  assert.equal(runs.start(kit.id).items[0].name, 'Zenit E');
  // Checklist writes advance the database's last update like every other inventory write.
  db.prepare("UPDATE database_metadata SET last_updated_at = '2000-01-01T00:00:00.000Z'").run();
  checklists.update(kit.id, { name: 'Kit 2', mode: 'packing', items: [] });
  assert.notEqual(db.prepare('SELECT last_updated_at FROM database_metadata').get().last_updated_at, '2000-01-01T00:00:00.000Z');
});

// Phase 2: Last verified and container audits.
const lastVerified = (db, item) => db.prepare('SELECT last_verified_at FROM items WHERE id = ?').get(item.id).last_verified_at;
const itemRow = (db, item) => db.prepare('SELECT * FROM items WHERE id = ?').get(item.id);
const mark = (runs, run, name, status) => runs.updateItem(run.id, run.items.find(item => item.name === name).id, { status });
const setCheckedAt = (db, run, name, checkedAt) => db.prepare('UPDATE checklist_run_items SET checked_at = ? WHERE run_id = ? AND item_name_snapshot = ?')
  .run(checkedAt, run.id, name);

test('a version 4 database gains Last verified and the audit columns in place', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT, description TEXT, condition TEXT, location TEXT,
      parent_item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE checklist_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, checklist_id INTEGER, checklist_name_snapshot TEXT NOT NULL,
      mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress', started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO categories (name) VALUES ('Cameras');
    INSERT INTO items (uuid, name, category_id) VALUES ('11111111-1111-4111-8111-111111111111', 'Zenit E', 1);
    INSERT INTO checklist_runs (checklist_name_snapshot, mode, status) VALUES ('Old kit', 'verification', 'completed');
  `);
  db.pragma('user_version = 4');

  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), 8);
  assert.deepEqual(db.prepare('SELECT name, last_verified_at FROM items').get(), { name: 'Zenit E', last_verified_at: null });
  assert.deepEqual(db.prepare('SELECT checklist_name_snapshot, source, source_container_item_id, source_container_name_snapshot, audit_scope FROM checklist_runs').get(),
    { checklist_name_snapshot: 'Old kit', source: 'checklist', source_container_item_id: null, source_container_name_snapshot: null, audit_scope: null });
  // Applying the schema again changes nothing.
  applySchema(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM checklist_runs').get().count, 1);
});

test('only a completed verification run records Last verified, and only for Present items', () => {
  const { add, checklists, db, itemService, runs } = build();
  const [camera, lens, flash, meter] = ['Camera', 'Lens', 'Flash', 'Meter'].map(name => add(name));
  assert.equal(itemService.get(camera.id).last_verified_at, null);

  // Packing never verifies anything, even when every item is Packed.
  const packing = runs.start(checklists.create({ name: 'Kit', mode: 'packing', items: refs([camera, lens]) }).id);
  mark(runs, packing, 'Camera', 'confirmed');
  mark(runs, packing, 'Lens', 'confirmed');
  runs.complete(packing.id);
  assert.equal(lastVerified(db, camera), null);

  const shelf = checklists.create({ name: 'Shelf', mode: 'verification', items: refs([camera, lens, flash, meter]) });
  const run = runs.start(shelf.id);
  mark(runs, run, 'Camera', 'confirmed');
  mark(runs, run, 'Lens', 'missing');
  mark(runs, run, 'Meter', 'confirmed');
  // An in-progress run records nothing; Present taken back before completion is never recorded.
  assert.equal(lastVerified(db, camera), null);
  mark(runs, run, 'Meter', 'pending');
  itemService.remove(flash.id);
  const itemBefore = itemRow(db, camera);

  const completed = runs.complete(run.id);
  const checkedAt = completed.items.find(item => item.name === 'Camera').checked_at;
  assert.ok(checkedAt);
  assert.equal(lastVerified(db, camera), checkedAt);
  assert.equal(itemService.get(camera.id).last_verified_at, checkedAt);
  assert.equal(lastVerified(db, lens), null);
  assert.equal(lastVerified(db, meter), null);
  // Recording a verification is not an edit: every other column stays as it was.
  assert.deepEqual({ ...itemRow(db, camera), last_verified_at: null }, { ...itemBefore, last_verified_at: null });

  // Completing again is refused and changes nothing.
  failure(() => runs.complete(run.id), 409, 'CHECKLIST_RUN_COMPLETED');
  assert.equal(lastVerified(db, camera), checkedAt);
});

test('Last verified keeps the newest verification whatever order runs complete in', () => {
  const { add, checklists, db, runs } = build();
  const camera = add('Camera');
  const shelf = checklists.create({ name: 'Shelf', mode: 'verification', items: refs([camera]) });
  const older = runs.start(shelf.id);
  const newer = runs.start(shelf.id);
  mark(runs, older, 'Camera', 'confirmed');
  mark(runs, newer, 'Camera', 'confirmed');
  setCheckedAt(db, older, 'Camera', '2026-09-01 10:00:00');
  setCheckedAt(db, newer, 'Camera', '2026-09-28 19:46:00');

  runs.complete(newer.id);
  assert.equal(lastVerified(db, camera), '2026-09-28 19:46:00');
  runs.complete(older.id);
  assert.equal(lastVerified(db, camera), '2026-09-28 19:46:00');

  const latest = runs.start(shelf.id);
  mark(runs, latest, 'Camera', 'confirmed');
  setCheckedAt(db, latest, 'Camera', '2026-09-30 08:00:00');
  runs.complete(latest.id);
  assert.equal(lastVerified(db, camera), '2026-09-30 08:00:00');
});

test('completing a run and recording Last verified succeed or fail together', () => {
  const { add, checklistRunRepository, checklists, db, runs } = build();
  const camera = add('Camera');
  const run = runs.start(checklists.create({ name: 'Shelf', mode: 'verification', items: refs([camera]) }).id);
  mark(runs, run, 'Camera', 'confirmed');

  const record = checklistRunRepository.recordVerifiedItems;
  checklistRunRepository.recordVerifiedItems = () => { throw new Error('disk full'); };
  assert.throws(() => runs.complete(run.id), /disk full/);
  checklistRunRepository.recordVerifiedItems = record;
  assert.equal(runs.get(run.id).status, 'in_progress');
  assert.equal(runs.get(run.id).completed_at, null);
  assert.equal(lastVerified(db, camera), null);

  assert.equal(runs.complete(run.id).status, 'completed');
  assert.ok(lastVerified(db, camera));
});

test('Audit contents snapshots the direct or the nested contents of a container', () => {
  const { add, checklists, itemService, runs } = build();
  const box = add('Box B4', { location: 'Garage' });
  const pouch = add('Pouch', { parent_item_id: box.id });
  add('Nikon FM2', { parent_item_id: box.id });
  add('Nikon F100', { parent_item_id: box.id });
  add('Cable', { parent_item_id: pouch.id });
  const batteries = add('Batteries', { parent_item_id: pouch.id });
  add('Outside', { location: 'Garage' });

  const details = itemService.get(box.id);
  assert.equal(details.children.length, 3);
  assert.equal(details.descendant_count, 5);
  assert.equal(itemService.get(batteries.id).descendant_count, 0);

  // Direct contents is the default scope; the container itself is never expected.
  const direct = runs.startAudit(box.uuid);
  assert.deepEqual([direct.source, direct.mode, direct.audit_scope, direct.container_id, direct.container_name, direct.checklist_id],
    ['container_audit', 'verification', 'direct', box.id, 'Box B4', null]);
  assert.deepEqual(names(direct.items), ['Nikon F100', 'Nikon FM2', 'Pouch']);
  assert.deepEqual(statuses(direct), ['pending', 'pending', 'pending']);

  // Every descendant exactly once, each under its own container.
  const nested = runs.startAudit(box.id, { scope: 'nested' });
  assert.equal(nested.audit_scope, 'nested');
  assert.deepEqual(names(nested.items), ['Nikon F100', 'Nikon FM2', 'Pouch', 'Batteries', 'Cable']);

  // Audits are not reusable checklists: the Checklists list stays empty however often they run.
  runs.startAudit(box.id);
  assert.deepEqual(checklists.list(), []);
  assert.deepEqual(runs.list().map(run => run.source), ['container_audit', 'container_audit', 'container_audit']);
  assert.deepEqual(runs.listForContainer(box.id).map(run => run.audit_scope), ['direct', 'nested', 'direct']);
  assert.deepEqual(runs.listForContainer(pouch.id), []);

  failure(() => runs.startAudit(box.id, { scope: 'everything' }), 400, 'CHECKLIST_AUDIT_SCOPE_INVALID');
  failure(() => runs.startAudit(batteries.id), 409, 'CHECKLIST_AUDIT_NO_CONTENTS');
  failure(() => runs.startAudit(999), 404, 'ITEM_NOT_FOUND');
  failure(() => runs.listForContainer(999), 404, 'ITEM_NOT_FOUND');
  // A refused audit leaves no run behind.
  assert.equal(runs.list().length, 3);
});

test('an audit keeps its snapshot over moves, renames, and container deletion and never moves items', () => {
  const { add, db, itemService, runs } = build();
  const box = add('Box B4', { location: 'Garage' });
  const shelf = add('Shelf', { location: 'Attic' });
  const camera = add('Camera', { parent_item_id: box.id, location: 'Own spot' });
  const lens = add('Lens', { parent_item_id: box.id });
  const flash = add('Flash', { parent_item_id: box.id });
  const audit = runs.startAudit(box.id);

  // The run expected what the box held when it started, even after Flash moves elsewhere.
  itemService.update(flash.id, { name: 'Flash', category_id: flash.category_id, parent_item_id: shelf.id });
  itemService.update(box.id, { name: 'Box B5', category_id: box.category_id, location: 'Garage' });
  const kept = runs.get(audit.id);
  assert.deepEqual(names(kept.items), ['Camera', 'Flash', 'Lens']);
  assert.deepEqual([kept.container_name, kept.checklist_name], ['Box B4', 'Box B4']);
  assert.equal(itemService.get(box.id).name, 'Box B5');

  mark(runs, kept, 'Camera', 'confirmed');
  mark(runs, kept, 'Flash', 'confirmed');
  mark(runs, kept, 'Lens', 'missing');
  // Addressing a run item by the inventory item's UUID, as a future scanner would.
  const byUuid = runs.updateInventoryItem(audit.id, lens.uuid, { status: 'missing', note: 'Not in the box' });
  assert.equal(byUuid.items.find(item => item.name === 'Lens').note, 'Not in the box');
  failure(() => runs.updateInventoryItem(audit.id, shelf.uuid, { status: 'confirmed' }), 404, 'CHECKLIST_RUN_ITEM_NOT_FOUND');
  failure(() => runs.updateInventoryItem(audit.id, 'no-such-item', { status: 'confirmed' }), 404, 'ITEM_NOT_FOUND');

  const before = [camera, lens, flash].map(item => itemRow(db, item));
  runs.complete(audit.id);
  failure(() => runs.updateInventoryItem(audit.id, lens.uuid, { status: 'confirmed' }), 409, 'CHECKLIST_RUN_COMPLETED');
  // Evidence only: no container, location, or other column changes, Present or Missing.
  [camera, lens, flash].forEach((item, index) => {
    assert.deepEqual({ ...itemRow(db, item), last_verified_at: null }, { ...before[index], last_verified_at: null });
  });
  assert.ok(lastVerified(db, flash));
  assert.equal(lastVerified(db, lens), null);
  assert.equal(itemService.get(flash.id).parent.id, shelf.id);
  assert.equal(itemService.get(flash.id).effective_location, 'Attic');
  assert.equal(itemService.get(camera.id).effective_location, 'Garage');
  assert.equal(itemService.get(camera.id).location, 'Own spot');

  // Containment rules are unchanged: the box still cannot go inside what it holds.
  failure(() => itemService.update(box.id, { name: 'Box B5', category_id: box.category_id, parent_item_id: camera.id }), 400, 'ITEM_PARENT_CYCLE');

  // Deleting the emptied container keeps the audit readable under its snapshot name.
  for (const item of [camera, lens]) itemService.update(item.id, { name: item.name, category_id: item.category_id, parent_item_id: null });
  itemService.remove(box.id);
  const history = runs.get(audit.id);
  assert.deepEqual([history.container_id, history.container_name, history.status], [null, 'Box B4', 'completed']);
  assert.deepEqual(history.items.map(item => [item.name, item.status]), [['Camera', 'confirmed'], ['Flash', 'confirmed'], ['Lens', 'missing']]);
  assert.deepEqual(runs.list().map(run => [run.source, run.container_id, run.container_name]), [['container_audit', null, 'Box B4']]);
});

test('a nested audit copies each descendant once even over a damaged cycle', () => {
  const { add, db, runs } = build();
  const box = add('Box');
  const pouch = add('Pouch', { parent_item_id: box.id });
  const cable = add('Cable', { parent_item_id: pouch.id });
  // Cycles cannot be created through the API; this simulates a damaged row.
  db.pragma('foreign_keys = OFF');
  db.prepare('UPDATE items SET parent_item_id = ? WHERE id = ?').run(cable.id, box.id);
  db.pragma('foreign_keys = ON');
  assert.deepEqual(names(runs.startAudit(box.id, { scope: 'nested' }).items), ['Pouch', 'Cable']);
});
