import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import initSqlJs from 'sql.js';
import { byKey, createDemoFixture, demoItemUuid, demoUuid, photoFiles } from '../client/src/demo/fixture.js';
import { seedDemoInventory } from '../client/src/demo/seed.js';
import { createDemoServices } from '../client/src/demo/services.js';
import { openDemoDatabase } from '../client/src/demo/sqlite.js';
import { SUPPORTED_LOCALES } from '../client/src/i18n/core.js';
import en from '../client/src/i18n/locales/en.json' with { type: 'json' };
import uk from '../client/src/i18n/locales/uk.json' with { type: 'json' };

/*
  The public demo's data layer, run in Node: the sql.js adapter, the canonical fixture in every
  language, and its seed through the real services. The demo needs neither better-sqlite3 nor a data
  directory.
*/
const SQL = await initSqlJs();
const photosDir = new URL('../client/src/demo/photos/', import.meta.url);
const photos = new Map(photoFiles.map(name => [name, new Uint8Array(fs.readFileSync(new URL(name, photosDir)))]));
const locales = SUPPORTED_LOCALES.map(locale => locale.code);
const fixture = createDemoFixture('en');

const seeded = (locale = 'en') => {
  const services = createDemoServices(SQL);
  seedDemoInventory(services, photos, locale);
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

/*
  The structure of a seeded inventory with every localized text left out: ids, UUIDs, relations, and
  values. Lists are sorted by id, because the application sorts them by name, which is language-dependent.
*/
const byId = list => [...list].sort((a, b) => a.id - b.id);
const counts = list => list.map(entry => entry.count).sort((a, b) => a - b);
const structure = services => {
  const { itemService, categoryService, dashboardService, checklistService, itemTemplateService } = services;
  const items = byId(itemService.hierarchy().items).map(({ uuid }) => itemService.get(uuid));
  const dashboard = dashboardService.overview({});
  return {
    categories: byId(categoryService.list()).map(({ id, item_count: count }) => ({ id, count })),
    items: items.map(item => ({
      id: item.id, uuid: item.uuid, parent: item.parent?.uuid ?? null, category: item.category_id, is_new: item.is_new,
      condition: item.condition_grade, serial: item.serial_number, date: item.purchase_date,
      price: [item.purchase_price_amount, item.purchase_price_currency], photos: item.photos.map(photo => photo.filename),
      fields: item.fields.map(field => [field.id, field.type, field.type === 'text' ? typeof field.value : field.value])
    })),
    checklists: byId(checklistService.list()).map(({ id, mode, item_count: count }) => ({ id, mode, count })),
    templates: byId(itemTemplateService.list()).map(({ id, category_id: category }) => ({ id, category })),
    dashboard: {
      totalItems: dashboard.totalItems,
      photoCoverage: dashboard.photoCoverage,
      placement: dashboard.placement,
      categories: counts(dashboard.categoryDistribution),
      conditions: dashboard.conditionDistribution.map(({ key, count }) => [key, count]),
      locations: counts(dashboard.locationDistribution)
    }
  };
};

test('the canonical fixture loads deterministically, with fixed UUIDs and ids', () => {
  const first = seeded();
  assert.deepEqual(snapshot(first), snapshot(seeded()));
  fixture.items.forEach((definition, index) => {
    const item = first.itemService.get(demoUuid(index + 1));
    assert.equal(item.name, definition.name);
    assert.equal(item.id, index + 1);
    assert.equal(demoItemUuid(definition.key), item.uuid);
  });
  assert.equal(first.databaseMetadataService.get().name, fixture.databaseName);
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

  const camera = itemService.get(demoItemUuid('nikon-f65'));
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
  assert.equal(dashboard.photoCoverage.withPhotos, photoFiles.length);
  assert.equal(dashboard.placement.unplaced, 1);
  assert.ok(dashboard.addedLast30Days > 0, 'the 30-day window follows the visit');

  const [run] = checklistRunService.list();
  assert.equal(run.status, 'completed');
  assert.ok(itemService.get(demoItemUuid('cordless-drill')).last_verified_at, 'a completed verification run sets Last verified');
});

test('the demo retires and restores a container with its contents through the shared lifecycle service', () => {
  const { itemService, itemLifecycleService, dashboardService } = seeded();
  const nodes = itemService.hierarchy().items;
  const container = nodes.find(node => node.parent_id !== null && node.children_count > 0) ?? nodes.find(node => node.children_count > 0);
  const subtree = itemService.get(container.uuid).descendant_count + 1;
  const retired = itemLifecycleService.change(container.uuid, { status: 'retired', reason: 'gifted', include_contents: true });
  assert.equal(retired.affected_count, subtree);
  assert.equal(retired.item.parent, null);
  assert.equal(itemService.list({ lifecycle: 'retired' }).pagination.total, subtree);
  assert.equal(dashboardService.overview({}).totalItems, fixture.items.length - subtree);
  assert.equal(dashboardService.overview({}).retiredItems, subtree);
  assert.equal(itemService.hierarchy({ lifecycle: 'retired' }).items.length, subtree);

  const restored = itemLifecycleService.change(container.uuid, { status: 'active' });
  assert.equal(restored.affected_count, subtree);
  assert.equal(itemService.list({ lifecycle: 'retired' }).pagination.total, 0);
  assert.equal(itemService.list().pagination.total, fixture.items.length);
});

test('changes stay in their own demo database, and a new one starts from the fixture again', () => {
  const visit = seeded();
  const category = visit.categoryService.list()[0];
  visit.itemService.create({ name: 'Visitor item', category_id: category.id });
  visit.itemService.remove(demoItemUuid('hdmi-adapter'));
  assert.equal(visit.itemService.list({ search: 'Visitor' }).items.length, 1);

  const reset = seeded();
  assert.equal(reset.itemService.list({ search: 'Visitor' }).items.length, 0);
  assert.deepEqual(snapshot(reset), snapshot(seeded()));
});

test('every supported language has the whole demo inventory, and the same one', () => {
  const english = structure(seeded('en'));
  for (const locale of locales) {
    const localized = createDemoFixture(locale);
    assert.equal(localized.locale, locale);
    for (const list of ['categories', 'items', 'templates', 'checklists']) {
      assert.deepEqual(localized[list].map(entity => entity.key), fixture[list].map(entity => entity.key), `${locale} ${list}`);
    }
    assert.deepEqual(localized.categories.map(category => category.fields.map(field => [field.key, field.type])),
      fixture.categories.map(category => category.fields.map(field => [field.key, field.type])));
    assert.deepEqual(Object.keys(localized.locations), Object.keys(fixture.locations));
    // The same ids, UUIDs, relations, photos, numbers, dates, prices, and Dashboard figures.
    assert.deepEqual(structure(seeded(locale)), english, locale);
  }
});

test('the Ukrainian demo translates the invented text and keeps names, serials, standards, and units', () => {
  const ukrainian = createDemoFixture('uk');
  const services = seeded('uk');
  assert.equal(services.databaseMetadataService.get().name, 'Демо Inventory Atlas');
  assert.deepEqual(Object.values(ukrainian.locations), ['Дім / Кабінет', 'Дім / Комора', 'Майстерня', 'Туристичне спорядження']);
  assert.equal(byKey(ukrainian.categories, 'photography').name, 'Фототехніка');
  assert.deepEqual(byKey(ukrainian.categories, 'photography').fields.map(field => field.name), ['Байонет', 'Формат', 'Остання перевірка']);
  assert.equal(byKey(ukrainian.items, 'camera-bag').name, 'Сумка для камери');
  assert.equal(byKey(ukrainian.templates, 'film-roll').name, 'Фотоплівка 35 мм');
  assert.equal(byKey(ukrainian.checklists, 'weekend-photo-walk').name, 'Фотопрогулянка на вихідних');
  assert.equal(ukrainian.tourItem.name, 'Nikon F65 (запасний корпус)');

  // Every invented text differs from English, unless it is a proper name, a standard, or a value with a unit.
  const kept = new Set(['Nikon F65', 'Nikon F', 'USB-C', '1 TB', '2004–2010', '1998–2003']);
  const texts = entity => ['name', 'description', 'condition_notes'].map(name => entity[name]).filter(Boolean)
    .concat(Object.values(entity.fields ?? {}).filter(value => typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)));
  for (const [index, item] of ukrainian.items.entries()) {
    const english = texts(fixture.items[index]);
    texts(item).forEach((text, position) => {
      if (!kept.has(text)) assert.notEqual(text, english[position], `${item.key}: "${text}" is translated`);
    });
  }

  const camera = services.itemService.get(demoItemUuid('nikon-f65'));
  assert.equal(camera.name, 'Nikon F65');
  assert.equal(camera.serial_number, 'F65-2481937');
  assert.equal(camera.parent.name, 'Сумка для камери');
  assert.equal(camera.effective_location, 'Дім / Кабінет');
  assert.deepEqual(camera.fields.map(field => [field.name, field.value]), [['Байонет', 'Nikon F'], ['Формат', 'Плівка 35 мм'], ['Остання перевірка', '2026-08-23']]);
  assert.equal(services.itemService.get(demoItemUuid('portable-ssd')).name, 'Портативний SSD 1 TB');
  assert.equal(services.itemService.list({ search: 'Nikon' }).items.length, 3);
});

