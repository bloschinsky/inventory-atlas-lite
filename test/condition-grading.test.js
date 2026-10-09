import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// The structured Condition grade and the free-text Condition Notes at the schema and service level,
// without HTTP and without the working database in data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-condition-test-'));

const { applySchema, CURRENT_SCHEMA, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { DashboardRepository } = await import('../server/src/repositories/dashboardRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { ItemTemplateRepository } = await import('../server/src/repositories/itemTemplateRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { DashboardService } = await import('../server/src/services/dashboardService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemTemplateService } = await import('../server/src/services/itemTemplateService.js');
const { buildItemColumns } = await import('../server/src/services/itemColumns.js');
const { CONDITION_GRADES } = await import('../shared/conditionGrades.js');
const { itemImportTemplate, parseItemImportDocument, reviewItemDraft } = await import('../shared/itemImport.js');

const build = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  return {
    db,
    category: categoryService.create({ name: 'Cameras' }),
    categoryService,
    itemService: new ItemService({
    itemHistoryService: new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) }),
      itemRepository: new ItemRepository(db), customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository
    }),
    itemTemplateService: new ItemTemplateService({ itemTemplateRepository: new ItemTemplateRepository(db), categoryRepository, customFieldRepository }),
    dashboardService: new DashboardService({ dashboardRepository: new DashboardRepository(db), categoryRepository })
  };
};

const failure = (work, status, expected) => assert.throws(work, error => {
  assert.equal(error.status, status, `expected status ${status}, received ${error.status}: ${error.message}`);
  if (typeof expected === 'string') assert.equal(error.code, expected);
  else assert.deepEqual({ code: error.code, params: error.params }, expected);
  return true;
});

// Free-text conditions as a version 6 database stores them, including ones that read like a grade.
const LEGACY_CONDITIONS = ['Good', 'excellent', ' Like new, small scratch ', 'Broken', 'Needs a new battery\nand a strap', '', null];

