// Item templates and their stored custom field values. Statements are prepared when they are used,
// because a restore replaces the connection behind the `db` proxy.
export class ItemTemplateRepository {
  constructor(db) {
    this.db = db;
  }

  transaction(work) {
    return this.db.transaction(work)();
  }

  // A template whose category was deleted is listed with a null category name.
  list() {
    return this.db.prepare(`
      SELECT t.id, t.name, t.category_id, c.name AS category_name, t.item_name, t.created_at, t.updated_at
      FROM item_templates t LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.name COLLATE NOCASE, t.id
    `).all();
  }

  findById(id) {
    return this.db.prepare(`
      SELECT t.*, c.name AS category_name FROM item_templates t
      LEFT JOIN categories c ON c.id = t.category_id WHERE t.id = ?
    `).get(id);
  }

  listFieldValues(templateId) {
    return this.db.prepare('SELECT field_id, value FROM item_template_field_values WHERE template_id = ? ORDER BY field_id').all(templateId);
  }

  insert(attributes) {
    return this.db.prepare(`
      INSERT INTO item_templates (name, category_id, item_name, description, condition, location, purchase_date,
        purchase_price_amount, purchase_price_currency, serial_number, transferred_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(attributes.name, attributes.categoryId, attributes.itemName, attributes.description, attributes.condition,
      attributes.location, attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.transferredTo).lastInsertRowid;
  }

  update(id, attributes) {
    this.db.prepare(`
      UPDATE item_templates SET name = ?, category_id = ?, item_name = ?, description = ?, condition = ?, location = ?,
        purchase_date = ?, purchase_price_amount = ?, purchase_price_currency = ?, serial_number = ?,
        transferred_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(attributes.name, attributes.categoryId, attributes.itemName, attributes.description, attributes.condition,
      attributes.location, attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.transferredTo, id);
  }

  // The stored values are replaced as a whole, which also drops values of fields that no longer exist.
  replaceFieldValues(templateId, values) {
    this.db.prepare('DELETE FROM item_template_field_values WHERE template_id = ?').run(templateId);
    const insert = this.db.prepare('INSERT INTO item_template_field_values (template_id, field_id, value) VALUES (?, ?, ?)');
    for (const [fieldId, value] of values) insert.run(templateId, fieldId, value);
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM item_templates WHERE id = ?').run(id).changes;
  }
}
