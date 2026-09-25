import { httpError } from '../httpError.js';
import { errorBody } from '../../../shared/appError.js';
import { itemImportRequestBody, readItemImportDocument } from '../../../shared/itemImport.js';
import {
  nullableText, requiredText, validateFieldValue, validatePurchaseDate, validatePurchasePrice, validateSerialNumber,
  validateTransferredTo
} from '../../../shared/itemValidation.js';

// The stored purchase price columns are presented as one object, exactly as the API always has.
const itemResponse = item => {
  if (!item) return item;
  const { purchase_price_amount: amount, purchase_price_currency: currency, ...rest } = item;
  return { ...rest, purchase_price: amount === null ? null : { amount, currency } };
};

const presentLocation = value => (value && value.trim() ? value : null);

// A nested item is displayed at the location of the top-most container that holds it, while its own
// saved location stays untouched in the database. `root` is that container, or the item itself.
const withEffectiveLocation = (item, root) => ({
  ...item,
  effective_location: presentLocation(root ? root.location : item.location),
  effective_location_source: root && root.id !== item.id ? { id: root.id, uuid: root.uuid, name: root.name } : null
});

// The list query labels every row with its root in one pass, so no extra query is made per item.
const listedItemResponse = row => {
  const { root_id: id, root_uuid: uuid, root_name: name, root_location: location, ...rest } = row;
  return withEffectiveLocation(itemResponse(rest), id ? { id, uuid, name, location } : null);
};

// Generous enough for a whole shelf of boxes, small enough that the browser can still lay out and
// print every page of the job without locking up.
export const MAX_LABELS_PER_PRINT = 500;

export class ItemService {
  constructor({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository }) {
    this.items = itemRepository;
    this.fields = customFieldRepository;
    this.photos = itemPhotoRepository;
    this.categories = categoryRepository;
  }

  requireItem(id) {
    const item = this.items.findDetailed(id);
    if (!item) throw httpError(404, 'ITEM_NOT_FOUND');
    return item;
  }