const legacyDatabase = (db = new Database(':memory:')) => {
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT, description TEXT, condition TEXT, location TEXT,
      is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1)),
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
      transferred_to TEXT, is_new INTEGER CHECK (is_new IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO categories (name) VALUES ('Cameras');
    INSERT INTO item_templates (name, category_id, condition) VALUES ('Boxed camera', 1, 'Good'), ('Blank', 1, NULL);
  `);
  const insert = db.prepare('INSERT INTO items (uuid, name, category_id, condition) VALUES (?, ?, 1, ?)');
  LEGACY_CONDITIONS.forEach((condition, index) => insert.run(`00000000-0000-4000-8000-00000000000${index}`, `Item ${index}`, condition));
  db.pragma('user_version = 6');
  return db;
};

test('a fresh database stores the grade and the notes in separate columns and refuses any other grade', () => {
  const { db } = build();
  for (const table of ['items', 'item_templates']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
    assert.ok(columns.includes('condition_grade') && columns.includes('condition_notes'));
    assert.equal(columns.includes('condition'), false);
    assert.ok(CURRENT_SCHEMA[table].includes('condition_grade') && CURRENT_SCHEMA[table].includes('condition_notes'));
  }
  assert.equal(SCHEMA_VERSION, 9);
  // The CHECK keeps the stored grade to the fixed keys even for writes that bypass the services.
  for (const grade of CONDITION_GRADES) {
    db.prepare('INSERT INTO items (uuid, name, category_id, condition_grade) VALUES (?, ?, 1, ?)').run(`uuid-${grade}`, grade, grade);
  }
  for (const grade of ['Good', 'mint', '']) {
    assert.throws(() => db.prepare("INSERT INTO items (uuid, name, category_id, condition_grade) VALUES ('x', 'X', 1, ?)").run(grade), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO item_templates (name, condition_grade) VALUES ('X', ?)").run(grade), /CHECK/);
  }
});

test('a version 6 database keeps every old Condition text exactly as Condition Notes and guesses no grade', () => {
  const db = legacyDatabase();
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), SCHEMA_VERSION);
  const migrated = () => db.prepare('SELECT condition_grade, condition_notes FROM items ORDER BY id').all();
  assert.deepEqual(migrated(), LEGACY_CONDITIONS.map(notes => ({ condition_grade: null, condition_notes: notes })));
  assert.deepEqual(db.prepare('SELECT condition_grade, condition_notes FROM item_templates ORDER BY id').all(),
    [{ condition_grade: null, condition_notes: 'Good' }, { condition_grade: null, condition_notes: null }]);
  // Applying the schema again changes nothing, and the migrated table enforces the grade keys.
  applySchema(db);
  assert.deepEqual(migrated(), LEGACY_CONDITIONS.map(notes => ({ condition_grade: null, condition_notes: notes })));
  assert.throws(() => db.prepare("UPDATE items SET condition_grade = 'Good' WHERE id = 1").run(), /CHECK/);
});

test('a version 6 backup is migrated by restore validation with its notes intact', async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-condition-restore-')), 'backup.sqlite');
  legacyDatabase(new Database(file)).close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.migratedFrom, 6);
  assert.equal(summary.items, LEGACY_CONDITIONS.length);
  const migrated = new Database(file, { readonly: true });
  try {
    assert.deepEqual(migrated.prepare('SELECT condition_grade, condition_notes FROM items WHERE id = 1').get(), { condition_grade: null, condition_notes: 'Good' });
  } finally {
    migrated.close();
  }
});

test('items accept the five grades or none, refuse anything else, and round-trip grade and notes separately', () => {
  const { category, itemService } = build();
  for (const grade of CONDITION_GRADES) {
    assert.equal(itemService.create({ name: grade, category_id: category.id, condition_grade: grade }).condition_grade, grade);
  }
  for (const grade of [null, undefined, '']) {
    assert.equal(itemService.create({ name: 'Unset', category_id: category.id, condition_grade: grade }).condition_grade, null);
  }
  for (const grade of ['Good', 'GOOD', ' good', 'mint', 'new', 'used', 3, true, {}, []]) {
    failure(() => itemService.create({ name: 'X', category_id: category.id, condition_grade: grade }), 400, 'INVALID_CONDITION_GRADE');
  }

  const item = itemService.create({ name: 'Zenit E', category_id: category.id, condition_grade: 'good', condition_notes: '  Small crack near the left hinge.  ' });
  assert.deepEqual([item.condition_grade, item.condition_notes], ['good', 'Small crack near the left hinge.']);
  const edited = itemService.update(item.id, { name: 'Zenit E', category_id: category.id, condition_grade: 'broken', condition_notes: '' });
  assert.deepEqual([edited.condition_grade, edited.condition_notes], ['broken', null]);
  failure(() => itemService.update(item.id, { name: 'Zenit E', category_id: category.id, condition_grade: 'Great' }), 400, 'INVALID_CONDITION_GRADE');
  assert.equal(itemService.get(item.id).condition_grade, 'broken');
  // The New flag is never derived from the grade, or the grade from the flag.
  const fresh = itemService.create({ name: 'New but poor', category_id: category.id, is_new: true, condition_grade: 'poor' });
  assert.deepEqual([fresh.is_new, fresh.condition_grade], [true, 'poor']);
  const used = itemService.create({ name: 'Used but excellent', category_id: category.id, is_new: false, condition_grade: 'excellent' });
  assert.deepEqual([used.is_new, used.condition_grade], [false, 'excellent']);
});

test('the list sorts Condition by rank with unset grades last, and filters by one grade or by unset', () => {
  const { category, itemService } = build();
  // Alphabetical label order would be Broken, Excellent, Fair, Good, Poor; the rank order is not.
  for (const [name, grade] of [['A', 'good'], ['B', null], ['C', 'excellent'], ['D', 'broken'], ['E', 'fair'], ['F', 'poor'], ['G', 'good']]) {
    itemService.create({ name, category_id: category.id, condition_grade: grade, condition_notes: grade ? null : 'Zzz notes' });
  }
  const names = query => itemService.list({ pageSize: 100, ...query }).items.map(item => item.name);
  assert.deepEqual(names({ sort: 'condition', direction: 'asc' }), ['D', 'F', 'E', 'A', 'G', 'C', 'B']);
  assert.deepEqual(names({ sort: 'condition', direction: 'desc' }), ['C', 'A', 'G', 'E', 'F', 'D', 'B']);
  assert.deepEqual(names({ sort: 'conditionNotes' }), ['B', 'A', 'C', 'D', 'E', 'F', 'G']);

  assert.deepEqual(names({ condition: 'good' }), ['A', 'G']);
  assert.deepEqual(names({ condition: 'unset' }), ['B']);
  // An unknown filter value is ignored rather than guessed.
  assert.equal(names({ condition: 'Good' }).length, 7);
  const listed = itemService.list({ condition: 'excellent' }).items[0];
  assert.deepEqual([listed.condition_grade, listed.condition_notes], ['excellent', null]);
});

test('the column catalog has the grade column visible and the notes column hidden by default', () => {
  const columns = buildItemColumns([]);
  assert.deepEqual(columns.find(column => column.key === 'condition'),
    { key: 'condition', type: 'conditionGrade', sortable: true, searchable: false, visibleByDefault: true, core: true });
  assert.deepEqual(columns.find(column => column.key === 'conditionNotes'),
    { key: 'conditionNotes', type: 'text', sortable: true, searchable: false, visibleByDefault: false, core: true });
});

test('templates persist the grade and the notes, and pass both to the item and duplicate drafts', () => {
  const { category, itemService, itemTemplateService } = build();
  const template = itemTemplateService.create({ name: 'Boxed', category_id: category.id, condition_grade: 'fair', condition_notes: 'Box dented' });
  assert.deepEqual([template.condition_grade, template.condition_notes], ['fair', 'Box dented']);
  const updated = itemTemplateService.update(template.id, { name: 'Boxed', category_id: category.id, condition_grade: null, condition_notes: 'Box only' });
  assert.deepEqual([updated.condition_grade, updated.condition_notes], [null, 'Box only']);
  itemTemplateService.update(template.id, { name: 'Boxed', category_id: category.id, condition_grade: 'excellent', condition_notes: 'Sealed' });
  failure(() => itemTemplateService.create({ name: 'Bad', category_id: category.id, condition_grade: 'mint' }), 400, 'INVALID_CONDITION_GRADE');

  const draft = itemTemplateService.itemDraft(template.id);
  assert.deepEqual([draft.baseFields.condition_grade, draft.baseFields.condition_notes], ['excellent', 'Sealed']);
  const item = itemService.create({ ...draft.baseFields, name: 'From template', category_id: draft.categoryId });
  assert.deepEqual([item.condition_grade, item.condition_notes], ['excellent', 'Sealed']);

  // The duplicate flow posts the source's base values again under a new name, like the item form does.
  const { condition_grade: grade, condition_notes: notes } = itemService.get(item.id);
  const copy = itemService.create({ name: 'Copy', category_id: category.id, condition_grade: grade, condition_notes: notes });
  assert.deepEqual([copy.condition_grade, copy.condition_notes], ['excellent', 'Sealed']);
});

test('batch import reads conditionGrade and conditionNotes, and the legacy condition only as notes', () => {
  const { category, itemService } = build();
  const context = { categoryName: category.name, fields: [] };
  const document = items => ({ version: 1, category: category.name, items });

  const blank = itemImportTemplate(category, []).items[0];
  assert.deepEqual([blank.conditionGrade, blank.conditionNotes, 'condition' in blank], [null, '', false]);

  const drafts = parseItemImportDocument(JSON.stringify(document([
    { name: 'A', conditionGrade: 'good', conditionNotes: 'Small scratch near the left hinge.' },
    { name: 'B', condition: 'Good' },
    { name: 'C' }
  ])), context);
  assert.deepEqual(drafts.map(draft => [draft.conditionGrade, draft.conditionNotes]),
    [['good', 'Small scratch near the left hinge.'], [null, 'Good'], [null, '']]);

  const created = itemService.createBatch({ categoryId: category.id, document: document([
    { name: 'A', conditionGrade: 'good', conditionNotes: 'Small scratch' },
    { name: 'B', condition: 'Excellent' }
  ]) });
  assert.deepEqual(created.map(item => [item.condition_grade, item.condition_notes]), [['good', 'Small scratch'], [null, 'Excellent']]);

  // An unsupported grade stays visible in the preview with its inline error, and the API refuses it.
  const [invalid] = parseItemImportDocument(JSON.stringify(document([{ name: 'X', conditionGrade: 'mint' }])), context);
  assert.deepEqual(reviewItemDraft(invalid, []).conditionGrade, { code: 'INVALID_CONDITION_GRADE', params: {} });
  failure(() => itemService.createBatch({ categoryId: category.id, document: document([{ name: 'X', conditionGrade: 'mint' }]) }), 400,
    { code: 'BATCH_ITEM_INVALID', params: { index: 1, reason: { code: 'INVALID_CONDITION_GRADE', params: {} } } });
  failure(() => parseItemImportDocument(JSON.stringify(document([{ name: 'X', conditionGrade: 5 }])), context), 400,
    { code: 'IMPORT_ITEM_TEXT_EXPECTED', params: { index: 1, property: 'conditionGrade' } });
  // Both note properties at once leave no single value to keep.
  failure(() => parseItemImportDocument(JSON.stringify(document([{ name: 'X', condition: 'Old', conditionNotes: 'New' }])), context), 400,
    { code: 'IMPORT_ITEM_CONDITION_CONFLICT', params: { index: 1 } });
  assert.equal(itemService.list({}).items.length, 2);
});

test('the dashboard counts the structured grades in their fixed order and never the notes', () => {
  const { category, categoryService, itemService, dashboardService } = build();
  const other = categoryService.create({ name: 'Lenses' });
  for (const [grade, notes] of [['good', null], ['broken', null], [null, 'Excellent'], ['good', 'Good'], ['excellent', null]]) {
    itemService.create({ name: 'Item', category_id: category.id, condition_grade: grade, condition_notes: notes });
  }
  itemService.create({ name: 'Lens', category_id: other.id, condition_grade: 'poor' });

  assert.deepEqual(dashboardService.overview({}).conditionDistribution, [
    { key: 'excellent', count: 1 }, { key: 'good', count: 2 }, { key: 'poor', count: 1 }, { key: 'broken', count: 1 }, { key: 'not-set', count: 1 }
  ]);
  const scoped = dashboardService.overview({ categoryId: String(other.id) });
  assert.deepEqual(scoped.conditionDistribution, [{ key: 'poor', count: 1 }]);
  assert.deepEqual(scoped.fieldCoverage.find(field => field.key === 'condition'), { key: 'condition', count: 1, percentage: 100 });
});
