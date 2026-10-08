import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer, stopServer } from './serverProcess.js';

// Persisted photo order and the cover photo it defines, at the schema, service, and API level, without
// the working database in data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-photo-order-test-'));

const { applySchema, CURRENT_SCHEMA, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { ChecklistRepository } = await import('../server/src/repositories/checklistRepository.js');
const { ChecklistRunRepository } = await import('../server/src/repositories/checklistRunRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { PhotoService } = await import('../server/src/services/photoService.js');

const build = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemPhotoRepository = new ItemPhotoRepository(db);
  const category = new CategoryService(categoryRepository).create({ name: 'Cameras' });
  const itemService = new ItemService({
    itemHistoryService: new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) }),
    itemRepository, customFieldRepository: new CustomFieldRepository(db), itemPhotoRepository, categoryRepository
  });
  const add = (name, parent_item_id = null) => itemService.create({ name, category_id: category.id, parent_item_id });
  return { db, itemRepository, itemService, photoService: new PhotoService({ itemRepository, itemPhotoRepository }), add };
};

const files = (...names) => names.map(name => ({ originalname: name, mimetype: 'image/png', buffer: Buffer.from(name) }));
const order = photos => photos.map(photo => [photo.filename, photo.sort_order]);
const names = (itemService, item) => itemService.get(item.id).photos.map(photo => photo.filename);
const positions = (db, item) => db.prepare('SELECT sort_order FROM item_photos WHERE item_id = ? ORDER BY sort_order').all(item.id)
  .map(row => row.sort_order);

const failure = (work, status, code) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  return true;
});

// A version 6 database: the current tables and triggers, but photos ordered only by their id.
const legacyDatabase = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  db.exec(`
    DROP INDEX idx_photos_item_order;
    ALTER TABLE item_photos DROP COLUMN sort_order;
    INSERT INTO categories (name) VALUES ('Cameras');
    INSERT INTO items (uuid, name, category_id) VALUES
      ('11111111-1111-4111-8111-111111111111', 'Zenit E', 1),
      ('22222222-2222-4222-8222-222222222222', 'Kiev 4', 1);
    INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES
      (2, 'kiev-front.png', 'image/png', x'00'),
      (1, 'zenit-front.png', 'image/png', x'00'),
      (2, 'kiev-back.png', 'image/png', x'00'),
      (1, 'zenit-back.png', 'image/png', x'00'),
      (1, 'zenit-lens.png', 'image/png', x'00');
    UPDATE database_metadata SET last_updated_at = '2026-01-01T00:00:00.000Z', schema_version = 6;
  `);
  db.pragma('user_version = 6');
  return db;
};

test('a fresh database orders photos with a unique position per item', () => {
  const { db, add, photoService } = build();
  assert.ok(CURRENT_SCHEMA.item_photos.includes('sort_order'));
  const column = db.prepare('PRAGMA table_info(item_photos)').all().find(row => row.name === 'sort_order');
  assert.equal(column.notnull, 1);
  const index = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_photos_item_order'").get();
  assert.match(index.sql, /UNIQUE INDEX .* ON item_photos\(item_id, sort_order\)/);
  const item = add('Zenit E');
  photoService.addToItem(item.id, files('a.png'));
  assert.throws(() => db.prepare("INSERT INTO item_photos (item_id, filename, mime_type, data, sort_order) VALUES (?, 'b.png', 'image/png', x'00', 0)")
    .run(item.id), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('existing photos migrate in id order per item, so every cover stays the same', () => {
  const db = legacyDatabase();
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 8);
  const rows = db.prepare('SELECT item_id, filename, sort_order FROM item_photos ORDER BY item_id, sort_order').all();
  assert.deepEqual(rows.map(row => [row.item_id, row.filename, row.sort_order]), [
    [1, 'zenit-front.png', 0], [1, 'zenit-back.png', 1], [1, 'zenit-lens.png', 2],
    [2, 'kiev-front.png', 0], [2, 'kiev-back.png', 1]
  ]);
  const thumbnails = new ItemRepository(db).listHierarchy().map(node => [node.name, node.thumbnail_id]);
  assert.deepEqual(thumbnails, [['Kiev 4', 1], ['Zenit E', 2]]);
  // The migration is not an inventory edit, and running the schema again changes nothing.
  assert.equal(db.prepare('SELECT last_updated_at FROM database_metadata').get().last_updated_at, '2026-01-01T00:00:00.000Z');
  applySchema(db);
  assert.deepEqual(db.prepare('SELECT item_id, filename, sort_order FROM item_photos ORDER BY item_id, sort_order').all(), rows);
  // The update trigger dropped for the migration is back.
  db.prepare('UPDATE item_photos SET filename = filename WHERE id = 1').run();
  assert.notEqual(db.prepare('SELECT last_updated_at FROM database_metadata').get().last_updated_at, '2026-01-01T00:00:00.000Z');
});

test('a version 6 backup is migrated by restore validation with its photo order', async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-photo-order-restore-')), 'backup.sqlite');
  legacyDatabase(new Database(file)).close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.schemaVersion, SCHEMA_VERSION);
  assert.equal(summary.migratedFrom, 6);
  assert.equal(summary.photos, 5);
  const migrated = new Database(file, { readonly: true });
  try {
    assert.deepEqual(migrated.prepare('SELECT filename FROM item_photos WHERE item_id = 1 ORDER BY sort_order').all().map(row => row.filename),
      ['zenit-front.png', 'zenit-back.png', 'zenit-lens.png']);
  } finally {
    migrated.close();
  }
});