test('the demo has a small recorded activity history in every language', () => {
  for (const locale of locales) {
    const { itemService } = seeded(locale);
    const { items, loans } = createDemoFixture(locale);
    const history = key => itemService.activity(demoItemUuid(key), {}).events;
    const [radioMove] = history('handheld-radio');
    // The Camping Box moved, and its contents moved with it.
    assert.deepEqual([radioMove.type, radioMove.from, radioMove.to, radioMove.via_item.name],
      ['location_changed', byKey(items, 'archive-box').location, byKey(items, 'camping-box').location, byKey(items, 'camping-box').name]);
    assert.ok(Date.parse(radioMove.occurred_at) < Date.now() - 20 * 24 * 60 * 60 * 1000, 'the move is dated in the past');
    assert.deepEqual(history('speedlight').map(event => [event.type, event.from_item.name, event.to_item.name]),
      [['container_changed', byKey(items, 'electronics-drawer').name, byKey(items, 'camera-bag').name]]);
    const drill = history('cordless-drill');
    assert.deepEqual(drill.map(event => event.type), ['returned', 'transferred']);
    assert.equal(drill[0].transfer.recipient, loans[0].recipient);
    assert.equal(itemService.get(demoItemUuid('cordless-drill')).transferred_to, null);
    assert.deepEqual(history('nikon-f65'), [], 'items without curated activity have no fabricated history');
  }
});

