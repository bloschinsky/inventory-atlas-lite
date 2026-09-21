import { httpError } from '../httpError.js';
import { nullableText, requiredText, validatePurchaseDate, validatePurchasePrice, validateSerialNumber } from './itemValidation.js';

// The stored purchase price columns are presented as one object, exactly as the API always has.
const itemResponse = item => {
  if (!item) return item;
  const { purchase_price_amount: amount, purchase_price_currency: currency, ...rest } = item;
  return { ...rest, purchase_price: amount === null ? null : { amount, currency } };
};

export class ItemService {
  constructor({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository }) {
    this.items = itemRepository;
    this.fields = customFieldRepository;
    this.photos = itemPhotoRepository;
    this.categories = categoryRepository;
  }

  requireItem(id) {
    const item = this.items.findDetailed(id);
    if (!item) throw httpError('Item not found.', 404);
    return item;
  }

  list(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize) || 12));
    const { rows, total } = this.items.search({
      search: String(query.search || '').trim(),
      categoryId: Number.parseInt(query.categoryId) || null,
      sort: query.sort,
      direction: query.direction,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
    return {
      items: rows.map(itemResponse),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
    };
  }

  // An item may never be stored inside itself or inside anything it already contains.
  parentCandidates(query = {}) {
    const excludeId = Number.parseInt(query.excludeId) || null;
    return this.items.listParentCandidates({
      search: String(query.search || '').trim(),
      excludedIds: excludeId ? [excludeId, ...this.items.listDescendantIds(excludeId)] : []
    });
  }

  get(id) {
    const item = this.requireItem(id);
    item.fields = this.items.listFieldValues(item.id, item.category_id);
    item.photos = this.photos.listMetadata(item.id);
    item.parent = item.parent_item_id ? this.items.findRef(item.parent_item_id) : null;
    item.children = this.items.listChildren(item.id);
    return itemResponse(item);
  }

  resolveParentId(raw, itemId = null) {
    if (raw === null || raw === undefined || raw === '') return null;
    const parentId = Number.parseInt(raw);
    if (!Number.isInteger(parentId) || !this.items.findRef(parentId)) throw httpError('Parent item not found.');
    if (itemId && parentId === itemId) throw httpError('An item cannot be stored inside itself.');
    if (itemId && this.items.listDescendantIds(itemId).includes(parentId)) {
      throw httpError('An item cannot be stored inside one of its own contents.');
    }
    return parentId;
  }

  validateValues(categoryId, values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw httpError('Field values must be an object.');
    const allowed = new Map(this.fields.listTypesByCategory(categoryId).map(field => [String(field.id), field.type]));
    return Object.entries(values).map(([fieldId, raw]) => {
      const type = allowed.get(String(fieldId));
      if (!type) throw httpError(`Field ${fieldId} does not belong to the selected category.`);
      if (raw === '' || raw === null || raw === undefined) return [Number(fieldId), null];
      if (type === 'number' && !Number.isFinite(Number(raw))) throw httpError(`Field ${fieldId} must be a number.`);
      if (type === 'boolean' && !['true', 'false', true, false, 1, 0, '1', '0'].includes(raw)) throw httpError(`Field ${fieldId} must be a boolean.`);
      return [Number(fieldId), type === 'boolean' ? (['true', true, 1, '1'].includes(raw) ? '1' : '0') : String(raw)];
    });
  }

  // Shared attribute rules of create and update. The field values are returned separately because
  // they are written to their own table once the item row exists.
  readAttributes(body, itemId = null) {
    const name = requiredText(body?.name, 'Item name');
    const categoryId = Number.parseInt(body?.category_id);
    if (!this.categories.findById(categoryId)) throw httpError('Valid category is required.');
    const values = this.validateValues(categoryId, body.field_values);
    const parentId = this.resolveParentId(body.parent_item_id, itemId);
    const purchaseDate = validatePurchaseDate(body.purchase_date);
    const purchasePrice = validatePurchasePrice(body.purchase_price);
    const serialNumber = validateSerialNumber(body.serial_number);
    return {
      values,
      attributes: {
        name,
        categoryId,
        description: nullableText(body.description),
        condition: nullableText(body.condition),
        location: nullableText(body.location),
        purchaseDate,
        purchasePriceAmount: purchasePrice.amount,
        purchasePriceCurrency: purchasePrice.currency,
        serialNumber,
        parentId
      }
    };
  }

  create(body) {
    const id = this.items.transaction(() => {
      const { values, attributes } = this.readAttributes(body);
      const itemId = this.items.insert(attributes);
      for (const [fieldId, value] of values) this.items.saveFieldValue(itemId, fieldId, value);
      return itemId;
    });
    return itemResponse(this.items.findDetailed(id));
  }

  update(id, body) {
    const updatedId = this.items.transaction(() => {
      const current = this.requireItem(id);
      const { values, attributes } = this.readAttributes(body, current.id);
      this.items.update(current.id, attributes);
      for (const [fieldId, value] of values) this.items.saveFieldValue(current.id, fieldId, value);
      return current.id;
    });
    return itemResponse(this.items.findDetailed(updatedId));
  }

  remove(id) {
    const item = this.requireItem(id);
    const contained = this.items.countChildren(item.id);
    if (contained) throw httpError(`This item contains ${contained} item(s). Move or delete them first.`, 409);
    this.items.deleteById(item.id);
  }
}
