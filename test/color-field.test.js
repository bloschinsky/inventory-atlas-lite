import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer, stopServer } from './serverProcess.js';

// The Color custom field type at the shared-rule, schema, service, and HTTP level, never against data/.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-color-test-'));

const { applySchema, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemTemplateRepository } = await import('../server/src/repositories/itemTemplateRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemTemplateService } = await import('../server/src/services/itemTemplateService.js');
const { buildItemColumns } = await import('../server/src/services/itemColumns.js');
const { COLOR_KEYS, COLOR_PRESETS, encodeColor, readColor } = await import('../shared/colors.js');
const { FIELD_TYPES, reviewFieldDefinitions } = await import('../shared/fieldDefinitions.js');
const { validateFieldValue } = await import('../shared/itemValidation.js');
const { itemImportTemplate, parseItemImportDocument, reviewItemDraft } = await import('../shared/itemImport.js');

const build = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  return {
    db,
    categoryService,
    fieldService: new CustomFieldService(customFieldRepository, categoryService),
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

const brown = '{"key":"brown","hex":"#795548"}';
const tan = '{"key":"custom","hex":"#A08C75"}';

/*
  A database as version 9 left it: custom_fields with the four-type CHECK, a deleted field whose
  template value stayed behind, and item and template values of the remaining fields.
*/
const versionNineDatabase = (db = new Database(':memory:')) => {
  db.pragma('foreign_keys = ON');
  applySchema(db);
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE custom_fields;
    CREATE TABLE custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL CHECK(type IN ('text', 'number', 'date', 'boolean')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, name)
    );
    INSERT INTO categories (id, name) VALUES (1, 'Paint');
    INSERT INTO custom_fields (id, category_id, name, type, created_at, updated_at) VALUES
      (1, 1, 'Brand', 'text', '2026-01-01 10:00:00', '2026-01-02 10:00:00'), (2, 1, 'Opened', 'boolean', '2026-01-01 10:00:00', '2026-01-01 10:00:00'),
      (3, 1, 'Removed', 'text', '2026-01-01 10:00:00', '2026-01-01 10:00:00');
    DELETE FROM custom_fields WHERE id = 3;
    INSERT INTO items (id, uuid, name, category_id) VALUES (5, '00000000-0000-4000-8000-000000000005', 'Tin', 1);
    INSERT INTO item_field_values (item_id, field_id, value) VALUES (5, 1, 'Dulux'), (5, 2, '1');
    INSERT INTO item_templates (id, name, category_id) VALUES (1, 'Tin', 1);
    INSERT INTO item_template_field_values (template_id, field_id, value) VALUES (1, 1, 'Dulux'), (1, 3, 'kept');
  `);
  db.pragma('user_version = 9');
  db.pragma('foreign_keys = ON');
  return db;
};

test('the shared rules accept the twelve presets and any custom HEX and refuse everything else', () => {
  assert.deepEqual(FIELD_TYPES.map(type => type.value), ['text', 'number', 'date', 'boolean', 'color']);
  assert.deepEqual(COLOR_KEYS, ['black', 'white', 'gray', 'brown', 'beige', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'custom']);
  for (const preset of COLOR_PRESETS) {
    const stored = validateFieldValue('color', preset, 'Color');
    assert.equal(stored, `{"key":"${preset.key}","hex":"${preset.hex}"}`);
    assert.deepEqual(readColor(stored), preset);
    // The serialized form and a lowercase HEX are read the same way.
    assert.equal(validateFieldValue('color', JSON.stringify({ hex: preset.hex.toLowerCase(), key: preset.key }), 'Color'), stored);
  }
  assert.equal(validateFieldValue('color', { key: 'custom', hex: '#a08c75' }, 'Color'), tan);
  // A custom shade equal to a preset stays custom: it is never reclassified.
  assert.equal(validateFieldValue('color', { key: 'custom', hex: '#795548' }, 'Color'), '{"key":"custom","hex":"#795548"}');
  for (const empty of ['', null, undefined]) assert.equal(validateFieldValue('color', empty, 'Color'), null);
  const refused = [
    { key: 'red', hex: '#000000' }, { key: 'teal', hex: '#008080' }, { key: 'custom', hex: '#ABC' }, { key: 'custom', hex: 'A08C75' },
    { key: 'custom', hex: '#GGGGGG' }, { key: 'custom' }, { key: 'brown', hex: '#795548', name: 'Brown' }, ['brown', '#795548'],
    'brown', '#795548', '{"key":"brown"', 7, true
  ];
  for (const raw of refused) {
    failure(() => validateFieldValue('color', raw, 'Paint'), 400, { code: 'INVALID_CUSTOM_FIELD_COLOR', params: { field: 'Paint' } });
  }
  // Other types are untouched by the new one.
  assert.equal(validateFieldValue('boolean', true, 'B'), '1');
  assert.equal(validateFieldValue('text', brown, 'T'), brown);
  assert.equal(reviewFieldDefinitions([{ name: 'Color', type: 'color' }])[0].status, 'new');
});

test('a fresh database accepts the color type, and a version 9 database is rebuilt without losing anything', () => {
  const fresh = build();
  const category = fresh.categoryService.create({ name: 'Paint' });
  assert.equal(fresh.fieldService.create(category.id, { name: 'Color', type: 'color' }).type, 'color');
  assert.equal(SCHEMA_VERSION, 10);

  const db = versionNineDatabase();
  assert.throws(() => db.prepare("INSERT INTO custom_fields (category_id, name, type) VALUES (1, 'Shade', 'color')").run(), /CHECK/);
  const before = db.prepare('SELECT * FROM custom_fields ORDER BY id').all();
  const lastUpdated = db.prepare('SELECT last_updated_at FROM database_metadata').get();
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), 10);
  assert.equal(Number(db.pragma('foreign_keys', { simple: true })), 1);
  assert.deepEqual(db.prepare('SELECT * FROM custom_fields ORDER BY id').all(), before);
  assert.deepEqual(db.prepare('SELECT item_id, field_id, value FROM item_field_values ORDER BY id').all(),
    [{ item_id: 5, field_id: 1, value: 'Dulux' }, { item_id: 5, field_id: 2, value: '1' }]);
  assert.deepEqual(db.prepare('SELECT field_id, value FROM item_template_field_values ORDER BY id').all(),
    [{ field_id: 1, value: 'Dulux' }, { field_id: 3, value: 'kept' }]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  // The migration is not an inventory edit, and the touch triggers are back.
  assert.deepEqual(db.prepare('SELECT last_updated_at FROM database_metadata').get(), lastUpdated);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'custom_fields'").get().count, 3);
  // The deleted field's id is never reused, so its kept template value cannot attach to a new field.
  const id = db.prepare("INSERT INTO custom_fields (category_id, name, type) VALUES (1, 'Shade', 'color')").run().lastInsertRowid;
  assert.equal(id, 4);
  // The cascade still works on the rebuilt table, and a second run changes nothing.
  const schema = () => db.prepare("SELECT sql FROM sqlite_master WHERE name = 'custom_fields'").get().sql;
  const rebuilt = schema();
  applySchema(db);
  assert.equal(schema(), rebuilt);
  db.prepare('DELETE FROM custom_fields WHERE id = 2').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM item_field_values WHERE field_id = 2').get().count, 0);
});

test('a version 9 backup is migrated by restore validation and then accepts colors', async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'inventory-color-restore-')), 'backup.sqlite');
  versionNineDatabase(new Database(file)).close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.migratedFrom, 9);
  assert.equal(summary.fieldValues, 2);
  const migrated = new Database(file);
  try {
    migrated.prepare("INSERT INTO custom_fields (category_id, name, type) VALUES (1, 'Shade', 'color')").run();
    assert.equal(migrated.prepare("SELECT value FROM item_field_values WHERE field_id = 1").get().value, 'Dulux');
  } finally {
    migrated.close();
  }
});

test('items and templates store a color, a custom shade, or nothing, and refuse an invalid one', () => {
  const { categoryService, fieldService, itemService, itemTemplateService } = build();
  const category = categoryService.create({ name: 'Paint' });
  const color = fieldService.create(category.id, { name: 'Color', type: 'color' });
  const other = categoryService.create({ name: 'Books' });
  assert.deepEqual(fieldService.listForCategory(other.id), []);

  const item = itemService.create({ name: 'Tin', category_id: category.id, field_values: { [color.id]: { key: 'brown', hex: '#795548' } } });
  assert.equal(itemService.get(item.id).fields[0].value, brown);
  const updated = itemService.update(item.id, { name: 'Tin', category_id: category.id, field_values: { [color.id]: tan } });
  assert.equal(itemService.get(updated.id).fields[0].value, tan);
  // Clear stores no value at all, never a default color.
  itemService.update(item.id, { name: 'Tin', category_id: category.id, field_values: { [color.id]: '' } });
  assert.equal(itemService.get(item.id).fields[0].value, null);
  failure(() => itemService.create({ name: 'Bad', category_id: category.id, field_values: { [color.id]: { key: 'red', hex: '#000000' } } }),
    400, { code: 'INVALID_CUSTOM_FIELD_COLOR', params: { field: 'Color' } });

  const template = itemTemplateService.create({ name: 'Brown tin', category_id: category.id, field_values: { [color.id]: brown } });
  assert.deepEqual(template.field_values, { [color.id]: brown });
  assert.deepEqual(itemTemplateService.itemDraft(template.id).dynamicFields, { [color.id]: brown });
  const blank = itemTemplateService.create({ name: 'Any tin', category_id: category.id, field_values: { [color.id]: '' } });
  assert.deepEqual(blank.field_values, {});
  failure(() => itemTemplateService.create({ name: 'Bad', category_id: category.id, field_values: { [color.id]: '{"key":"custom"}' } }),
    400, 'INVALID_CUSTOM_FIELD_COLOR');
});

test('batch import reads a color object or its JSON text and reviews an invalid one inline', () => {
  const { categoryService, fieldService, itemService } = build();
  const category = categoryService.create({ name: 'Paint' });
  const color = fieldService.create(category.id, { name: 'Color', type: 'color' });
  const fields = [color];
  assert.equal(itemImportTemplate(category, fields).items[0].customFields.Color, null);

  const items = [
    { name: 'Object', customFields: { Color: { key: 'green', hex: '#2e9958' } } },
    { name: 'Text', customFields: { color: tan } },
    { name: 'Unset', customFields: { Color: null } },
    { name: 'Wrong', customFields: { Color: { key: 'green', hex: '#000000' } } }
  ];
  const drafts = parseItemImportDocument(JSON.stringify({ version: 1, category: 'Paint', items }), { categoryName: 'Paint', fields });
  assert.deepEqual(drafts.map(draft => draft.customFields.Color),
    ['{"key":"green","hex":"#2E9958"}', tan, '', '{"key":"green","hex":"#000000"}']);
  assert.deepEqual(drafts.map(draft => reviewItemDraft(draft, fields).customFields?.Color?.code ?? null),
    [null, null, null, 'INVALID_CUSTOM_FIELD_COLOR']);
  // Only a color may be written as an object.
  const text = fieldService.create(category.id, { name: 'Brand', type: 'text' });
  assert.throws(() => parseItemImportDocument(JSON.stringify({ version: 1, category: 'Paint', items: [{ name: 'X', customFields: { Brand: {} } }] }),
    { categoryName: 'Paint', fields: [color, text] }), error => error.code === 'IMPORT_CUSTOM_FIELD_VALUE_TYPE');

  const created = itemService.createBatch({ categoryId: category.id, document: { version: 1, category: 'Paint', items: items.slice(0, 3) } });
  assert.deepEqual(created.map(item => itemService.get(item.id).fields.find(field => field.id === color.id).value),
    ['{"key":"green","hex":"#2E9958"}', tan, null]);
  failure(() => itemService.createBatch({ categoryId: category.id, document: { version: 1, category: 'Paint', items } }), 400, 'BATCH_ITEM_INVALID');
});

test('a Color column sorts semantically on the server and filters by group, Custom, and Not set', () => {
  const { categoryService, fieldService, itemService } = build();
  const paint = categoryService.create({ name: 'Paint' });
  const fabric = categoryService.create({ name: 'Fabric' });
  const books = categoryService.create({ name: 'Books' });
  // Same name and type in two categories: one merged column.
  const paintColor = fieldService.create(paint.id, { name: 'Color', type: 'color' });
  const fabricColor = fieldService.create(fabric.id, { name: 'color', type: 'color' });
  fieldService.create(books.id, { name: 'Color', type: 'text' });
  const columns = buildItemColumns([paintColor, fabricColor, ...fieldService.listForCategory(books.id)]).filter(column => !column.core);
  const column = columns.find(entry => entry.type === 'color');
  assert.deepEqual(column.fieldIds, [paintColor.id, fabricColor.id]);
  assert.equal(column.searchable, false);
  assert.equal(columns.length, 2);

  const add = (name, categoryId, fieldId, value) => itemService.create({ name, category_id: categoryId, field_values: fieldId ? { [fieldId]: value } : {} });
  add('Pink tin', paint.id, paintColor.id, { key: 'pink', hex: '#E886B2' });
  add('Tan cloth', fabric.id, fabricColor.id, { key: 'custom', hex: '#A08C75' });
  add('Black cloth', fabric.id, fabricColor.id, { key: 'black', hex: '#171717' });
  add('Brown-ish tin', paint.id, paintColor.id, { key: 'custom', hex: '#795548' });
  add('Blank tin', paint.id, null);
  add('Brown tin', paint.id, paintColor.id, { key: 'brown', hex: '#795548' });
  add('White cloth', fabric.id, fabricColor.id, { key: 'white', hex: '#FFFFFF' });
  add('Novel', books.id, null);

  const names = query => itemService.list({ pageSize: 100, ...query }).items.map(item => item.name);
  const sorted = ['Black cloth', 'White cloth', 'Brown tin', 'Pink tin', 'Brown-ish tin', 'Tan cloth', 'Blank tin', 'Novel'];
  assert.deepEqual(names({ sort: column.key }), sorted);
  // Descending reverses the groups, and unset values still come last.
  assert.deepEqual(names({ sort: column.key, direction: 'desc' }), ['Tan cloth', 'Brown-ish tin', 'Pink tin', 'Brown tin', 'White cloth', 'Black cloth', 'Blank tin', 'Novel']);
  // Pages follow the same order without repeating or skipping a row.
  const paged = [1, 2, 3].flatMap(page => itemService.list({ sort: column.key, pageSize: 3, page }).items.map(item => item.name));
  assert.deepEqual(paged, sorted);
  // The page carries the canonical text of the requested column.
  assert.equal(itemService.list({ fields: column.key, search: 'Pink' }).items[0].custom_values[column.key], '{"key":"pink","hex":"#E886B2"}');

  const filter = color => itemService.list({ colorField: column.key, color, pageSize: 100 });
  assert.deepEqual(filter('brown').items.map(item => item.name), ['Brown tin']);
  // Custom is one group, even for a shade equal to a preset; it never matches by HEX.
  assert.deepEqual(filter('custom').items.map(item => item.name), ['Brown-ish tin', 'Tan cloth']);
  // Not set covers only the categories that have the field.
  assert.deepEqual(filter('unset').items.map(item => item.name), ['Blank tin']);
  assert.equal(filter('green').pagination.total, 0);
  // The filter combines with the other filters, the count, and pagination.
  assert.deepEqual(names({ colorField: column.key, color: 'custom', categoryId: fabric.id }), ['Tan cloth']);
  assert.deepEqual(names({ colorField: column.key, color: 'custom', search: 'tin' }), ['Brown-ish tin']);
  const page = itemService.list({ colorField: column.key, color: 'custom', pageSize: 1, page: 2 });
  assert.deepEqual([page.items.map(item => item.name), page.pagination.total, page.pagination.pages], [['Tan cloth'], 2, 2]);
  // An unknown group, an unknown column, or a column of another type applies no color filter.
  for (const query of [{ colorField: column.key, color: 'teal' }, { colorField: 'custom:color:missing', color: 'brown' },
    { colorField: columns.find(entry => entry.type === 'text').key, color: 'brown' }]) {
    assert.equal(itemService.list(query).pagination.total, 8);
  }
});

test('the HTTP API creates a Color field, stores colors, and sorts and filters them', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-color-http-'));
  const { child, base } = await startServer(dataDir);
  const call = async (url, method = 'GET', body) => {
    const response = await fetch(`${base}${url}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const category = (await call('/api/categories', 'POST', { name: 'Paint' })).body;
    const field = await call(`/api/categories/${category.id}/fields`, 'POST', { name: 'Color', type: 'color' });
    assert.equal(field.status, 201);
    assert.equal(field.body.type, 'color');
    const refused = await call('/api/items', 'POST', { name: 'Bad', category_id: category.id, field_values: { [field.body.id]: { key: 'red', hex: '#000000' } } });
    assert.deepEqual(refused, { status: 400, body: { error: { code: 'INVALID_CUSTOM_FIELD_COLOR', params: { field: 'Color' } } } });
    await call('/api/items', 'POST', { name: 'Red tin', category_id: category.id, field_values: { [field.body.id]: { key: 'red', hex: '#dc3545' } } });
    await call('/api/items', 'POST', { name: 'Black tin', category_id: category.id, field_values: { [field.body.id]: encodeColor({ key: 'black', hex: '#171717' }) } });
    const key = (await call('/api/items/columns')).body.fields.find(column => column.type === 'color').key;
    const list = (await call(`/api/items?sort=${encodeURIComponent(key)}&fields=${encodeURIComponent(key)}`)).body;
    assert.deepEqual(list.items.map(item => [item.name, item.custom_values[key]]),
      [['Black tin', '{"key":"black","hex":"#171717"}'], ['Red tin', '{"key":"red","hex":"#DC3545"}']]);
    const filtered = (await call(`/api/items?colorField=${encodeURIComponent(key)}&color=red`)).body;
    assert.deepEqual([filtered.items.map(item => item.name), filtered.pagination.total], [['Red tin'], 1]);
  } finally {
    await stopServer(child);
  }
});