test('an unsupported language gets the English demo', () => {
  assert.deepEqual(createDemoFixture('de'), fixture);
  assert.deepEqual(createDemoFixture(), fixture);
  assert.equal(seeded('fr').databaseMetadataService.get().name, fixture.databaseName);
});

test('the guided tour item fits the fixture in every language and is not part of the seeded inventory', () => {
  assert.ok(photoFiles.includes(fixture.tourItem.photo), 'the tour reuses a generated demo photo');
  for (const locale of locales) {
    const { tourItem, categories, items } = createDemoFixture(locale);
    const visit = seeded(locale);
    assert.equal(visit.itemService.list({ search: tourItem.serialNumber }).items.length, 0);

    // The values the tour types into the form are valid for the real services.
    const category = visit.categoryService.list().find(entry => entry.name === byKey(categories, tourItem.category).name);
    const fields = visit.db.prepare('SELECT id, name FROM custom_fields WHERE category_id = ?').all(category.id);
    const fieldNames = new Map(byKey(categories, tourItem.category).fields.map(field => [field.key, field.name]));
    const container = visit.itemService.get(demoItemUuid(tourItem.container));
    const created = visit.itemService.create({
      name: tourItem.name,
      category_id: category.id,
      parent_item_id: container.id,
      condition_grade: tourItem.condition,
      serial_number: tourItem.serialNumber,
      field_values: Object.fromEntries(Object.entries(tourItem.fields).map(([key, value]) => [fields.find(field => field.name === fieldNames.get(key)).id, value]))
    });
    const item = visit.itemService.get(created.uuid);
    assert.equal(item.parent.name, byKey(items, tourItem.container).name);
    assert.equal(item.effective_location, byKey(items, tourItem.container).location);
    // The tour finds its item again by the unique serial number.
    assert.deepEqual(visit.itemService.list({ search: tourItem.serialNumber }).items.map(entry => [entry.id, entry.serial_number]), [[item.id, tourItem.serialNumber]]);
  }
});

test('the Templates and Checklists chapters find their template and checklist in the fixture', () => {
  for (const locale of locales) {
    const localized = createDemoFixture(locale);
    const visit = seeded(locale);
    const template = byKey(localized.templates, 'film-roll');
    const checklist = byKey(localized.checklists, 'weekend-photo-walk');
    assert.equal(template.category, localized.tourItem.category);
    assert.ok(Object.keys(template.fields).length, 'the template predefines a category field');
    const [listed] = visit.itemTemplateService.list();
    assert.equal(listed.name, template.name);
    // The chapter checks the first item of a checklist that has never run, so the change is visible.
    const seededChecklist = visit.checklistService.list().find(entry => entry.name === checklist.name);
    assert.ok(seededChecklist, checklist.name);
    assert.equal(seededChecklist.last_run, null);
    assert.equal(checklist.items[0], 'nikon-f65');
  }
});

