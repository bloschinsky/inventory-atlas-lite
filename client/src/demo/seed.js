import * as fixture from './fixture.js';

const PHOTO_TYPE = 'image/webp';

/*
  Loads the canonical demo inventory through the regular services, in a fixed order, so the numeric
  ids are always the same too. `photos` maps a photo file name to its bytes. Only the values the API
  never accepts from a client are written directly afterwards: the fixed UUIDs and the dates.
*/
export function seedDemoInventory(services, photos) {
  const { db, categoryService, customFieldService, itemService, photoService, itemTemplateService, checklistService,
    checklistRunService, databaseMetadataService } = services;
  databaseMetadataService.rename({ name: fixture.DEMO_DATABASE_NAME });

  const categories = new Map();
  for (const definition of fixture.categories) {
    const category = categoryService.create({ name: definition.name });
    const fields = new Map(definition.fields.map(field => [field.name, customFieldService.create(category.id, field).id]));
    categories.set(definition.name, { id: category.id, fields });
  }
  const values = (category, fields = {}) => Object.fromEntries(Object.entries(fields)
    .map(([name, value]) => [category.fields.get(name), value]));

  const ids = new Map();
  fixture.items.forEach((definition, index) => {
    const { key, category: categoryName, parent, fields, photo, addedDaysAgo, ...attributes } = definition;
    const category = categories.get(categoryName);
    const item = itemService.create({
      ...attributes,
      category_id: category.id,
      parent_item_id: parent ? ids.get(parent) : null,
      field_values: values(category, fields)
    });
    ids.set(key, item.id);
    db.prepare(`
      UPDATE items SET uuid = ?, created_at = datetime('now', ?), updated_at = datetime('now', ?) WHERE id = ?
    `).run(fixture.demoUuid(index + 1), `-${addedDaysAgo} days`, `-${addedDaysAgo} days`, item.id);
    if (photo) {
      if (!photos.has(photo)) throw new Error(`The demo photo ${photo} is missing.`);
      photoService.addToItem(item.id, [{ originalname: photo, mimetype: PHOTO_TYPE, buffer: photos.get(photo) }]);
    }
  });

  for (const { category: categoryName, fields, ...attributes } of fixture.templates) {
    const category = categories.get(categoryName);
    itemTemplateService.create({ ...attributes, category_id: category.id, field_values: values(category, fields) });
  }

  for (const { items, run, ...attributes } of fixture.checklists) {
    const checklist = checklistService.create({ ...attributes, items: items.map(key => ({ item_id: ids.get(key) })) });
    if (!run) continue;
    const started = checklistRunService.start(checklist.id);
    const missing = new Set(run.missing.map(key => ids.get(key)));
    for (const entry of started.items) {
      checklistRunService.updateItem(started.id, entry.id, { status: missing.has(entry.item_id) ? 'missing' : 'confirmed' });
    }
    checklistRunService.complete(started.id);
  }
  return ids;
}
