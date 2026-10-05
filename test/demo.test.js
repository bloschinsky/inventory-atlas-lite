import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import initSqlJs from 'sql.js';
import * as fixture from '../client/src/demo/fixture.js';
import { seedDemoInventory } from '../client/src/demo/seed.js';
import { createDemoServices } from '../client/src/demo/services.js';
import { openDemoDatabase } from '../client/src/demo/sqlite.js';
import en from '../client/src/i18n/locales/en.json' with { type: 'json' };
import uk from '../client/src/i18n/locales/uk.json' with { type: 'json' };

/*
  The public demo's data layer, run in Node: the sql.js adapter, the canonical fixture, and its seed
  through the real services. The demo needs neither better-sqlite3 nor a data directory.
*/
const SQL = await initSqlJs();
const photosDir = new URL('../client/src/demo/photos/', import.meta.url);
const photos = new Map(fixture.photoFiles.map(name => [name, new Uint8Array(fs.readFileSync(new URL(name, photosDir)))]));

const seeded = () => {
  const services = createDemoServices(SQL);
  seedDemoInventory(services, photos);
  return services;
};

// Everything a visitor sees of the inventory, without the timestamps, which follow the visit.
const withoutTimestamps = value => JSON.parse(JSON.stringify(value, (key, field) => (key.endsWith('_at') ? undefined : field)));
const snapshot = ({ itemService, categoryService, checklistService, itemTemplateService }) => ({
  categories: categoryService.list().map(({ id, name, item_count: count }) => ({ id, name, count })),
  items: itemService.hierarchy().items.map(item => withoutTimestamps(itemService.get(item.uuid))),
  checklists: checklistService.list().map(({ id, name, mode }) => ({ id, name, mode })),
  templates: itemTemplateService.list().map(({ id, name }) => ({ id, name }))
});

test('the canonical fixture loads deterministically, with fixed UUIDs and ids', () => {
  const first = seeded();
  assert.deepEqual(snapshot(first), snapshot(seeded()));
  fixture.items.forEach((definition, index) => {
    const item = first.itemService.get(fixture.demoUuid(index + 1));
    assert.equal(item.name, definition.name);
    assert.equal(item.id, index + 1);
  });
  assert.equal(first.databaseMetadataService.get().name, fixture.DEMO_DATABASE_NAME);
});

test('the seeded inventory has its locations, containers, categories, fields, and photos', () => {
  const { itemService, categoryService } = seeded();
  assert.deepEqual(categoryService.list().map(category => category.name).sort(), fixture.categories.map(category => category.name).sort());

  const nodes = itemService.hierarchy().items;
  const locations = new Set(nodes.map(node => node.effective_location).filter(Boolean));
  for (const location of ['Home / Office', 'Home / Storage', 'Workshop', 'Travel gear']) assert.ok(locations.has(location), location);

  for (const name of ['Camera Bag', 'Electronics Drawer', 'Tool Cabinet', 'Camping Box', 'Archive Box']) {
    const container = nodes.find(node => node.name === name);
    assert.ok(nodes.some(node => node.parent_id === container.id), `${name} contains items`);
  }

  const camera = itemService.get(fixture.demoUuid(fixture.items.findIndex(item => item.key === 'nikon-f65') + 1));
  assert.equal(camera.parent.name, 'Camera Bag');
  assert.equal(camera.condition_grade, 'good');
  assert.equal(camera.serial_number, 'F65-2481937');
  assert.deepEqual(camera.fields.map(field => [field.name, field.value]), [['Mount', 'Nikon F'], ['Format', '35mm film'], ['Last tested', '2026-08-23']]);
  assert.equal(camera.photos.length, 1);
  assert.equal(camera.photos[0].filename, 'nikon-f65.webp');
});

test('search, filters, the hierarchy, the dashboard, and checklists work on the demo data', () => {
  const { itemService, dashboardService, checklistRunService, categoryService } = seeded();
  assert.deepEqual(itemService.list({ search: 'drill' }).items.map(item => item.name), ['Cordless drill']);
  const tools = categoryService.list().find(category => category.name === 'Tools');
  assert.equal(itemService.list({ categoryId: String(tools.id) }).pagination.total, 3);

  const dashboard = dashboardService.overview({});
  assert.equal(dashboard.totalItems, fixture.items.length);
  assert.equal(dashboard.photoCoverage.withPhotos, fixture.photoFiles.length);
  assert.equal(dashboard.placement.unplaced, 1);
  assert.ok(dashboard.addedLast30Days > 0, 'the 30-day window follows the visit');

  const [run] = checklistRunService.list();
  assert.equal(run.status, 'completed');
  const drill = itemService.list({ search: 'drill' }).items[0];
  assert.ok(itemService.get(drill.uuid).last_verified_at, 'a completed verification run sets Last verified');
});

test('changes stay in their own demo database, and a new one starts from the fixture again', () => {
  const visit = seeded();
  const category = visit.categoryService.list()[0];
  visit.itemService.create({ name: 'Visitor item', category_id: category.id });
  visit.itemService.remove(fixture.demoUuid(fixture.items.findIndex(item => item.key === 'hdmi-adapter') + 1));
  assert.equal(visit.itemService.list({ search: 'Visitor' }).items.length, 1);

  const reset = seeded();
  assert.equal(reset.itemService.list({ search: 'Visitor' }).items.length, 0);
  assert.deepEqual(snapshot(reset), snapshot(seeded()));
});

