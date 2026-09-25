import { httpError } from '../httpError.js';
import { nullableText, readFieldValues, readItemDetails, requiredText, validateFieldValue } from '../../../shared/itemValidation.js';

// A stored value is only usable while its field still exists in the category and still accepts it.
const fits = (field, value) => {
  if (!field) return false;
  try {
    validateFieldValue(field.type, value, field.name);
    return true;
  } catch {
    return false;
  }
};

/*
  User-defined presets for new items. A template is never an item: it has no UUID, photos, parent, or
  QR code, and using it only produces an item draft that the regular item form reviews and saves.
  Every value is validated with the item rules, except that the default item name may stay empty.
*/
export class ItemTemplateService {
  constructor({ itemTemplateRepository, categoryRepository, customFieldRepository }) {
    this.templates = itemTemplateRepository;
    this.categories = categoryRepository;
    this.fields = customFieldRepository;
  }

  requireTemplate(id) {
    const template = this.templates.findById(id);
    if (!template) throw httpError(404, 'TEMPLATE_NOT_FOUND');
    return template;
  }

  list() {
    return this.templates.list();
  }

  /*
    Only the values that still fit the current fields of the template's category are returned; the
    rest are counted, so the editor and the use flow can say that some were ignored.
  */
  present(template) {
    const { purchase_price_amount: amount, purchase_price_currency: currency, ...rest } = template;
    const fields = template.category_id ? this.fields.listTypesByCategory(template.category_id) : [];
    const byId = new Map(fields.map(field => [field.id, field]));
    const fieldValues = {};
    let ignored = 0;
    for (const { field_id: fieldId, value } of this.templates.listFieldValues(template.id)) {
      if (fits(byId.get(fieldId), value)) fieldValues[fieldId] = value;
      else ignored += 1;
    }
    return {
      ...rest,
      purchase_price: amount === null ? null : { amount, currency },
      field_values: fieldValues,
      ignored_field_count: ignored
    };
  }

  get(id) {
    return this.present(this.requireTemplate(id));
  }

  read(body) {
    const name = requiredText(body?.name, 'TEMPLATE_NAME_REQUIRED');
    const categoryId = Number.parseInt(body?.category_id);
    if (!this.categories.findById(categoryId)) throw httpError(400, 'CATEGORY_REQUIRED');
    const values = readFieldValues(body.field_values, this.fields.listTypesByCategory(categoryId));
    return {
      // An empty field is simply not part of the template.
      values: values.filter(([, value]) => value !== null),
      attributes: { name, categoryId, itemName: nullableText(body.item_name), ...readItemDetails(body) }
    };
  }

  create(body) {
    const id = this.templates.transaction(() => {
      const { values, attributes } = this.read(body);
      const templateId = this.templates.insert(attributes);
      this.templates.replaceFieldValues(templateId, values);
      return templateId;
    });
    return this.get(id);
  }

  update(id, body) {
    const templateId = this.templates.transaction(() => {
      const current = this.requireTemplate(id);
      const { values, attributes } = this.read(body);
      this.templates.update(current.id, attributes);
      this.templates.replaceFieldValues(current.id, values);
      return current.id;
    });
    return this.get(templateId);
  }

  remove(id) {
    if (!this.templates.deleteById(id)) throw httpError(404, 'TEMPLATE_NOT_FOUND');
  }

  /*
    The draft the Add Item form is prefilled with, in the same shape as an AI draft. Nothing links the
    item saved from it back to the template. A template without a category must be repaired first,
    because silently choosing another category would put its values in the wrong place.
  */
  itemDraft(id) {
    const template = this.get(id);
    if (!template.category_id) throw httpError(409, 'TEMPLATE_CATEGORY_MISSING');
    return {
      templateName: template.name,
      categoryId: template.category_id,
      baseFields: {
        name: template.item_name,
        description: template.description,
        condition: template.condition,
        location: template.location,
        purchase_date: template.purchase_date,
        purchase_price: template.purchase_price,
        serial_number: template.serial_number,
        transferred_to: template.transferred_to
      },
      dynamicFields: template.field_values,
      ignoredFieldCount: template.ignored_field_count
    };
  }
}