test('uploads keep their submitted order and append after the existing photos', () => {
  const { db, add, itemService, photoService } = build();
  const item = add('Zenit E');
  assert.deepEqual(order(photoService.addToItem(item.id, files('first.png'))), [['first.png', 0]]);
  assert.deepEqual(order(photoService.addToItem(item.id, files('c.png', 'a.png', 'b.png'))), [['c.png', 1], ['a.png', 2], ['b.png', 3]]);
  assert.deepEqual(order(itemService.get(item.id).photos), [['first.png', 0], ['c.png', 1], ['a.png', 2], ['b.png', 3]]);
  // Another item has its own positions.
  const other = add('Kiev 4');
  assert.deepEqual(order(photoService.addToItem(other.id, files('kiev.png'))), [['kiev.png', 0]]);
  assert.deepEqual(positions(db, item), [0, 1, 2, 3]);
});

test('a reorder stores the complete new order and the first photo becomes the cover', () => {
  const { db, add, itemService, photoService } = build();
  const item = add('Zenit E');
  const [a, b, c, d] = photoService.addToItem(item.id, files('a.png', 'b.png', 'c.png', 'd.png'));
  const updated = photoService.reorder(item.id, [c.id, a.id, b.id, d.id]);
  assert.deepEqual(order(updated), [['c.png', 0], ['a.png', 1], ['b.png', 2], ['d.png', 3]]);
  assert.equal(itemService.get(item.uuid).photos[0].id, c.id);
  // Swapping the cover with the last photo, and a no-op order, both keep positions 0..n-1.
  assert.deepEqual(order(photoService.reorder(item.id, [d.id, a.id, b.id, c.id])), [['d.png', 0], ['a.png', 1], ['b.png', 2], ['c.png', 3]]);
  assert.deepEqual(order(photoService.reorder(item.id, [d.id, a.id, b.id, c.id])), [['d.png', 0], ['a.png', 1], ['b.png', 2], ['c.png', 3]]);
  assert.deepEqual(positions(db, item), [0, 1, 2, 3]);
});

test('a reorder rejects invalid, foreign, incomplete, unknown, and stale lists without changing anything', () => {
  const { add, itemService, photoService } = build();
  const item = add('Zenit E');
  const other = add('Kiev 4');
  const [a, b, c] = photoService.addToItem(item.id, files('a.png', 'b.png', 'c.png'));
  const [foreign] = photoService.addToItem(other.id, files('kiev.png'));
  const before = names(itemService, item);

  failure(() => photoService.reorder(999999, [a.id]), 404, 'ITEM_NOT_FOUND');
  failure(() => photoService.reorder(item.id, undefined), 400, 'PHOTO_ORDER_INVALID');
  failure(() => photoService.reorder(item.id, `${a.id},${b.id}`), 400, 'PHOTO_ORDER_INVALID');
  failure(() => photoService.reorder(item.id, [String(c.id), a.id, b.id]), 400, 'PHOTO_ORDER_INVALID');
  failure(() => photoService.reorder(item.id, [c.id, c.id, a.id, b.id]), 400, 'PHOTO_ORDER_INVALID');
  failure(() => photoService.reorder(item.id, [c.id, a.id, foreign.id]), 409, 'PHOTO_ORDER_STALE');
  failure(() => photoService.reorder(item.id, [c.id, a.id, b.id, foreign.id]), 409, 'PHOTO_ORDER_STALE');
  failure(() => photoService.reorder(item.id, [c.id, a.id]), 409, 'PHOTO_ORDER_STALE');
  failure(() => photoService.reorder(item.id, [c.id, a.id, 999999]), 409, 'PHOTO_ORDER_STALE');

  // An order made before another photo was added no longer names the whole set.
  photoService.addToItem(item.id, files('d.png'));
  failure(() => photoService.reorder(item.id, [c.id, a.id, b.id]), 409, 'PHOTO_ORDER_STALE');
  assert.deepEqual(names(itemService, item), [...before, 'd.png']);
  assert.deepEqual(names(itemService, other), ['kiev.png']);
});

