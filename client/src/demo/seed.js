import { createDemoFixture, demoUuid } from './fixture.js';

const PHOTO_TYPE = 'image/webp';

/*
  Loads the canonical demo inventory in one language through the regular services, in a fixed
  order, so the numeric ids are always the same too, whatever the language. `photos` maps a photo
  file name to its bytes. Only the values the API never accepts from a client are written directly
  afterwards: the fixed UUIDs and the dates. Returns the item ids by item key.
*/
export function seedDemoInventory(services, photos, locale) {
  const { db, categoryService, customFieldService, itemService, itemTransferService, photoService, itemTemplateService, checklistService,
    checklistRunService, databaseMetadataService } = services;
  const fixture = createDemoFixture(locale);
  databaseMetadataService.rename({ name: fixture.databaseName });

  const categories = new Map();
  for (const definition of fixture.categories) {
    const category = categoryService.create({ name: definition.name });
    const fields = new Map(definition.fields.map(({ key, name, type }) => [key, customFieldService.create(category.id, { name, type }).id]));
    categories.set(definition.key, { id: category.id, fields });
  }
  const values = (category, fields = {}) => Object.fromEntries(Object.entries(fields)
    .map(([key, value]) => [category.fields.get(key), value]));

  const ids = new Map();
  fixture.items.forEach((definition, index) => {
    const { key, category: categoryKey, parent, fields, photo, addedDaysAgo, previously, ...attributes } = definition;
    const category = categories.get(categoryKey);
    const item = itemService.create({
      ...attributes,
      category_id: category.id,
      location: previously?.location ?? attributes.location,
      parent_item_id: (previously?.parent ?? parent) ? ids.get(previously?.parent ?? parent) : null,
      field_values: values(category, fields)
    });
    ids.set(key, item.id);
    db.prepare(`
      UPDATE items SET uuid = ?, created_at = datetime('now', ?), updated_at = datetime('now', ?) WHERE id = ?
    `).run(demoUuid(index + 1), `-${addedDaysAgo} days`, `-${addedDaysAgo} days`, item.id);
    if (photo) {
      if (!photos.has(photo)) throw new Error(`The demo photo ${photo} is missing.`);
      photoService.addToItem(item.id, [{ originalname: photo, mimetype: PHOTO_TYPE, buffer: photos.get(photo) }]);
    }
  });

  /*
    The curated activity history, oldest first: each move goes through the services, which record it,
    and only its dates are set back afterwards. Loans take their past dates through the API itself.
  */
  const moves = fixture.items.filter(item => item.previously).sort((a, b) => b.previously.daysAgo - a.previously.daysAgo);
  for (const { key, parent, location, previously } of moves) {
    const id = ids.get(key);
    if (previously.parent) itemService.bulkMove({ item_ids: [id], parent_item_id: ids.get(parent) });
    else {
      const current = itemService.get(id);
      itemService.update(id, { ...current, location, field_values: Object.fromEntries(current.fields.map(field => [field.id, field.value])) });
    }
    const offset = `-${previously.daysAgo} days`;
    db.prepare(`
      UPDATE item_events SET occurred_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) WHERE operation_id = (SELECT MAX(id) FROM item_operations)
    `).run(offset);
    db.prepare(`UPDATE item_operations SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) WHERE id = (SELECT MAX(id) FROM item_operations)`)
      .run(offset);
    db.prepare(`UPDATE items SET updated_at = datetime('now', ?) WHERE id = ?`).run(offset, id);
  }
  const daysAgo = days => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  for (const loan of fixture.loans) {
    const id = ids.get(loan.item);
    const transfer = itemTransferService.start(id, {
      recipient: loan.recipient,
      transferred_at: daysAgo(loan.daysAgo).toISOString(),
      expected_return_on: daysAgo(loan.expectedReturnDaysAgo).toISOString().slice(0, 10)
    });
    itemTransferService.markReturned(id, transfer.id, { returned_at: daysAgo(loan.returnedDaysAgo).toISOString() });
    db.prepare(`UPDATE items SET updated_at = datetime('now', ?) WHERE id = ?`).run(`-${loan.returnedDaysAgo} days`, id);
  }

  for (const { category: categoryKey, fields, ...attributes } of fixture.templates) {
    const category = categories.get(categoryKey);
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
