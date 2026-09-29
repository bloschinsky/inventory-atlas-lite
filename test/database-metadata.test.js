import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// Database metadata at the schema and service level, against temporary files and never data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-metadata-test-'));

const { DEFAULT_DATABASE_NAME, SCHEMA_VERSION, TRACKED_TABLES, applySchema } = await import('../server/src/db.js');
const { BulkReplaceRepository } = await import('../server/src/repositories/bulkReplaceRepository.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { DatabaseMetadataRepository } = await import('../server/src/repositories/databaseMetadataRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemTemplateRepository } = await import('../server/src/repositories/itemTemplateRepository.js');
const { BulkReplaceService } = await import('../server/src/services/bulkReplaceService.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { DashboardService } = await import('../server/src/services/dashboardService.js');
const { DashboardRepository } = await import('../server/src/repositories/dashboardRepository.js');
const { DatabaseMetadataService } = await import('../server/src/services/databaseMetadataService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemTemplateService } = await import('../server/src/services/itemTemplateService.js');
const { PhotoService } = await import('../server/src/services/photoService.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PAST = '2000-01-01T00:00:00.000Z';

const tempFile = async name => path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-metadata-file-')), name);

const open = file => {
  const connection = new Database(file);
  connection.pragma('foreign_keys = ON');
  return connection;
};

const readMetadata = connection => connection.prepare('SELECT * FROM database_metadata').all();

const build = () => {
  const db = open(':memory:');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemPhotoRepository = new ItemPhotoRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  return {
    db,
    categoryService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    itemService: new ItemService({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository }),
    itemTemplateService: new ItemTemplateService({ itemTemplateRepository: new ItemTemplateRepository(db), categoryRepository, customFieldRepository }),
    photoService: new PhotoService({ itemRepository, itemPhotoRepository }),
    bulkReplaceService: new BulkReplaceService({ bulkReplaceRepository: new BulkReplaceRepository(db) }),
    dashboardService: new DashboardService({ dashboardRepository: new DashboardRepository(db), categoryRepository }),
    metadataService: new DatabaseMetadataService({ databaseMetadataRepository: new DatabaseMetadataRepository(db) }),
    // Moves last_updated_at into the past so any later write is visible regardless of clock resolution.
    rewind: () => db.prepare('UPDATE database_metadata SET last_updated_at = ?').run(PAST),
    lastUpdated: () => db.prepare('SELECT last_updated_at FROM database_metadata').get().last_updated_at
  };
};

const failure = (work, status, code) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  assert.equal(error.code, code);
  return true;
});

test('a new database gets exactly one metadata row with a fresh identity', () => {
  const { db, metadataService } = build();
  const rows = readMetadata(db);
  assert.equal(rows.length, 1);
  const metadata = metadataService.get();
  assert.match(metadata.database_uuid, UUID);
  assert.equal(metadata.name, DEFAULT_DATABASE_NAME);
  assert.match(metadata.created_at, ISO);
  assert.equal(metadata.last_updated_at, metadata.created_at);
  assert.equal(metadata.schema_version, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(metadata).sort(), ['created_at', 'database_uuid', 'last_updated_at', 'name', 'schema_version']);
  // The table holds one row by construction.
  assert.throws(() => db.prepare("INSERT INTO database_metadata VALUES (2, 'x', 'y', 'z', 'z', 3)").run(), /CHECK constraint/);
});

test('the identity survives a restart and repeated schema application', async () => {
  const file = await tempFile('inventory.sqlite');
  try {
    const first = open(file);
    applySchema(first);
    first.prepare("INSERT INTO categories (name) VALUES ('Cameras')").run();
    const before = readMetadata(first);
    first.close();

    const second = open(file);
    applySchema(second);
    applySchema(second);
    assert.deepEqual(readMetadata(second), before);
    second.close();
  } finally {
    await rm(path.dirname(file), { recursive: true, force: true });
  }
});

test('an existing database without metadata is migrated and dated from its own records', async () => {
  const file = await tempFile('inventory.sqlite');
  try {
    // A version 2 database: the current inventory tables, no metadata table, no triggers.
    const legacy = open(file);
    applySchema(legacy);
    legacy.exec(`
      DROP TABLE database_metadata;
      ${TRACKED_TABLES.flatMap(table => ['insert', 'update', 'delete'].map(event => `DROP TRIGGER ${table}_${event}_touches_metadata;`)).join('\n')}
      INSERT INTO categories (name, created_at, updated_at) VALUES ('Cameras', '2021-03-04 05:06:07', '2021-03-04 05:06:07');
      INSERT INTO items (uuid, name, category_id, created_at, updated_at)
        VALUES ('11111111-1111-4111-8111-111111111111', 'Zenit E', 1, '2022-01-01 10:00:00', '2024-06-07 08:09:10');
    `);
    legacy.pragma('user_version = 2');
    assert.equal(legacy.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'database_metadata'").get().count, 0);
    legacy.close();

    const migrated = open(file);
    applySchema(migrated);
    const [metadata] = readMetadata(migrated);
    assert.match(metadata.database_uuid, UUID);
    assert.equal(metadata.name, DEFAULT_DATABASE_NAME);
    assert.equal(metadata.created_at, '2021-03-04T05:06:07.000Z');
    assert.equal(metadata.last_updated_at, '2024-06-07T08:09:10.000Z');
    assert.equal(metadata.schema_version, SCHEMA_VERSION);
    assert.equal(Number(migrated.pragma('user_version', { simple: true })), SCHEMA_VERSION);
    // Inventory data is untouched by the migration.
    assert.deepEqual(migrated.prepare('SELECT name, updated_at FROM items').all(), [{ name: 'Zenit E', updated_at: '2024-06-07 08:09:10' }]);
    migrated.close();
  } finally {
    await rm(path.dirname(file), { recursive: true, force: true });
  }
});

test('an empty legacy database is dated from the migration itself', () => {
  const db = open(':memory:');
  applySchema(db);
  db.exec('DELETE FROM database_metadata');
  db.pragma('user_version = 2');
  const before = new Date().toISOString();
  applySchema(db);
  const [metadata] = readMetadata(db);
  assert.ok(metadata.created_at >= before.slice(0, 19));
  assert.equal(metadata.last_updated_at, metadata.created_at);
});

test('a damaged metadata row is repaired without replacing the values that are still usable', () => {
  const db = open(':memory:');
  applySchema(db);
  const [original] = readMetadata(db);
  db.prepare("UPDATE database_metadata SET name = '  ', last_updated_at = '', schema_version = 1").run();
  applySchema(db);
  const [repaired] = readMetadata(db);
  assert.equal(repaired.database_uuid, original.database_uuid);
  assert.equal(repaired.created_at, original.created_at);
  assert.equal(repaired.name, DEFAULT_DATABASE_NAME);
  assert.equal(repaired.last_updated_at, original.created_at);
  assert.equal(repaired.schema_version, SCHEMA_VERSION);

  db.prepare("UPDATE database_metadata SET database_uuid = ''").run();
  applySchema(db);
  assert.match(readMetadata(db)[0].database_uuid, UUID);
});

test('the schema version mirrors PRAGMA user_version', () => {
  const { db, metadataService } = build();
  assert.equal(metadataService.get().schema_version, Number(db.pragma('user_version', { simple: true })));
  assert.equal(metadataService.get().schema_version, SCHEMA_VERSION);
});

test('a failed migration leaves the database exactly as it was', async () => {
  const file = await tempFile('inventory.sqlite');
  try {
    const legacy = open(file);
    // An old table without the columns the metadata migration dates records from.
    legacy.exec('CREATE TABLE item_photos (id INTEGER PRIMARY KEY, item_id INTEGER, filename TEXT, mime_type TEXT, data BLOB)');
    legacy.close();

    const connection = open(file);
    assert.throws(() => applySchema(connection));
    const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name);
    assert.deepEqual(tables, ['item_photos']);
    assert.equal(Number(connection.pragma('user_version', { simple: true })), 0);
    connection.close();
  } finally {
    await rm(path.dirname(file), { recursive: true, force: true });
  }
});

test('only the name can be changed, and it is validated', () => {
  const { metadataService, lastUpdated, rewind } = build();
  const before = metadataService.get();
  rewind();
  const renamed = metadataService.rename({ name: '  Garage  ', database_uuid: 'forged', created_at: PAST, schema_version: 99 });
  assert.equal(renamed.name, 'Garage');
  assert.equal(renamed.database_uuid, before.database_uuid);
  assert.equal(renamed.created_at, before.created_at);
  assert.equal(renamed.schema_version, SCHEMA_VERSION);
  // Renaming is a modification of the database too.
  assert.notEqual(lastUpdated(), PAST);

  failure(() => metadataService.rename({ name: '   ' }), 400, 'DATABASE_NAME_REQUIRED');
  failure(() => metadataService.rename({}), 400, 'DATABASE_NAME_REQUIRED');
  failure(() => metadataService.rename({ name: 42 }), 400, 'DATABASE_NAME_REQUIRED');
  failure(() => metadataService.rename({ name: 'x'.repeat(101) }), 400, 'DATABASE_NAME_TOO_LONG');
  failure(() => metadataService.rename({ name: 'Line\nbreak' }), 400, 'DATABASE_NAME_INVALID');
  assert.equal(metadataService.rename({ name: 'x'.repeat(100) }).name.length, 100);
  assert.equal(metadataService.rename({ name: 'Кам\'янець Inventory' }).name, 'Кам\'янець Inventory');
});

test('a missing metadata row is reported instead of being silently recreated', () => {
  const { db, metadataService } = build();
  db.exec('DELETE FROM database_metadata');
  failure(() => metadataService.get(), 500, 'DATABASE_METADATA_MISSING');
  failure(() => metadataService.rename({ name: 'Garage' }), 500, 'DATABASE_METADATA_MISSING');
});

test('every successful inventory write advances last_updated_at, and created_at never moves', () => {
  const services = build();
  const { categoryService, customFieldService, itemService, itemTemplateService, photoService, bulkReplaceService,
    metadataService, lastUpdated, rewind } = services;
  const created = metadataService.get().created_at;
  const writes = (label, work) => {
    rewind();
    const result = work();
    assert.notEqual(lastUpdated(), PAST, `${label} did not advance last_updated_at`);
    assert.match(lastUpdated(), ISO);
    return result;
  };

  const category = writes('category create', () => categoryService.create({ name: 'Cameras' }));
  writes('category rename', () => categoryService.rename(category.id, { name: 'Photo' }));
  const field = writes('field create', () => customFieldService.create(category.id, { name: 'Brand', type: 'text' }));
  const box = writes('item create', () => itemService.create({ name: 'Box', category_id: category.id, location: 'Garage' }));
  const lens = writes('item create with value', () => itemService.create({ name: 'Lens', category_id: category.id, field_values: { [field.id]: 'KMZ' } }));
  writes('item edit', () => itemService.update(lens.id, { name: 'Lens', category_id: category.id, description: 'Fast' }));
  writes('item move', () => itemService.update(lens.id, { name: 'Lens', category_id: category.id, parent_item_id: box.id }));
  writes('batch import', () => itemService.createBatch({
    categoryId: category.id, document: { version: 1, category: 'Photo', items: [{ name: 'Imported' }] }
  }));
  const [photo] = writes('photo upload', () => photoService.addToItem(lens.id, [{ originalname: 'a.png', mimetype: 'image/png', buffer: Buffer.from('x') }]));
  writes('photo delete', () => photoService.remove(photo.id));
  const template = writes('template create', () => itemTemplateService.create({ name: 'Preset', category_id: category.id, field_values: { [field.id]: 'KMZ' } }));
  writes('template edit', () => itemTemplateService.update(template.id, { name: 'Preset 2', category_id: category.id }));
  writes('template delete', () => itemTemplateService.remove(template.id));
  writes('bulk replace', () => bulkReplaceService.apply({ field: { type: 'core', key: 'location' }, from: 'Garage', to: 'Attic' }));
  writes('item delete', () => itemService.remove(itemService.list({ search: 'Imported' }).items[0].id));
  writes('field delete', () => customFieldService.remove(field.id, true));

  assert.equal(metadataService.get().created_at, created);
});

test('reads and refused writes leave last_updated_at alone', () => {
  const { categoryService, customFieldService, itemService, itemTemplateService, bulkReplaceService, dashboardService,
    metadataService, lastUpdated, rewind } = build();
  const category = categoryService.create({ name: 'Cameras' });
  const field = customFieldService.create(category.id, { name: 'Brand', type: 'text' });
  const item = itemService.create({ name: 'Lens', category_id: category.id, location: 'Garage', field_values: { [field.id]: 'KMZ' } });
  rewind();

  categoryService.list();
  customFieldService.listForCategory(category.id);
  itemService.list({ search: 'Lens', sort: 'name' });
  itemService.get(item.id);
  itemService.hierarchy();
  itemService.columns();
  itemTemplateService.list();
  dashboardService.overview({});
  bulkReplaceService.preview({ field: { type: 'core', key: 'location' }, from: 'Garage', to: 'Attic' });
  metadataService.get();
  assert.equal(lastUpdated(), PAST);

  // A write that fails validation, or whose transaction is rolled back, changes nothing.
  assert.throws(() => categoryService.create({ name: '' }));
  assert.throws(() => itemService.update(item.id, { name: 'Lens', category_id: category.id, purchase_date: 'not a date' }));
  assert.throws(() => itemService.createBatch({
    categoryId: category.id, document: { version: 1, category: 'Cameras', items: [{ name: 'Valid' }, { name: '' }] }
  }));
  assert.equal(lastUpdated(), PAST);
  assert.equal(itemService.list({ search: 'Valid' }).items.length, 0);
});
