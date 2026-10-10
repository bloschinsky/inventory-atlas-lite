import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// The core New flag of items and templates at the service and schema level, without HTTP and without
// the working database in data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-new-flag-test-'));

const { applySchema, CURRENT_SCHEMA, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { ItemTemplateRepository } = await import('../server/src/repositories/itemTemplateRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemTemplateService } = await import('../server/src/services/itemTemplateService.js');
const { buildItemColumns } = await import('../server/src/services/itemColumns.js');
const { itemImportTemplate, parseItemImportDocument } = await import('../shared/itemImport.js');

const build = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  return {
    db,
    category: categoryService.create({ name: 'Cameras' }),
    itemService: new ItemService({
    itemHistoryService: new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) }),
      itemRepository: new ItemRepository(db), customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository
    }),
    itemTemplateService: new ItemTemplateService({ itemTemplateRepository: new ItemTemplateRepository(db), categoryRepository, customFieldRepository })
  };
};

const failure = (work, status, expected) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  if (typeof expected === 'string') assert.equal(error.code, expected);
  else assert.deepEqual({ code: error.code, params: error.params }, expected);
  return true;
});

// A version 5 database: items and templates exist, but neither has the New flag yet.
const legacyDatabase = (db = new Database(':memory:')) => {
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT, description TEXT, condition TEXT, location TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE custom_fields (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE, type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(category_id, name));
    CREATE TABLE item_field_values (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE, value TEXT, UNIQUE(item_id, field_id));
    CREATE TABLE item_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE item_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, item_name TEXT, description TEXT, condition TEXT,
      location TEXT, purchase_date TEXT, purchase_price_amount TEXT, purchase_price_currency TEXT, serial_number TEXT,
      transferred_to TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO categories (name) VALUES ('Cameras');
    INSERT INTO items (uuid, name, category_id, condition) VALUES
      ('11111111-1111-4111-8111-111111111111', 'Zenit E', 1, 'New'),
      ('22222222-2222-4222-8222-222222222222', 'Kiev 4', 1, 'Like new'),
      ('33333333-3333-4333-8333-333333333333', 'Smena 8', 1, 'Used once'),
      ('44444444-4444-4444-8444-444444444444', 'FED 2', 1, 'Good'),
      ('55555555-5555-4555-8555-555555555555', 'Lomo LC-A', 1, NULL);
    INSERT INTO item_templates (name, category_id, condition) VALUES ('Boxed camera', 1, 'New');
  `);
  db.pragma('user_version = 5');
  return db;
};

test('a fresh database has a non-null New flag on items and an optional one on templates', () => {
  const { db } = build();
  const items = db.prepare('PRAGMA table_info(items)').all().find(column => column.name === 'is_new');
  assert.deepEqual({ type: items.type, notnull: items.notnull, dflt_value: items.dflt_value }, { type: 'INTEGER', notnull: 1, dflt_value: '0' });
  const templates = db.prepare('PRAGMA table_info(item_templates)').all().find(column => column.name === 'is_new');
  assert.deepEqual({ type: templates.type, notnull: templates.notnull, dflt_value: templates.dflt_value }, { type: 'INTEGER', notnull: 0, dflt_value: null });
  assert.ok(CURRENT_SCHEMA.items.includes('is_new'));
  assert.ok(CURRENT_SCHEMA.item_templates.includes('is_new'));
  assert.equal(SCHEMA_VERSION, 11);
  // The CHECK keeps the stored flag to 0 or 1 even for writes that bypass the services.
  assert.throws(() => db.prepare("INSERT INTO items (uuid, name, category_id, is_new) VALUES ('x', 'X', 1, 2)").run(), /CHECK/);
});

test('a version 5 database gains the New flag as false without guessing it from the old condition text', () => {
  const db = legacyDatabase();
  const conditions = db.prepare('SELECT id, condition AS condition_notes FROM items ORDER BY id').all();
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION);
  assert.deepEqual(db.prepare('SELECT DISTINCT is_new FROM items').all(), [{ is_new: 0 }]);
  // The old text survives as Condition Notes, and "New" sets neither the flag nor a grade.
  assert.deepEqual(db.prepare('SELECT id, condition_notes FROM items ORDER BY id').all(), conditions);
  assert.deepEqual(db.prepare('SELECT is_new, condition_grade, condition_notes FROM item_templates').get(),
    { is_new: null, condition_grade: null, condition_notes: 'New' });
  // Applying the schema again changes nothing.
  applySchema(db);
  assert.deepEqual(db.prepare('SELECT id, condition_notes FROM items ORDER BY id').all(), conditions);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM items WHERE is_new = 0').get().count, 5);
});

test('a version 5 backup is migrated by restore validation and passes the current schema check', async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-new-flag-restore-')), 'backup.sqlite');
  const db = legacyDatabase(new Database(file));
  db.close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.schemaVersion, SCHEMA_VERSION);
  assert.equal(summary.migratedFrom, 5);
  assert.equal(summary.items, 5);
  const migrated = new Database(file, { readonly: true });
  try {
    assert.deepEqual(migrated.prepare('SELECT name, is_new, condition_grade, condition_notes FROM items WHERE id = 1').get(),
      { name: 'Zenit E', is_new: 0, condition_grade: null, condition_notes: 'New' });
  } finally {
    migrated.close();
  }
});

test('items are created and edited with a boolean New flag that defaults to false', () => {
  const { category, itemService } = build();
  // New and Condition are independent: a new item can be graded Poor.
  const fresh = itemService.create({ name: 'Zenit E', category_id: category.id, is_new: true, condition_grade: 'poor' });
  assert.equal(fresh.is_new, true);
  assert.equal(fresh.condition_grade, 'poor');
  assert.equal(itemService.create({ name: 'Kiev 4', category_id: category.id, is_new: false }).is_new, false);
  assert.equal(itemService.create({ name: 'Smena 8', category_id: category.id }).is_new, false);
  assert.equal(itemService.create({ name: 'FED 2', category_id: category.id, is_new: null }).is_new, false);

  const edited = itemService.update(fresh.id, { name: 'Zenit E', category_id: category.id, is_new: false, condition_grade: 'excellent' });
  assert.deepEqual([edited.is_new, edited.condition_grade], [false, 'excellent']);
  assert.equal(itemService.get(fresh.id).is_new, false);
  itemService.update(fresh.id, { name: 'Zenit E', category_id: category.id, is_new: true });
  assert.equal(itemService.get(fresh.id).is_new, true);

  // Only a real boolean is accepted; nothing is guessed from text or numbers.
  for (const value of ['true', 'new', 'used', 'yes', 'no', 1, 0, '1', {}, []]) {
    failure(() => itemService.create({ name: 'X', category_id: category.id, is_new: value }), 400, 'INVALID_IS_NEW');
  }
  failure(() => itemService.update(fresh.id, { name: 'Zenit E', category_id: category.id, is_new: 'yes' }), 400, 'INVALID_IS_NEW');
  assert.equal(itemService.get(fresh.id).is_new, true);
});

test('the item list returns the New flag and sorts by it deterministically', () => {
  const { category, itemService } = build();
  for (const [name, isNew] of [['Alpha', true], ['Bravo', false], ['Charlie', true], ['Delta', false]]) {
    itemService.create({ name, category_id: category.id, is_new: isNew });
  }
  const list = query => itemService.list({ pageSize: 100, ...query }).items;
  assert.deepEqual(list({}).map(item => [item.name, item.is_new]), [['Alpha', true], ['Bravo', false], ['Charlie', true], ['Delta', false]]);
  assert.deepEqual(list({ sort: 'isNew', direction: 'asc' }).map(item => item.name), ['Bravo', 'Delta', 'Alpha', 'Charlie']);
  assert.deepEqual(list({ sort: 'isNew', direction: 'desc' }).map(item => item.name), ['Alpha', 'Charlie', 'Bravo', 'Delta']);
  // Equal flags keep the creation order across pages.
  assert.deepEqual([1, 2].flatMap(page => itemService.list({ sort: 'isNew', direction: 'asc', page, pageSize: 2 }).items.map(item => item.name)),
    ['Bravo', 'Delta', 'Alpha', 'Charlie']);
});

test('the column catalog exposes New as a sortable boolean core column hidden by default', () => {
  const column = buildItemColumns([]).find(candidate => candidate.key === 'isNew');
  assert.deepEqual(column, { key: 'isNew', type: 'boolean', sortable: true, searchable: false, visibleByDefault: false, core: true });
});

test('templates store an unset, false, or true New default and pass it to the item draft', () => {
  const { category, itemService, itemTemplateService } = build();
  const unset = itemTemplateService.create({ name: 'Unset', category_id: category.id });
  const used = itemTemplateService.create({ name: 'Used', category_id: category.id, is_new: false });
  const boxed = itemTemplateService.create({ name: 'Boxed', category_id: category.id, is_new: true });
  assert.deepEqual([unset, used, boxed].map(template => template.is_new), [null, false, true]);
  assert.equal(itemTemplateService.update(boxed.id, { name: 'Boxed', category_id: category.id, is_new: null }).is_new, null);
  assert.equal(itemTemplateService.update(boxed.id, { name: 'Boxed', category_id: category.id, is_new: true }).is_new, true);
  failure(() => itemTemplateService.create({ name: 'Bad', category_id: category.id, is_new: 'new' }), 400, 'INVALID_IS_NEW');

  // An item saved from each draft receives the configured default; an unset one leaves it false.
  const created = [unset, used, boxed].map(template => {
    const draft = itemTemplateService.itemDraft(template.id);
    return itemService.create({ ...draft.baseFields, name: template.name, category_id: draft.categoryId }).is_new;
  });
  assert.deepEqual(created, [false, false, true]);
});

test('a duplicate draft built from an item carries its New flag', () => {
  const { category, itemService } = build();
  const source = itemService.create({ name: 'Zenit E', category_id: category.id, is_new: true });
  // The duplicate flow posts the source's base values again under a new name, like the item form does.
  const { is_new: isNew, condition_grade, condition_notes, location } = itemService.get(source.id);
  const copy = itemService.create({ name: 'Zenit E (copy)', category_id: category.id, is_new: isNew, condition_grade, condition_notes, location });
  assert.equal(copy.is_new, true);
  assert.notEqual(copy.uuid, source.uuid);
});

test('batch import accepts an optional boolean new property and refuses anything else', () => {
  const { category, itemService } = build();
  const context = { categoryName: category.name, fields: [] };
  const document = items => JSON.stringify({ version: 1, category: category.name, items });

  assert.equal(itemImportTemplate(category, []).items[0].new, false);
  const drafts = parseItemImportDocument(document([{ name: 'A', new: true }, { name: 'B', new: false }, { name: 'C' }]), context);
  assert.deepEqual(drafts.map(draft => draft.new), [true, false, false]);

  const created = itemService.createBatch({
    categoryId: category.id,
    document: { version: 1, category: category.name, items: [{ name: 'A', new: true, conditionNotes: 'Sealed' }, { name: 'B' }] }
  });
  assert.deepEqual(created.map(item => [item.name, item.is_new, item.condition_grade, item.condition_notes]),
    [['A', true, null, 'Sealed'], ['B', false, null, null]]);

  // The preview and the API refuse the same values with the same error.
  for (const value of ['true', 'yes', 1, null]) {
    const expected = { code: 'IMPORT_ITEM_BOOLEAN_EXPECTED', params: { index: 1, property: 'new' } };
    failure(() => parseItemImportDocument(document([{ name: 'A', new: value }]), context), 400, expected);
    failure(() => itemService.createBatch({ categoryId: category.id, document: { version: 1, category: category.name, items: [{ name: 'A', new: value }] } }),
      400, expected);
  }
  assert.equal(itemService.list({}).items.length, 2);
});