test('the guided tour item fits the fixture and is not part of the seeded inventory', () => {
  const { tourItem } = fixture;
  const visit = seeded();
  assert.ok(fixture.photoFiles.includes(tourItem.photo), 'the tour reuses a generated demo photo');
  assert.equal(visit.itemService.list({ search: tourItem.name }).items.length, 0);

  // The values the tour types into the form are valid for the real services.
  const category = visit.categoryService.list().find(entry => entry.name === tourItem.category);
  const fields = visit.db.prepare('SELECT id, name FROM custom_fields WHERE category_id = ?').all(category.id);
  const container = visit.itemService.list({ search: tourItem.container }).items.find(item => item.name === tourItem.container);
  const created = visit.itemService.create({
    name: tourItem.name,
    category_id: category.id,
    parent_item_id: container.id,
    condition_grade: tourItem.condition,
    serial_number: tourItem.serialNumber,
    field_values: Object.fromEntries(Object.entries(tourItem.fields).map(([name, value]) => [fields.find(field => field.name === name).id, value]))
  });
  const item = visit.itemService.get(created.uuid);
  assert.equal(item.parent.name, tourItem.container);
  assert.equal(item.effective_location, 'Home / Office');
});

test('the Templates and Checklists chapters find their template and checklist in the fixture', () => {
  const visit = seeded();
  const [template] = fixture.templates;
  const [checklist] = fixture.checklists;
  assert.equal(template.category, fixture.tourItem.category);
  assert.ok(Object.keys(template.fields).length, 'the template predefines a category field');
  const [listed] = visit.itemTemplateService.list();
  assert.equal(listed.name, template.name);
  // The chapter checks the first item of a checklist that has never run, so the change is visible.
  const [seededChecklist] = visit.checklistService.list();
  assert.equal(seededChecklist.name, checklist.name);
  assert.equal(seededChecklist.last_run, null);
  assert.equal(fixture.items.find(item => item.key === checklist.items[0]).name, 'Nikon F65');
});

/*
  The presenter copy follows the ASD-STE100-inspired rules of docs/features/demo-guided-tour.md:
  short scenes of one or two sentences, the product's own terms, and no filler or vague openers.
  Ukrainian keeps the same brevity.
*/
test('the guided tour copy stays short, direct, and consistent in both languages', () => {
  const scenes = locale => Object.entries(locale.tour.chapters)
    .flatMap(([chapter, { scenes: entries }]) => Object.entries(entries).map(([id, text]) => ({ id: `${chapter}.${id}`, text })));
  const english = scenes(en);
  assert.deepEqual(scenes(uk).map(entry => entry.id), english.map(entry => entry.id));
  assert.equal(Object.keys(en.tour.chapters).length, 8);
  const sentences = text => text.split(/(?<=[.!?])s+/).filter(Boolean);
  for (const { id, text } of [...english, ...scenes(uk)]) {
    assert.ok(sentences(text).length <= 2, `${id} has at most two sentences`);
    assert.ok(text.length <= 160, `${id} stays short`);
  }
  for (const { id, text } of english) {
    for (const sentence of sentences(text)) {
      assert.ok(sentence.split(/s+/).length <= 22, `${id}: "${sentence}" is one short sentence`);
      assert.doesNotMatch(sentence, /^(It|This|That|They) /, `${id}: "${sentence}" names its subject`);
    }
    // One term per concept, and no marketing filler or vague openers.
    assert.doesNotMatch(text, /\b(asset|object|thing|stuff|metadata|property|properties|record|records)\b/i, id);
    assert.doesNotMatch(text, /\b(simply|easily|just|powerful|seamless|amazing|let's|let us|quickly)\b/i, id);
  }
  // The UI names the product's concepts, and the copy uses them.
  const copy = english.map(entry => entry.text).join(' ');
  for (const term of ['Item', 'Category', 'Field', 'Location', 'Hierarchy', 'Tree View', 'Graph View', 'Template', 'Checklist', 'Dashboard', 'Condition']) {
    assert.ok(copy.includes(term), `the copy uses the term ${term}`);
  }
});

test('the sql.js adapter keeps the better-sqlite3 behavior the repositories rely on', () => {
  const db = openDemoDatabase(SQL);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
  assert.deepEqual(db.prepare('INSERT INTO t (name) VALUES (?)').run('a'), { changes: 1, lastInsertRowid: 1 });
  assert.deepEqual(db.prepare('SELECT * FROM t WHERE name = @name').get({ name: 'a' }), { id: 1, name: 'a' });
  assert.equal(db.prepare('SELECT * FROM t WHERE id = ?').get(9), undefined);
  assert.throws(() => db.prepare('INSERT INTO t (name) VALUES (?)').run('a'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });

  // A failing inner transaction rolls back only its own work, as a savepoint.
  db.transaction(() => {
    db.prepare('INSERT INTO t (name) VALUES (?)').run('b');
    assert.throws(() => db.transaction(() => {
      db.prepare('INSERT INTO t (name) VALUES (?)').run('c');
      throw new Error('inner');
    })());
  })();
  assert.deepEqual(db.prepare('SELECT name FROM t ORDER BY id').all().map(row => row.name), ['a', 'b']);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
});

test('the demo ships only its own generated photos and invented data', () => {
  const files = fs.readdirSync(photosDir).sort();
  assert.deepEqual(files, [...fixture.photoFiles].sort(), 'every photo file belongs to a fixture item');
  for (const name of files) {
    const bytes = fs.readFileSync(new URL(name, photosDir));
    assert.equal(bytes.toString('latin1', 0, 4), 'RIFF', name);
    assert.equal(bytes.toString('latin1', 8, 12), 'WEBP', name);
    assert.ok(bytes.length < 200 * 1024, `${name} is optimized for the web`);
  }
  // No hotlinked image, address, or contact detail anywhere in the fixture.
  const text = JSON.stringify([fixture.categories, fixture.items, fixture.templates, fixture.checklists]);
  assert.doesNotMatch(text, /https?:|www\.|@|\+\d{6,}/);
});