  // Single-item responses resolve the chain upwards from the item itself.
  present(item) {
    return withEffectiveLocation(itemResponse(item), this.items.findRoot(item.id));
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
      items: rows.map(listedItemResponse),
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

  // Previously saved Transferred To values for the free-text autocomplete in the item form.
  transferredToSuggestions(query = {}) {
    return this.items.listTransferredToSuggestions(
      String(query.search || '').trim(),
      Math.min(20, Math.max(1, Number.parseInt(query.limit) || 10))
    );
  }

  // Label data for a print job, in the order the items were selected. Items deleted since they were
  // selected are reported back instead of failing the whole job.
  labels(body) {
    const uuids = body?.uuids;
    if (!Array.isArray(uuids) || !uuids.length) throw httpError(400, 'LABELS_NO_ITEMS');
    if (uuids.some(uuid => typeof uuid !== 'string')) throw httpError(400, 'LABELS_INVALID_UUIDS');
    const requested = [...new Set(uuids.map(uuid => uuid.trim().toLowerCase()))];
    if (requested.length > MAX_LABELS_PER_PRINT) {
      throw httpError(400, 'LABELS_TOO_MANY', { max: MAX_LABELS_PER_PRINT, count: requested.length });
    }
    const found = new Map(this.items.findLabels(requested).map(row => [row.uuid, {
      uuid: row.uuid,
      name: row.name,
      description: row.description,
      category_name: row.category_name,
      effective_location: presentLocation(row.root_id ? row.root_location : row.location)
    }]));
    return {
      items: requested.filter(uuid => found.has(uuid)).map(uuid => found.get(uuid)),
      missing: requested.filter(uuid => !found.has(uuid))
    };
  }

  get(id) {
    const item = this.requireItem(id);
    item.fields = this.items.listFieldValues(item.id, item.category_id);
    item.photos = this.photos.listMetadata(item.id);
    item.parent = item.parent_item_id ? this.items.findRef(item.parent_item_id) : null;
    item.children = this.items.listChildren(item.id);
    return this.present(item);
  }

  resolveParentId(raw, itemId = null) {
    if (raw === null || raw === undefined || raw === '') return null;
    const parentId = Number.parseInt(raw);
    if (!Number.isInteger(parentId) || !this.items.findRef(parentId)) throw httpError(400, 'PARENT_ITEM_NOT_FOUND');
    if (itemId && parentId === itemId) throw httpError(400, 'ITEM_CANNOT_CONTAIN_ITSELF');
    if (itemId && this.items.listDescendantIds(itemId).includes(parentId)) {
      throw httpError(400, 'ITEM_PARENT_CYCLE');
    }
    return parentId;
  }

  validateValues(categoryId, values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw httpError(400, 'FIELD_VALUES_NOT_OBJECT');
    const allowed = new Map(this.fields.listTypesByCategory(categoryId).map(field => [String(field.id), field]));
    return Object.entries(values).map(([fieldId, raw]) => {
      const field = allowed.get(String(fieldId));
      if (!field) throw httpError(400, 'FIELD_NOT_IN_CATEGORY', { fieldId: String(fieldId) });
      return [Number(fieldId), validateFieldValue(field.type, raw, field.name)];
    });
  }

  // Shared attribute rules of create and update. The field values are returned separately because
  // they are written to their own table once the item row exists.
  readAttributes(body, itemId = null) {
    const name = requiredText(body?.name, 'ITEM_NAME_REQUIRED');
    const categoryId = Number.parseInt(body?.category_id);
    if (!this.categories.findById(categoryId)) throw httpError(400, 'CATEGORY_REQUIRED');
    const values = this.validateValues(categoryId, body.field_values);
    const parentId = this.resolveParentId(body.parent_item_id, itemId);
    const purchaseDate = validatePurchaseDate(body.purchase_date);
    const purchasePrice = validatePurchasePrice(body.purchase_price);
    const serialNumber = validateSerialNumber(body.serial_number);
    const transferredTo = validateTransferredTo(body.transferred_to);
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
        transferredTo,
        parentId
      }
    };
  }

  // Callers wrap it in a transaction, so the item row and its field values are written together.
  insertItem(body) {
    const { values, attributes } = this.readAttributes(body);
    const itemId = this.items.insert(attributes);
    for (const [fieldId, value] of values) this.items.saveFieldValue(itemId, fieldId, value);
    return itemId;
  }

  create(body) {
    const id = this.items.transaction(() => this.insertItem(body));
    return this.present(this.items.findDetailed(id));
  }

  /*
    The import document is read again here: the client preview is convenience, not the authority.
    Every item then goes through the regular create rules inside one transaction, so a single
    refusal or failure leaves the database exactly as it was.
  */
  createBatch(body) {
    const category = this.categories.findById(Number.parseInt(body?.categoryId));
    if (!category) throw httpError(400, 'CATEGORY_REQUIRED');
    const fields = this.fields.listByCategory(category.id);
    let drafts;
    try {
      drafts = readItemImportDocument(body.document, { categoryName: category.name, fields });
    } catch (error) {
      throw error.status ? error : httpError(400, 'INVALID_REQUEST');
    }
    const ids = this.items.transaction(() => drafts.map((draft, index) => {
      try {
        return this.insertItem(itemImportRequestBody(draft, category.id, fields));
      } catch (error) {
        // The refusal of one draft names its position; the original reason travels as a nested error.
        if (error.code && error.status) throw httpError(error.status, 'BATCH_ITEM_INVALID', { index: index + 1, reason: errorBody(error) });
        throw error;
      }
    }));
    return ids.map(id => this.present(this.items.findDetailed(id)));
  }

  update(id, body) {
    const updatedId = this.items.transaction(() => {
      const current = this.requireItem(id);
      const { values, attributes } = this.readAttributes(body, current.id);
      this.items.update(current.id, attributes);
      for (const [fieldId, value] of values) this.items.saveFieldValue(current.id, fieldId, value);
      return current.id;
    });
    return this.present(this.items.findDetailed(updatedId));
  }

  remove(id) {
    const item = this.requireItem(id);
    const contained = this.items.countChildren(item.id);
    if (contained) throw httpError(409, 'ITEM_HAS_CHILDREN', { count: contained });
    this.items.deleteById(item.id);
  }
}
