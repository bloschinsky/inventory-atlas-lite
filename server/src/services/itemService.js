import { httpError } from '../httpError.js';
import { errorBody } from '../../../shared/appError.js';
import { itemImportRequestBody, readItemImportDocument } from '../../../shared/itemImport.js';
import { isCustomColumnKey } from '../../../shared/itemColumns.js';
import { buildItemColumns } from './itemColumns.js';
import { readFieldValues, readItemDetails, requiredText, validateIsNew } from '../../../shared/itemValidation.js';
import { isConditionGrade } from '../../../shared/conditionGrades.js';

// The stored purchase price columns are presented as one object, exactly as the API always has, and
// the stored 0/1 New flag as a boolean.
const itemResponse = item => {
  if (!item) return item;
  const { purchase_price_amount: amount, purchase_price_currency: currency, ...rest } = item;
  return { ...rest, is_new: Boolean(rest.is_new), purchase_price: amount === null ? null : { amount, currency } };
};

export const presentLocation = value => (value && value.trim() ? value : null);

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

  // Every column the Items view can show, including the merged custom field columns.
  columns() {
    return { fields: buildItemColumns(this.fields.listAll()) };
  }

  /*
    `sort` and `fields` carry column keys from the columns catalog. They are only ever resolved to
    known field ids here; an unknown key is ignored, and an unknown sort falls back to the name.
    `condition` filters by one grade key, or by "unset" for items without a grade; anything else is ignored.
    Only the requested custom columns get values, loaded for the whole page in one query.
  */
  list(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize) || 12));
    const requestedKeys = String(query.fields || '').split(',').filter(isCustomColumnKey);
    const customColumns = requestedKeys.length || isCustomColumnKey(query.sort)
      ? new Map(buildItemColumns(this.fields.listAll()).filter(column => !column.core).map(column => [column.key, column]))
      : new Map();
    const sortColumn = customColumns.get(query.sort);
    const { rows, total } = this.items.search({
      search: String(query.search || '').trim(),
      categoryId: Number.parseInt(query.categoryId) || null,
      conditionGrade: query.condition === 'unset' ? null : isConditionGrade(query.condition) ? query.condition : undefined,
      sort: sortColumn ? { fieldIds: sortColumn.fieldIds, type: sortColumn.type } : { core: query.sort },
      direction: query.direction,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
    const columnByFieldId = new Map(requestedKeys.map(key => customColumns.get(key)).filter(Boolean)
      .flatMap(column => column.fieldIds.map(id => [id, column.key])));
    const values = new Map(rows.map(row => [row.id, {}]));
    if (columnByFieldId.size && rows.length) {
      for (const value of this.items.listColumnValues(rows.map(row => row.id), [...columnByFieldId.keys()])) {
        values.get(value.item_id)[columnByFieldId.get(value.field_id)] = value.value;
      }
    }
    return {
      items: rows.map(row => ({ ...listedItemResponse(row), custom_values: values.get(row.id) })),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
    };
  }

  /*
    The flat node list of the Hierarchy page. Each view derives its own structure from `parent_id`;
    the response never nests items, and the location is the same inherited one the list shows.
  */
  hierarchy() {
    return {
      items: this.items.listHierarchy().map(({ location, root_id: rootId, root_location: rootLocation, ...node }) => ({
        ...node,
        effective_location: presentLocation(rootId ? rootLocation : location)
      }))
    };
  }

  // An item may never be stored inside itself or inside anything it already contains.
  parentCandidates(query = {}) {
    const excludeId = Number.parseInt(query.excludeId) || null;
    return this.items.listParentCandidates({
      search: String(query.search || '').trim(),
      excludedIds: excludeId ? this.items.listSubtreeIds([excludeId]) : []
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
    // What a nested audit of this container would check: every item below it, not the item itself.
    item.descendant_count = item.children.length ? this.items.listSubtreeIds([item.id]).filter(id => id !== item.id).length : 0;
    return this.present(item);
  }

  resolveParentId(raw, itemId = null) {
    if (raw === null || raw === undefined || raw === '') return null;
    const parentId = Number.parseInt(raw);
    if (!Number.isInteger(parentId) || !this.items.findRef(parentId)) throw httpError(400, 'PARENT_ITEM_NOT_FOUND');
    if (itemId) this.assertCanContain(parentId, [itemId]);
    return parentId;
  }

  /*
    The one containment rule of every move, single or bulk: the moved items may go inside `parentId`
    only when it is none of them and none of them is a container above it, which would make the
    destination part of what is being moved.
  */
  assertCanContain(parentId, movedIds) {
    if (movedIds.includes(parentId)) throw httpError(400, 'ITEM_CANNOT_CONTAIN_ITSELF');
    const above = new Set(this.items.listAncestorIds(parentId));
    if (movedIds.some(id => above.has(id))) throw httpError(400, 'ITEM_PARENT_CYCLE');
  }

  /*
    The distinct items a bulk request names, by numeric id or UUID. Every one must still exist, so
    a stale selection is refused as a whole instead of being moved in part.
  */
  resolveSelection(itemIds) {
    if (!Array.isArray(itemIds) || !itemIds.length) throw httpError(400, 'BULK_MOVE_NO_ITEMS');
    const keys = itemIds.map(key => (typeof key === 'string' ? key.trim().toLowerCase() : key));
    const ids = keys.filter(key => Number.isInteger(key) || /^\d+$/.test(key)).map(Number);
    const uuids = keys.filter(key => typeof key === 'string' && !/^\d+$/.test(key));
    if (ids.length + uuids.length !== keys.length) throw httpError(400, 'BULK_MOVE_INVALID_ITEMS');
    const rows = this.items.findRefs({ ids, uuids });
    const found = new Set(rows.flatMap(row => [row.id, row.uuid]));
    const missing = new Set([...ids, ...uuids].filter(key => !found.has(key))).size;
    if (missing) throw httpError(404, 'BULK_MOVE_ITEMS_NOT_FOUND', { count: missing });
    return rows;
  }

  // The selected items without a selected container above them. Moving these carries every other
  // selected item along inside its own subtree, so the internal structure is preserved.
  selectionRoots(selected) {
    const selectedIds = new Set(selected.map(item => item.id));
    const nested = new Set(this.items.listAncestorLinks([...selectedIds])
      .filter(link => selectedIds.has(link.ancestor_id)).map(link => link.item_id));
    return selected.filter(item => !nested.has(item.id));
  }

  // What the Move dialog shows: how the selection reduces to roots, and the destinations that remain
  // valid for all of them. It never writes; the move checks everything again when it runs.
  bulkMovePreview(body) {
    const selected = this.resolveSelection(body?.item_ids);
    const roots = this.selectionRoots(selected);
    return {
      selected_count: selected.length,
      root_count: roots.length,
      candidates: this.items.listParentCandidates({
        search: String(body.search || '').trim(),
        excludedIds: this.items.listSubtreeIds(roots.map(root => root.id))
      })
    };
  }

  /*
    Moves the selection roots inside one destination in a single transaction, reading the hierarchy
    as it is now rather than as the browser last saw it. Any refusal leaves every item where it was.
    Roots already inside the destination are reported as unchanged and not written.
  */
  bulkMove(body) {
    return this.items.transaction(() => {
      const selected = this.resolveSelection(body?.item_ids);
      const raw = body.parent_item_id;
      if (raw === null || raw === undefined || raw === '') throw httpError(400, 'BULK_MOVE_PARENT_REQUIRED');
      const parentId = Number.parseInt(raw);
      const parent = Number.isInteger(parentId) ? this.items.findRef(parentId) : null;
      if (!parent) throw httpError(400, 'PARENT_ITEM_NOT_FOUND');
      const roots = this.selectionRoots(selected);
      this.assertCanContain(parent.id, roots.map(root => root.id));
      const moved = roots.filter(root => root.parent_item_id !== parent.id).map(root => root.id);
      if (moved.length) this.items.setParent(moved, parent.id);
      return {
        selected_count: selected.length,
        root_count: roots.length,
        moved_count: moved.length,
        unchanged_count: roots.length - moved.length,
        parent,
        moved_root_ids: moved
      };
    });
  }

  // Shared attribute rules of create and update. The field values are returned separately because
  // they are written to their own table once the item row exists.
  readAttributes(body, itemId = null) {
    const name = requiredText(body?.name, 'ITEM_NAME_REQUIRED');
    const categoryId = Number.parseInt(body?.category_id);
    if (!this.categories.findById(categoryId)) throw httpError(400, 'CATEGORY_REQUIRED');
    const values = readFieldValues(body.field_values, this.fields.listTypesByCategory(categoryId));
    const parentId = this.resolveParentId(body.parent_item_id, itemId);
    return { values, attributes: { name, categoryId, isNew: validateIsNew(body.is_new), ...readItemDetails(body), parentId } };
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