test('deleting a photo closes the gap, and deleting the cover promotes the next photo', () => {
  const { db, add, itemRepository, itemService, photoService } = build();
  const item = add('Zenit E');
  const [a, b, c, d] = photoService.addToItem(item.id, files('a.png', 'b.png', 'c.png', 'd.png'));
  photoService.remove(b.id);
  assert.deepEqual(order(itemService.get(item.id).photos), [['a.png', 0], ['c.png', 1], ['d.png', 2]]);
  photoService.remove(a.id);
  assert.deepEqual(order(itemService.get(item.id).photos), [['c.png', 0], ['d.png', 1]]);
  assert.equal(itemRepository.listHierarchy()[0].thumbnail_id, c.id);
  // A later upload still follows the last remaining photo.
  photoService.addToItem(item.id, files('e.png'));
  assert.deepEqual(positions(db, item), [0, 1, 2]);
  for (const photo of itemService.get(item.id).photos) photoService.remove(photo.id);
  assert.deepEqual(itemService.get(item.id).photos, []);
  assert.equal(itemRepository.listHierarchy()[0].thumbnail_id, null);
  failure(() => photoService.remove(d.id), 404, 'PHOTO_NOT_FOUND');
});

test('every thumbnail uses the first photo in the persisted order', () => {
  const { db, add, itemRepository, itemService, photoService } = build();
  const box = add('Box');
  const camera = add('Camera', box.id);
  const [first, second] = photoService.addToItem(camera.id, files('first.png', 'second.png'));
  db.exec(`
    INSERT INTO checklists (name, mode) VALUES ('Trip', 'packing');
    INSERT INTO checklist_items (checklist_id, item_id, item_name_snapshot, sort_order) VALUES (1, ${camera.id}, 'Camera', 0);
    INSERT INTO checklist_runs (checklist_id, checklist_name_snapshot, mode) VALUES (1, 'Trip', 'packing');
    INSERT INTO checklist_run_items (run_id, item_id, item_name_snapshot, position) VALUES (1, ${camera.id}, 'Camera', 0);
  `);
  const thumbnails = () => ({
    list: itemRepository.search({ search: 'Camera', limit: 10, offset: 0 }).rows[0].thumbnail_id,
    hierarchy: itemRepository.listHierarchy().find(node => node.id === camera.id).thumbnail_id,
    contents: itemService.get(box.id).children[0].thumbnail_id,
    checklist: new ChecklistRepository(db).listEntries(1)[0].thumbnail_id,
    run: new ChecklistRunRepository(db).listItems(1)[0].thumbnail_id
  });
  const everywhere = id => ({ list: id, hierarchy: id, contents: id, checklist: id, run: id });
  assert.deepEqual(thumbnails(), everywhere(first.id));
  photoService.reorder(camera.id, [second.id, first.id]);
  assert.deepEqual(thumbnails(), everywhere(second.id));
});

test('PUT /api/items/:id/photos/order answers with the ordered photos and the error contract', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-photo-order-api-'));
  const server = await startServer(dataDir);
  try {
    const call = async (url, method, body) => {
      const response = await fetch(`${server.base}${url}`, body === undefined ? { method } : {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };
    const category = (await call('/api/categories', 'POST', { name: 'Cameras' })).body;
    const item = (await call('/api/items', 'POST', { name: 'F3', category_id: category.id })).body;
    const form = new FormData();
    for (const name of ['one.png', 'two.png', 'three.png']) form.append('photos', new Blob([Buffer.from('8950', 'hex')], { type: 'image/png' }), name);
    const uploaded = await (await fetch(`${server.base}/api/items/${item.id}/photos`, { method: 'POST', body: form })).json();
    assert.deepEqual(uploaded.map(photo => [photo.filename, photo.sort_order]), [['one.png', 0], ['two.png', 1], ['three.png', 2]]);
    const [one, two, three] = uploaded.map(photo => photo.id);

    const reordered = await call(`/api/items/${item.uuid}/photos/order`, 'PUT', { photo_ids: [three, one, two] });
    assert.equal(reordered.status, 200);
    assert.deepEqual(reordered.body.map(photo => [photo.id, photo.sort_order]), [[three, 0], [one, 1], [two, 2]]);
    assert.deepEqual((await call(`/api/items/${item.id}`, 'GET')).body.photos.map(photo => photo.id), [three, one, two]);
    const listed = (await call('/api/items?search=F3', 'GET')).body.items[0];
    assert.equal(listed.thumbnail_id, three);

    assert.deepEqual(await call(`/api/items/${item.id}/photos/order`, 'PUT', { photo_ids: [three, three] }),
      { status: 400, body: { error: { code: 'PHOTO_ORDER_INVALID', params: {} } } });
    assert.deepEqual(await call(`/api/items/${item.id}/photos/order`, 'PUT', { photo_ids: [three, one] }),
      { status: 409, body: { error: { code: 'PHOTO_ORDER_STALE', params: {} } } });
    assert.deepEqual(await call('/api/items/999999/photos/order', 'PUT', { photo_ids: [] }),
      { status: 404, body: { error: { code: 'ITEM_NOT_FOUND', params: {} } } });

    // Deleting the cover through the API promotes the next photo.
    assert.equal((await call(`/api/photos/${three}`, 'DELETE')).status, 204);
    assert.deepEqual((await call(`/api/items/${item.id}`, 'GET')).body.photos.map(photo => [photo.id, photo.sort_order]), [[one, 0], [two, 1]]);
  } finally {
    await stopServer(server.child);
  }
});
