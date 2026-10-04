import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { startServer, stopServer } from './serverProcess.js';

// Renaming a custom field changes only custom_fields.name; every value stays linked by the field id.
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-field-rename-test-'));

const { applySchema } = await import('../server/src/db.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { ItemTemplateRepository } = await import('../server/src/repositories/itemTemplateRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { ItemTemplateService } = await import('../server/src/services/itemTemplateService.js');
const { itemImportTemplate } = await import('../shared/itemImport.js');

const build = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  return {
    db,
    categoryService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    itemService: new ItemService({
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

const valueRows = db => db.prepare('SELECT id, item_id, field_id, value FROM item_field_values ORDER BY id').all();
const templateValueRows = db => db.prepare('SELECT id, template_id, field_id, value FROM item_template_field_values ORDER BY id').all();

test('a rename changes only the name and keeps the id, type, category, and every stored value', () => {
  const { db, categoryService, customFieldService, itemService, itemTemplateService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const empty = customFieldService.create(cameras.id, { name: 'Mount', type: 'text' });
  const maker = customFieldService.create(cameras.id, { name: 'Manufactuer', type: 'text' });
  const year = customFieldService.create(cameras.id, { name: 'Yr', type: 'number' });
  const bought = customFieldService.create(cameras.id, { name: 'Bought on', type: 'date' });
  const works = customFieldService.create(cameras.id, { name: 'Works', type: 'boolean' });

  // A field without values renames like any other.
  const mount = customFieldService.rename(empty.id, { name: 'Lens mount' });
  assert.deepEqual(mount, { id: empty.id, category_id: cameras.id, name: 'Lens mount', type: 'text' });

  const items = Array.from({ length: 25 }, (_value, index) => itemService.create({
    name: `Camera ${index}`, category_id: cameras.id,
    field_values: { [maker.id]: index % 2 ? 'Nikon' : 'Canon', [year.id]: String(1990 + index), [bought.id]: '2024-02-29', [works.id]: index % 3 ? 'true' : 'false' }
  }));
  const bare = itemService.create({ name: 'Bare camera', category_id: cameras.id });
  const template = itemTemplateService.create({
    name: 'Rangefinder', category_id: cameras.id, field_values: { [maker.id]: 'Leica', [year.id]: '1954', [works.id]: true }
  });
  const values = valueRows(db);
  const templateValues = templateValueRows(db);

  const renamed = customFieldService.rename(maker.id, { name: '  Manufacturer  ' });
  customFieldService.rename(year.id, { name: 'Year' });
  customFieldService.rename(bought.id, { name: 'Purchased on' });
  customFieldService.rename(works.id, { name: 'Working' });
  // Whitespace is trimmed, and the id, type, and category stay what they were.
  assert.deepEqual(renamed, { id: maker.id, category_id: cameras.id, name: 'Manufacturer', type: 'text' });
  assert.deepEqual(customFieldService.listForCategory(cameras.id).map(field => [field.id, field.name, field.type]), [
    [empty.id, 'Lens mount', 'text'], [maker.id, 'Manufacturer', 'text'], [year.id, 'Year', 'number'],
    [bought.id, 'Purchased on', 'date'], [works.id, 'Working', 'boolean']
  ]);

  // No value row was deleted, recreated, or modified, including the items without values.
  assert.deepEqual(valueRows(db), values);
  assert.deepEqual(templateValueRows(db), templateValues);

  // Item details and the edit form read the new label with the old value through the same field id.
  assert.deepEqual(itemService.get(items[1].id).fields.map(field => [field.id, field.name, field.value]), [
    [empty.id, 'Lens mount', null], [maker.id, 'Manufacturer', 'Nikon'], [year.id, 'Year', '1991'],
    [bought.id, 'Purchased on', '2024-02-29'], [works.id, 'Working', '1']
  ]);
  assert.deepEqual(itemService.get(bare.id).fields.map(field => field.value), [null, null, null, null, null]);
  assert.deepEqual(itemTemplateService.get(template.id).field_values, { [maker.id]: 'Leica', [year.id]: '1954', [works.id]: '1' });
  assert.equal(itemTemplateService.get(template.id).ignored_field_count, 0);

  // Suggestions are read by the field id, so they survive the rename.
  assert.deepEqual(customFieldService.suggestions(maker.id, { search: 'ni' }), [{ value: 'Nikon', usage_count: 12 }]);

  // Renaming to the same name is a no-op that returns the field unchanged.
  assert.deepEqual(customFieldService.rename(maker.id, { name: 'Manufacturer ' }), renamed);
});

test('a rename follows the field naming rules and never changes anything else', () => {
  const { categoryService, customFieldService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const lenses = categoryService.create({ name: 'Lenses' });
  const brand = customFieldService.create(cameras.id, { name: 'Brand', type: 'text' });
  customFieldService.create(cameras.id, { name: 'Manufacturer', type: 'text' });
  const lensMaker = customFieldService.create(lenses.id, { name: 'Maker', type: 'text' });

  failure(() => customFieldService.rename(999999, { name: 'X' }), 404, 'FIELD_NOT_FOUND');
  failure(() => customFieldService.rename(brand.id, { name: '   ' }), 400, 'FIELD_NAME_REQUIRED');
  failure(() => customFieldService.rename(brand.id, {}), 400, 'FIELD_NAME_REQUIRED');
  failure(() => customFieldService.rename(brand.id, { name: 42 }), 400, 'FIELD_NAME_REQUIRED');
  failure(() => customFieldService.rename(brand.id, { name: 'x'.repeat(61) }), 400, { code: 'FIELD_NAME_TOO_LONG', params: { max: 60 } });
  failure(() => customFieldService.rename(brand.id, { name: 'serial number' }), 400, { code: 'FIELD_NAME_RESERVED', params: { name: 'serial number' } });
  // Names stay unique per category, without regard to case.
  failure(() => customFieldService.rename(brand.id, { name: 'manufacturer' }), 409, { code: 'FIELD_ALREADY_EXISTS', params: { name: 'manufacturer' } });
  // Type and category cannot be changed, not even alongside a valid name.
  failure(() => customFieldService.rename(brand.id, { name: 'Make', type: 'number' }), 400, { code: 'FIELD_UPDATE_UNSUPPORTED_PROPERTY', params: { property: 'type' } });
  failure(() => customFieldService.rename(brand.id, { category_id: lenses.id }), 400, { code: 'FIELD_UPDATE_UNSUPPORTED_PROPERTY', params: { property: 'category_id' } });
  assert.deepEqual(customFieldService.requireField(brand.id), { id: brand.id, category_id: cameras.id, name: 'Brand', type: 'text' });

  // The same name in another category is allowed, and a change of case alone is a real rename.
  assert.equal(customFieldService.rename(lensMaker.id, { name: 'Brand' }).name, 'Brand');
  assert.equal(customFieldService.rename(brand.id, { name: 'BRAND' }).name, 'BRAND');
});

test('the database constraint still refuses a conflicting rename cleanly', () => {
  const { db, categoryService, customFieldService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const brand = customFieldService.create(cameras.id, { name: 'Brand', type: 'text' });
  customFieldService.create(cameras.id, { name: 'Model', type: 'text' });
  // Simulates a conflicting write that lands after the service compared the names.
  customFieldService.fields.listByCategory = () => [];

  failure(() => customFieldService.rename(brand.id, { name: 'MODEL' }), 409, { code: 'FIELD_ALREADY_EXISTS', params: { name: 'MODEL' } });
  assert.equal(db.prepare('SELECT name FROM custom_fields WHERE id = ?').get(brand.id).name, 'Brand');
});

test('Items columns split and merge by the current name and type after a rename', () => {
  const { categoryService, customFieldService, itemService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const lenses = categoryService.create({ name: 'Lenses' });
  const cameraMaker = customFieldService.create(cameras.id, { name: 'Manufacturer', type: 'text' });
  const lensMaker = customFieldService.create(lenses.id, { name: 'Manufacturer', type: 'text' });
  itemService.create({ name: 'F3', category_id: cameras.id, field_values: { [cameraMaker.id]: 'Nikon' } });
  itemService.create({ name: 'Summicron', category_id: lenses.id, field_values: { [lensMaker.id]: 'Leica' } });
  const custom = () => itemService.columns().fields.filter(column => !column.core).map(column => [column.key, column.label, column.fieldIds]);
  const values = key => itemService.list({ sort: 'name', fields: key }).items.map(item => [item.name, item.custom_values[key]]);

  assert.deepEqual(custom(), [['custom:text:manufacturer', 'Manufacturer', [cameraMaker.id, lensMaker.id]]]);

  customFieldService.rename(cameraMaker.id, { name: 'Brand' });
  assert.deepEqual(custom(), [['custom:text:brand', 'Brand', [cameraMaker.id]], ['custom:text:manufacturer', 'Manufacturer', [lensMaker.id]]]);
  assert.deepEqual(values('custom:text:brand'), [['F3', 'Nikon'], ['Summicron', undefined]]);

  customFieldService.rename(cameraMaker.id, { name: 'manufacturer' });
  assert.deepEqual(custom().map(([key, , ids]) => [key, ids]), [['custom:text:manufacturer', [cameraMaker.id, lensMaker.id]]]);
  assert.deepEqual(values('custom:text:manufacturer'), [['F3', 'Nikon'], ['Summicron', 'Leica']]);
});

test('Batch Add uses the current field name and refuses the old one', () => {
  const { categoryService, customFieldService, itemService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const maker = customFieldService.create(cameras.id, { name: 'Manufactuer', type: 'text' });
  customFieldService.rename(maker.id, { name: 'Manufacturer' });

  const template = itemImportTemplate(cameras, customFieldService.listForCategory(cameras.id));
  assert.deepEqual(Object.keys(template.items[0].customFields), ['Manufacturer']);

  const document = customFields => ({ version: 1, category: 'Cameras', items: [{ name: 'F3', customFields }] });
  failure(() => itemService.createBatch({ categoryId: cameras.id, document: document({ Manufactuer: 'Nikon' }) }), 400,
    { code: 'IMPORT_UNKNOWN_CUSTOM_FIELD', params: { index: 1, field: 'Manufactuer', known: 'Manufacturer' } });
  const [created] = itemService.createBatch({ categoryId: cameras.id, document: document({ Manufacturer: 'Nikon' }) });
  assert.deepEqual(itemService.get(created.id).fields.map(field => [field.name, field.value]), [['Manufacturer', 'Nikon']]);
});

test('creating and deleting fields still work around a rename', () => {
  const { categoryService, customFieldService } = build();
  const cameras = categoryService.create({ name: 'Cameras' });
  const brand = customFieldService.create(cameras.id, { name: 'Brand', type: 'text' });
  customFieldService.rename(brand.id, { name: 'Make' });

  // The old name is free again, while the new one is taken.
  const again = customFieldService.create(cameras.id, { name: 'Brand', type: 'text' });
  assert.throws(() => customFieldService.create(cameras.id, { name: 'make', type: 'text' }), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  customFieldService.remove(brand.id, true);
  assert.deepEqual(customFieldService.listForCategory(cameras.id).map(field => [field.id, field.name]), [[again.id, 'Brand']]);
});

test('PATCH /api/fields/:id renames a field and answers refusals with the error contract', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-field-rename-api-'));
  const server = await startServer(dataDir);
  try {
    const call = async (url, method, body) => {
      const response = await fetch(`${server.base}${url}`, body === undefined ? { method } : {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };
    const category = (await call('/api/categories', 'POST', { name: 'Cameras' })).body;
    const maker = (await call(`/api/categories/${category.id}/fields`, 'POST', { name: 'Manufactuer', type: 'text' })).body;
    await call(`/api/categories/${category.id}/fields`, 'POST', { name: 'Model', type: 'text' });
    const item = (await call('/api/items', 'POST', { name: 'F3', category_id: category.id, field_values: { [maker.id]: 'Nikon' } })).body;

    assert.deepEqual(await call(`/api/fields/${maker.id}`, 'PATCH', { name: ' Manufacturer ' }), {
      status: 200, body: { id: maker.id, category_id: category.id, name: 'Manufacturer', type: 'text' }
    });
    const fields = (await call(`/api/items/${item.uuid}`, 'GET')).body.fields;
    assert.deepEqual(fields.map(field => [field.name, field.value]), [['Manufacturer', 'Nikon'], ['Model', null]]);

    assert.deepEqual(await call(`/api/fields/${maker.id}`, 'PATCH', { name: 'model' }),
      { status: 409, body: { error: { code: 'FIELD_ALREADY_EXISTS', params: { name: 'model' } } } });
    assert.deepEqual(await call(`/api/fields/${maker.id}`, 'PATCH', { name: 'Make', type: 'number' }),
      { status: 400, body: { error: { code: 'FIELD_UPDATE_UNSUPPORTED_PROPERTY', params: { property: 'type' } } } });
    assert.deepEqual(await call('/api/fields/999999', 'PATCH', { name: 'X' }),
      { status: 404, body: { error: { code: 'FIELD_NOT_FOUND', params: {} } } });
  } finally {
    await stopServer(server.child);
  }
});
