import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer, stopServer } from './serverProcess.js';

// Item activity history at the service level against in-memory databases, and its API against a
// temporary server. Nothing here touches data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-history-test-'));

const { applySchema, SCHEMA_VERSION } = await import('../server/src/db.js');
const { BulkReplaceRepository } = await import('../server/src/repositories/bulkReplaceRepository.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { BulkReplaceService } = await import('../server/src/services/bulkReplaceService.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { ItemHistoryService, detectChanges } = await import('../server/src/services/itemHistoryService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemTransferService } = await import('../server/src/services/itemTransferService.js');

const NOW = '2026-10-09T12:00:00.000Z';

// `clock.now` is the current time every service reads; tests move it explicitly.
const build = ({ db = new Database(':memory:') } = {}) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const clock = { now: NOW };
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemHistoryRepository = new ItemHistoryRepository(db);
  const itemHistoryService = new ItemHistoryService({ itemHistoryRepository, now: () => clock.now });
  const itemService = new ItemService({
    itemRepository, customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository, itemHistoryService
  });
  const category = new CategoryService(categoryRepository).create({ name: 'Gear' });
  const add = (name, parent = null, attributes = {}) => itemService.create({ name, category_id: category.id, parent_item_id: parent?.id ?? null, ...attributes });
  // Saves the item form as the browser does: every current value, with the given ones changed.
  const edit = (item, changes = {}) => {
    const current = itemService.get(item.id);
    return itemService.update(item.id, {
      ...current, field_values: Object.fromEntries(current.fields.map(field => [field.id, field.value])), ...changes
    });
  };
  const events = (item, query = {}) => itemService.activity(item.id, { limit: 50, ...query }).events;
  const count = table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  return {
    db, clock, category, itemService, itemHistoryService, itemHistoryRepository, itemRepository, add, edit, events, count,
    transfers: new ItemTransferService({ itemRepository, itemHistoryRepository, itemHistoryService }),
    bulkReplace: new BulkReplaceService({ bulkReplaceRepository: new BulkReplaceRepository(db), itemHistoryService }),
    row: item => db.prepare('SELECT * FROM items WHERE id = ?').get(item.id)
  };
};

const failure = (work, status, code) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected ${status} ${code}, received ${error.status} ${error.code}`);
  assert.equal(error.code, code);
  return true;
});

const summary = event => [event.type, event.from ?? event.from_item?.name ?? null, event.to ?? event.to_item?.name ?? null];

test('saving unchanged values, unrelated edits, and formatting-only location changes record nothing', () => {
  const { add, edit, count } = build();
  const box = add('Box', null, { location: 'Garage', transferred_to: 'Anna' });
  add('Camera', box);

  edit(box);
  edit(box, { name: 'Box 01', description: 'Blue lid', condition_grade: 'good', is_new: true });
  edit(box, { location: '  garage ', transferred_to: 'ANNA ' });
  assert.equal(count('item_events'), 0);
  assert.equal(count('item_operations'), 0);
});

test('moving a container records one location change for it and every descendant, at any depth', () => {
  const { add, edit, events, row, db } = build();
  const box = add('Box 03', null, { location: 'Garage' });
  const bag = add('Bag', box, { location: 'Old shelf' });
  const camera = add('Camera', bag);
  const lens = add('Lens', camera, { location: 'Kitchen' });
  const untouched = add('Elsewhere', null, { location: 'Garage' });
  const before = [bag, camera, lens].map(row);

  edit(box, { location: 'Attic' });

  assert.deepEqual(events(box).map(summary), [['location_changed', 'Garage', 'Attic']]);
  assert.equal(events(box)[0].via_item, null);
  for (const item of [bag, camera, lens]) {
    const [event, ...rest] = events(item);
    assert.deepEqual(rest, []);
    assert.deepEqual(summary(event), ['location_changed', 'Garage', 'Attic']);
    assert.deepEqual(event.via_item, { id: box.id, name: 'Box 03', exists: true });
    assert.equal(event.operation_id, events(box)[0].operation_id);
  }
  // A location-only move never rewrites the descendants' own location or container.
  assert.deepEqual([bag, camera, lens].map(row).map(({ updated_at: _, ...rest }) => rest), before.map(({ updated_at: _, ...rest }) => rest));
  assert.deepEqual(events(untouched), []);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT operation_id) AS count FROM item_events').get().count, 1);
});

test('reparenting within the same effective location records only the moved item\'s container change', () => {
  const { add, edit, events } = build();
  const shelfA = add('Shelf A', null, { location: 'Garage' });
  const shelfB = add('Shelf B', null, { location: ' garage' });
  const box = add('Box', shelfA);
  const camera = add('Camera', box);

  edit(box, { parent_item_id: shelfB.id });

  assert.deepEqual(events(box).map(summary), [['container_changed', 'Shelf A', 'Shelf B']]);
  assert.deepEqual(events(camera), []);
  assert.deepEqual(events(shelfA), []);
});

test('a container and location change of one save are two events of one operation', () => {
  const { add, edit, events } = build();
  const garageBox = add('Garage box', null, { location: 'Garage' });
  const atticBox = add('Attic box', null, { location: 'Attic' });
  const camera = add('Camera', garageBox);
  const film = add('Film', camera);

  edit(camera, { parent_item_id: atticBox.id });

  const recorded = events(camera);
  assert.deepEqual(recorded.map(summary).sort(), [['container_changed', 'Garage box', 'Attic box'], ['location_changed', 'Garage', 'Attic']]);
  assert.equal(new Set(recorded.map(event => event.operation_id)).size, 1);
  assert.equal(recorded.find(event => event.type === 'location_changed').via_item, null);
  // The film moved with the camera; its own container did not change.
  assert.deepEqual(events(film).map(summary), [['location_changed', 'Garage', 'Attic']]);
  assert.equal(events(film)[0].via_item.name, 'Camera');
});

test('an inherited item records its saved location only once it becomes effective', () => {
  const { add, edit, events } = build();
  const box = add('Box', null, { location: 'Garage' });
  const camera = add('Camera', box, { location: 'Old desk' });

  edit(camera, { location: 'Kitchen' });
  assert.deepEqual(events(camera), [], 'the visible location stayed the inherited one');

  edit(camera, { parent_item_id: null, location: 'Kitchen' });
  assert.deepEqual(events(camera).map(summary).sort(), [['container_changed', 'Box', null], ['location_changed', 'Garage', 'Kitchen']]);

  // Taking an item out with No location is a move to no location, not a resurrection of an old value.
  const lens = add('Lens', box, { location: 'Stale shelf' });
  edit(lens, { parent_item_id: null, location: null });
  assert.deepEqual(events(lens).find(event => event.type === 'location_changed').to, null);
});

test('bulk move records each affected descendant once, skips unchanged roots, and keeps hierarchy', () => {
  const { add, itemService, events, db } = build();
  const target = add('Box B4', null, { location: 'Attic' });
  const box = add('Box A', null, { location: 'Garage' });
  const camera = add('Camera', box);
  const film = add('Film', camera);
  const already = add('Already there', target);

  // Overlapping selection: the box, a child, and a grandchild of it.
  const result = itemService.bulkMove({ item_ids: [film.id, box.id, camera.id, already.id], parent_item_id: target.id });
  assert.deepEqual(result.moved_root_ids, [box.id]);

  assert.deepEqual(events(box).map(summary).sort(), [['container_changed', null, 'Box B4'], ['location_changed', 'Garage', 'Attic']]);
  for (const item of [camera, film]) {
    assert.deepEqual(events(item).map(summary), [['location_changed', 'Garage', 'Attic']]);
    assert.equal(events(item)[0].via_item.name, 'Box A');
  }
  assert.deepEqual(events(already), []);
  assert.equal(events(box)[0].operation_type, 'bulk_move');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM item_operations').get().count, 1);

  // Repeating the same move changes nothing and records nothing.
  itemService.bulkMove({ item_ids: [box.id], parent_item_id: target.id });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM item_events').get().count, 4);
});

test('hundreds of descendants and deep nesting get exactly one event each in one operation', () => {
  const { add, itemService, db } = build();
  const target = add('Van', null, { location: 'Driveway' });
  const root = add('Crate', null, { location: 'Garage' });
  // A chain 40 levels deep plus 300 siblings spread under it.
  let parent = root;
  const chain = [];
  for (let depth = 0; depth < 40; depth++) chain.push(parent = add(`Level ${depth}`, parent));
  for (let index = 0; index < 300; index++) add(`Leaf ${index}`, chain[index % chain.length]);

  itemService.bulkMove({ item_ids: [root.id], parent_item_id: target.id });

  const rows = db.prepare(`SELECT item_id, event_type, COUNT(*) AS count FROM item_events GROUP BY item_id, event_type`).all();
  const locationEvents = rows.filter(row => row.event_type === 'location_changed');
  assert.equal(locationEvents.length, 341);
  assert.ok(locationEvents.every(row => row.count === 1));
  assert.deepEqual(rows.filter(row => row.event_type === 'container_changed').map(row => row.item_id), [root.id]);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT operation_id) AS count FROM item_events').get().count, 1);
});

test('a failure after the change or while recording leaves neither the change nor any history', () => {
  const { add, edit, row, count, itemHistoryRepository, itemHistoryService } = build();
  const box = add('Box', null, { location: 'Garage' });
  add('Camera', box);
  const before = row(box);

  const insertEvents = itemHistoryRepository.insertEvents;
  itemHistoryRepository.insertEvents = () => { throw new Error('disk full'); };
  assert.throws(() => edit(box, { location: 'Attic' }), /disk full/);
  itemHistoryRepository.insertEvents = insertEvents;
  assert.deepEqual(row(box), before);
  assert.equal(count('item_operations'), 0);

  assert.throws(() => itemHistoryService.track('item_update', [box.id], () => {
    itemHistoryRepository.db.prepare("UPDATE items SET location = 'Attic' WHERE id = ?").run(box.id);
    throw new Error('refused');
  }), /refused/);
  assert.deepEqual(row(box), before);
  assert.equal(count('item_events'), 0);
});

test('bulk replace of Location and Transferred To is recorded; other fields are not', () => {
  const { add, bulkReplace, events } = build();
  const box = add('Box', null, { location: 'Garage', transferred_to: 'Anna', condition_notes: 'Dusty' });
  const camera = add('Camera', box, { location: 'Garage' });

  bulkReplace.apply({ field: { type: 'core', key: 'location' }, from: 'garage', to: 'Attic' });
  bulkReplace.apply({ field: { type: 'core', key: 'transferredTo' }, from: 'Anna', to: 'Olena' });
  bulkReplace.apply({ field: { type: 'core', key: 'conditionNotes' }, from: 'Dusty', to: 'Clean' });

  assert.deepEqual(events(box).map(summary), [['recipient_changed', 'Anna', 'Olena'], ['location_changed', 'Garage', 'Attic']]);
  assert.ok(events(box).every(event => event.operation_type === 'bulk_replace'));
  // The camera's own saved value was replaced too, but its visible location came from the box.
  assert.deepEqual(events(camera).map(summary), [['location_changed', 'Garage', 'Attic']]);
  assert.equal(events(camera)[0].via_item.name, 'Box');
});

test('Transferred To edits in the item form are recipient changes, never loans', () => {
  const { add, edit, events, count } = build();
  const camera = add('Camera');

  edit(camera, { transferred_to: 'Volodia' });
  edit(camera, { transferred_to: 'volodia' });
  edit(camera, { transferred_to: 'Olena' });
  edit(camera, { transferred_to: '' });

  assert.deepEqual(events(camera).map(summary), [
    ['recipient_changed', 'Olena', null], ['recipient_changed', 'volodia', 'Olena'], ['recipient_changed', null, 'Volodia']
  ]);
  assert.equal(count('item_transfers'), 0);
  assert.deepEqual(events(camera, { type: 'location' }), []);
});

test('a loan is an explicit period: transfer, return, and another transfer', () => {
  const { add, transfers, clock, events, itemService, row } = build();
  const camera = add('Camera', null, { location: 'Office' });

  const first = transfers.start(camera.id, { recipient: ' Volodia ', transferred_at: '2026-10-01T09:00:00.000Z', expected_return_on: '2026-10-05', note: 'With charger' });
  assert.equal(first.recipient, 'Volodia');
  assert.equal(row(camera).transferred_to, 'Volodia');
  assert.deepEqual(itemService.get(camera.id).open_transfer.id, first.id);
  failure(() => transfers.start(camera.id, { recipient: 'Olena' }), 409, 'TRANSFER_ALREADY_OPEN');

  clock.now = '2026-10-04T15:30:00.000Z';
  const returned = transfers.markReturned(camera.id, first.id, { note: 'All good' });
  assert.equal(returned.returned_at, '2026-10-04T15:30:00.000Z');
  assert.equal(row(camera).transferred_to, null);
  assert.equal(itemService.get(camera.id).open_transfer, null);
  failure(() => transfers.markReturned(camera.id, first.id, {}), 409, 'TRANSFER_ALREADY_RETURNED');
  failure(() => transfers.start(camera.id, { recipient: 'Olena', transferred_at: '2026-10-03T00:00:00.000Z' }), 400, 'TRANSFER_OVERLAPS_PREVIOUS');

  clock.now = NOW;
  const second = transfers.start(camera.id, { recipient: 'Olena' });
  assert.equal(second.transferred_at, NOW);

  const recorded = events(camera);
  assert.deepEqual(recorded.map(event => [event.type, event.transfer.id]), [['transferred', second.id], ['returned', first.id], ['transferred', first.id]]);
  const closed = recorded.find(event => event.type === 'returned').transfer;
  assert.deepEqual([closed.transferred_at, closed.returned_at, closed.note, closed.return_note],
    ['2026-10-01T09:00:00.000Z', '2026-10-04T15:30:00.000Z', 'With charger', 'All good']);
  // A loan is not a move and not a recipient edit.
  assert.deepEqual(events(camera, { type: 'location' }), []);
  assert.ok(recorded.every(event => event.type !== 'recipient_changed'));
  assert.equal(row(camera).location, 'Office');
});

test('loan validation: recipient, dates, notes, and the loan a return names', () => {
  const { add, transfers, row } = build();
  const camera = add('Camera');
  const other = add('Other');

  failure(() => transfers.start(camera.id, {}), 400, 'TRANSFER_RECIPIENT_REQUIRED');
  failure(() => transfers.start(camera.id, { recipient: '   ' }), 400, 'TRANSFER_RECIPIENT_REQUIRED');
  failure(() => transfers.start(camera.id, { recipient: 'x'.repeat(256) }), 400, 'TRANSFERRED_TO_TOO_LONG');
  failure(() => transfers.start(camera.id, { recipient: 'Anna', transferred_at: 'yesterday' }), 400, 'INVALID_TRANSFER_DATE');
  // A local time without its zone could be read in the server's zone, so it is refused.
  failure(() => transfers.start(camera.id, { recipient: 'Anna', transferred_at: '2026-10-01T10:00' }), 400, 'INVALID_TRANSFER_DATE');
  failure(() => transfers.start(camera.id, { recipient: 'Anna', transferred_at: '2026-10-10T12:00:00Z' }), 400, 'TRANSFER_DATE_IN_FUTURE');
  failure(() => transfers.start(camera.id, { recipient: 'Anna', expected_return_on: '2026-02-30' }), 400, 'INVALID_EXPECTED_RETURN_DATE');
  failure(() => transfers.start(camera.id, { recipient: 'Anna', expected_return_on: '2026-10-01' }), 400, 'EXPECTED_RETURN_BEFORE_TRANSFER');
  failure(() => transfers.start(camera.id, { recipient: 'Anna', note: 'x'.repeat(1001) }), 400, 'TRANSFER_NOTE_TOO_LONG');
  failure(() => transfers.start(camera.id, { recipient: 'Anna', note: 5 }), 400, 'INVALID_TRANSFER_NOTE');
  failure(() => transfers.start(999, { recipient: 'Anna' }), 404, 'ITEM_NOT_FOUND');
  assert.equal(row(camera).transferred_to, null);

  const loan = transfers.start(camera.id, { recipient: 'Anna', transferred_at: '2026-10-08T12:00:00Z' });
  failure(() => transfers.markReturned(other.id, loan.id, {}), 404, 'TRANSFER_NOT_FOUND');
  failure(() => transfers.markReturned(camera.id, 'abc', {}), 404, 'TRANSFER_NOT_FOUND');
  failure(() => transfers.markReturned(camera.id, loan.id, { returned_at: '2026-10-07T12:00:00Z' }), 400, 'RETURN_BEFORE_TRANSFER');
  // A recipient changed by hand during the loan is kept by the return.
  transfers.items.setTransferredTo(camera.id, 'Anna and Petro');
  transfers.markReturned(camera.id, loan.id, {});
  assert.equal(row(camera).transferred_to, 'Anna and Petro');
});

test('history pages are newest first, stable across equal timestamps, and filterable', () => {
  const { add, edit, events, itemService, transfers, clock } = build();
  const camera = add('Camera', null, { location: 'L0' });
  const other = add('Other', null, { location: 'X' });
  // Every change happens at exactly the same time; the id orders them.
  for (let index = 1; index <= 45; index++) edit(camera, { location: `L${index}` });
  clock.now = '2026-10-09T13:00:00.000Z';
  transfers.start(camera.id, { recipient: 'Anna' });
  edit(other, { location: 'Y' });

  const seen = [];
  let cursor;
  do {
    const page = itemService.activity(camera.id, { limit: 20, cursor });
    assert.ok(page.events.length <= 20);
    seen.push(...page.events);
    cursor = page.next_cursor;
  } while (cursor);
  assert.equal(seen.length, 46);
  assert.equal(new Set(seen.map(event => event.id)).size, 46);
  assert.equal(seen[0].type, 'transferred');
  assert.deepEqual(seen.slice(1, 4).map(event => event.to), ['L45', 'L44', 'L43']);
  assert.equal(seen.at(-1).to, 'L1');

  assert.deepEqual(events(camera, { type: 'transfer' }).map(event => event.type), ['transferred']);
  assert.equal(events(camera, { type: 'location' }).length, 45);
  assert.deepEqual(events(camera, { type: 'lifecycle' }), []);
  assert.equal(itemService.activity(camera.id).events.length, 20, 'the default page size');
  assert.equal(itemService.activity(camera.id, { limit: 500 }).events.length, 46);

  failure(() => itemService.activity(camera.id, { type: 'everything' }), 400, 'INVALID_HISTORY_FILTER');
  failure(() => itemService.activity(camera.id, { cursor: 'abc' }), 400, 'INVALID_HISTORY_CURSOR');
  // A cursor of another item's history is not a position in this one.
  failure(() => itemService.activity(camera.id, { cursor: String(events(other)[0].id) }), 400, 'INVALID_HISTORY_CURSOR');
  failure(() => itemService.activity(999, {}), 404, 'ITEM_NOT_FOUND');
});

test('history stays readable after renames and deletions; a permanent delete removes the item\'s own history', () => {
  const { add, edit, events, itemService, transfers, count } = build();
  const box = add('Box 03', null, { location: 'Garage' });
  const camera = add('Camera', box);
  edit(camera, { parent_item_id: null, location: 'Desk' });
  edit(box, { name: 'Renamed box' });

  const containerChange = () => events(camera).find(event => event.type === 'container_changed');
  assert.deepEqual(containerChange().from_item, { id: box.id, name: 'Box 03', exists: true });

  edit(box, { location: 'Attic' });
  itemService.remove(box.id);
  assert.deepEqual(containerChange().from_item, { id: box.id, name: 'Box 03', exists: false });
  assert.equal(count('item_operations'), 1, 'operations that only grouped the deleted item\'s events are gone');

  transfers.start(camera.id, { recipient: 'Anna' });
  itemService.remove(camera.id);
  assert.deepEqual([count('item_events'), count('item_operations'), count('item_transfers')], [0, 0, 0]);
});

test('detectChanges names the highest changed item above one reached from several of them', () => {
  const rows = location => [
    { id: 2, top_id: 1, top_name: 'Box', depth: 1, parent_item_id: 1, parent_name: 'Box', location, transferred_to: null },
    { id: 2, top_id: 2, top_name: 'Bag', depth: 0, parent_item_id: 1, parent_name: 'Box', location, transferred_to: null },
    { id: 1, top_id: 1, top_name: 'Box', depth: 0, parent_item_id: null, parent_name: null, location, transferred_to: null }
  ];
  assert.deepEqual(detectChanges(rows('Garage'), rows('Attic')), [
    { item_id: 2, event_type: 'location_changed', from_value: 'Garage', to_value: 'Attic', via_item_id: 1, via_item_name: 'Box' },
    { item_id: 1, event_type: 'location_changed', from_value: 'Garage', to_value: 'Attic' }
  ]);
});

test('an older database gains the history tables without any fabricated events', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const category = db.prepare("INSERT INTO categories (name) VALUES ('Old gear')").run().lastInsertRowid;
  db.prepare("INSERT INTO items (uuid, name, category_id, location, transferred_to) VALUES (?, 'Camera', ?, 'Garage', 'Anna')")
    .run(crypto.randomUUID(), category);
  db.exec('DROP TABLE item_events; DROP TABLE item_transfers; DROP TABLE item_operations;');
  db.pragma('user_version = 7');

  const { count, itemService } = build({ db });
  assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION);
  assert.deepEqual([count('item_events'), count('item_operations'), count('item_transfers')], [0, 0, 0]);
  assert.deepEqual(itemService.activity(1, {}), { events: [], next_cursor: null });
  // History starts with the first real change after the upgrade.
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'item_events_%'").all();
  assert.equal(triggers.length, 3);
});

/*
  Capacity: 100,000 events over 10,000 items in a file database, as a heavily used inventory might
  collect over years. The thresholds are functional: the item timeline must be answered from its
  index, a page must come back far below interactive limits even on a slow CI machine, and a box move
  must stay cheap with that much history around it. The measured sizes are reported, not asserted
  against a guess. `scripts/history-benchmark.mjs` runs the same measurement at 1,000,000 events.
*/
test('100,000 events: measured footprint, indexed timeline pages, and a group move', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'inventory-history-capacity-'));
  try {
    const db = new Database(path.join(directory, 'inventory.sqlite'));
    const { itemService, add } = build({ db });
    const { fillHistory, measureHistory } = await import('../scripts/history-benchmark.mjs');
    const { items } = fillHistory(db, { items: 10000, events: 100000 });
    const measured = measureHistory(db, itemService, { add });
    t.diagnostic(JSON.stringify(measured));

    assert.equal(measured.events, 100000 + measured.moveEvents);
    assert.match(measured.plan, /idx_item_events_item/);
    assert.ok(measured.firstPageMs < 250, `first page took ${measured.firstPageMs} ms`);
    assert.ok(measured.deepPageMs < 250, `a deep page took ${measured.deepPageMs} ms`);
    assert.ok(measured.moveMs < 2000, `the group move took ${measured.moveMs} ms`);
    assert.equal(measured.moveEvents, 202);
    // The events stay compact: well under half a kilobyte per event including both indexes.
    assert.ok(measured.historyBytes / 100000 < 512, `${measured.historyBytes / 100000} bytes per event`);
    assert.ok(items > 0);
    db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the history API pages, validates, records loans, and travels in the backup', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-history-api-'));
  const { child, base } = await startServer(dataDir);
  const call = async (method, url, body) => {
    const response = await fetch(`${base}${url}`, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const category = (await call('POST', '/api/categories', { name: 'Gear' })).body;
    const box = (await call('POST', '/api/items', { name: 'Box', category_id: category.id, location: 'Garage' })).body;
    const camera = (await call('POST', '/api/items', { name: 'Camera', category_id: category.id, parent_item_id: box.id })).body;
    const updated = await call('PUT', `/api/items/${box.uuid}`, { name: 'Box', category_id: box.category_id, location: 'Attic' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.location, 'Attic');

    const history = await call('GET', `/api/items/${camera.uuid}/history?type=location&limit=5`);
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.events.map(event => [event.type, event.from, event.to, event.via_item.name]), [['location_changed', 'Garage', 'Attic', 'Box']]);
    assert.equal(history.body.next_cursor, null);
    assert.equal((await call('GET', `/api/items/${camera.id}/history?type=nope`)).body.error.code, 'INVALID_HISTORY_FILTER');
    assert.equal((await call('GET', `/api/items/${camera.id}/history?cursor=x`)).status, 400);
    assert.equal((await call('GET', '/api/items/999/history')).status, 404);

    const started = await call('POST', `/api/items/${camera.id}/transfers`, { recipient: 'Volodia', expected_return_on: '2099-01-01' });
    assert.equal(started.status, 201);
    assert.equal((await call('GET', `/api/items/${camera.id}`)).body.open_transfer.recipient, 'Volodia');
    assert.equal((await call('POST', `/api/items/${camera.id}/transfers`, { recipient: 'Olena' })).status, 409);
    const returned = await call('POST', `/api/items/${camera.id}/transfers/${started.body.id}/return`);
    assert.equal(returned.status, 200);
    assert.ok(returned.body.returned_at);
    assert.equal((await call('GET', `/api/items/${camera.id}`)).body.transferred_to, null);

    // The downloaded backup carries the history, and a restore of it keeps it.
    const backup = Buffer.from(await (await fetch(`${base}/api/backup`)).arrayBuffer());
    const copy = path.join(dataDir, 'copy.sqlite');
    fs.writeFileSync(copy, backup);
    const restored = new Database(copy, { readonly: true });
    assert.deepEqual(restored.prepare('SELECT event_type FROM item_events ORDER BY id').all().map(row => row.event_type),
      ['location_changed', 'location_changed', 'transferred', 'returned']);
    restored.close();
  } finally {
    await stopServer(child);
    await rm(dataDir, { recursive: true, force: true });
  }
});