/*
  The presenter copy follows the ASD-STE100-inspired rules of docs/features/demo-guided-tour.md:
  short scenes of one or two sentences, the product's own terms, and no filler or vague openers.
  Ukrainian keeps the same brevity. Fixture names arrive as {placeholders}, never as English text.
*/
test('the guided tour copy stays short, direct, and consistent in both languages', () => {
  const scenes = locale => Object.entries(locale.tour.chapters)
    .flatMap(([chapter, { scenes: entries }]) => Object.entries(entries).map(([id, text]) => ({ id: `${chapter}.${id}`, text })));
  const english = scenes(en);
  assert.deepEqual(scenes(uk).map(entry => entry.id), english.map(entry => entry.id));
  assert.equal(Object.keys(en.tour.chapters).length, 8);
  const sentences = text => text.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (const { id, text } of [...english, ...scenes(uk)]) {
    assert.ok(sentences(text).length <= 2, `${id} has at most two sentences`);
    assert.ok(text.length <= 160, `${id} stays short`);
  }
  for (const { id, text } of english) {
    for (const sentence of sentences(text)) {
      assert.ok(sentence.split(/\s+/).length <= 22, `${id}: "${sentence}" is one short sentence`);
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
  // No scene names a fixture entity in a fixed language.
  const names = locales.flatMap(locale => {
    const { categories, items, templates, checklists, locations } = createDemoFixture(locale);
    return [...categories.flatMap(category => [category.name, ...category.fields.map(field => field.name)]),
      ...items.map(item => item.name), ...templates.map(entry => entry.name), ...checklists.map(entry => entry.name), ...Object.values(locations)];
  });
  for (const { id, text } of [...english, ...scenes(uk)]) {
    for (const name of new Set(names)) assert.ok(!text.includes(name), `${id} names "${name}" instead of a placeholder`);
  }
});

/*
  The contextual action labels of the presenter: `actions.<scene>` names what a scene's action does,
  and `continue.<scene>` the scene an action-less scene shows next (see actionLabelKey() in
  client/src/demo/tourChapters.js). Each one is a short, specific command in both languages.
*/
test('the guided tour action labels are short, specific, and in both languages', () => {
  const labels = locale => Object.entries(locale.tour.chapters).flatMap(([chapter, entry]) => ['actions', 'continue']
    .flatMap(group => Object.entries(entry[group] ?? {}).map(([scene, text]) => ({ id: `${chapter}.${group}.${scene}`, chapter, group, scene, text }))));
  const english = labels(en);
  assert.deepEqual(labels(uk).map(entry => entry.id), english.map(entry => entry.id));
  assert.ok(english.length >= 30, 'the scenes have their own labels');
  for (const { id, chapter, group, scene, text } of [...english, ...labels(uk)]) {
    const scenes = Object.keys(en.tour.chapters[chapter].scenes);
    assert.ok(scenes.includes(scene), `${id} names a scene of its chapter`);
    if (group === 'continue') assert.notEqual(scene, scenes[0], `${id}: the first scene is never shown by Continue`);
    assert.ok(text.split(/\s+/).length <= 5 && text.length <= 40, `${id} is one short label`);
    assert.doesNotMatch(text, /[.!?]$/, `${id} is a command, not a sentence`);
    assert.doesNotMatch(text, /^(continue|go|do it|see more|ok|далі|продовжити)$/i, `${id} says what will happen`);
  }
  // Each English label starts with a verb, and none of them is used twice in a chapter.
  for (const { id, text } of english) assert.match(text, /^(Show|Select|Compare|Group|Open|Enter|Set|Add|Place|Fill|Save|Filter|Sort|Search|Start|Mark|Finish) /, id);
  for (const chapter of Object.keys(en.tour.chapters)) {
    const texts = english.filter(entry => entry.chapter === chapter).map(entry => entry.text);
    assert.equal(new Set(texts).size, texts.length, `${chapter} has distinct labels`);
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
  assert.deepEqual(files, [...photoFiles].sort(), 'every photo file belongs to a fixture item');
  for (const name of files) {
    const bytes = fs.readFileSync(new URL(name, photosDir));
    assert.equal(bytes.toString('latin1', 0, 4), 'RIFF', name);
    assert.equal(bytes.toString('latin1', 8, 12), 'WEBP', name);
    assert.ok(bytes.length < 200 * 1024, `${name} is optimized for the web`);
  }
  // No hotlinked image, address, or contact detail anywhere in the fixture.
  for (const locale of locales) assert.doesNotMatch(JSON.stringify(createDemoFixture(locale)), /https?:|www\.|@|\+\d{6,}/);
});
