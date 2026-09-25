import { randomUUID } from 'node:crypto';
import { containsLike, startsWithLike } from './sql.js';

// Every item is walked down from its top-level container, so one pass labels the whole table with
// the root that provides its effective location. Items inside a cycle are simply never reached.
export const ROOTS_CTE = `
  WITH RECURSIVE roots(id, root_id) AS (
    SELECT id, id FROM items WHERE parent_item_id IS NULL
    UNION ALL SELECT i.id, r.root_id FROM items i JOIN roots r ON i.parent_item_id = r.id
  )
`;

// The free-text item search matches any of these columns, plus every text-type custom field value.
const SEARCH_COLUMNS = ['i.name', 'i.description', 'i.serial_number', 'i.transferred_to'];
const CUSTOM_TEXT_SEARCH = `EXISTS (
  SELECT 1 FROM item_field_values sv JOIN custom_fields sf ON sf.id = sv.field_id
  WHERE sv.item_id = i.id AND sf.type = 'text' AND sv.value LIKE @search ESCAPE '\\'
)`;

// The whitelist of core sort expressions. A request only ever selects a key here, never SQL. The
// location is the effective one: the root container's, or the item's own when it has no root.
const CORE_SORT = {
  name: 'i.name COLLATE NOCASE',
  category: 'c.name COLLATE NOCASE',
  condition: 'i.condition COLLATE NOCASE',
  location: "NULLIF(TRIM(CASE WHEN root.id IS NULL THEN i.location ELSE root.location END), '') COLLATE NOCASE",
  purchaseDate: 'i.purchase_date',
  purchasePrice: 'CAST(i.purchase_price_amount AS REAL)',
  serialNumber: 'i.serial_number COLLATE NOCASE',
  transferredTo: 'i.transferred_to COLLATE NOCASE',
  created: 'i.created_at',
  updated: 'i.updated_at'
};

// A merged custom column sorts by the value of whichever of its fields belongs to the item's
// category. The field ids are bound as one JSON parameter; the type only selects a fixed wrapper.
const CUSTOM_SORT_VALUE = `(
  SELECT NULLIF(TRIM(sv.value), '') FROM item_field_values sv
  WHERE sv.item_id = i.id AND sv.field_id IN (SELECT value FROM json_each(@sortFieldIds))
  ORDER BY sv.field_id LIMIT 1
)`;
const CUSTOM_SORT = {
  text: `${CUSTOM_SORT_VALUE} COLLATE NOCASE`,
  number: `CAST(${CUSTOM_SORT_VALUE} AS REAL)`,
  date: CUSTOM_SORT_VALUE,
  boolean: CUSTOM_SORT_VALUE
};

export class ItemRepository {
  constructor(db) {
    this.db = db;
  }

  // Lets a service keep a multi-statement use case atomic without knowing the driver.
  transaction(work) {
    return this.db.transaction(work)();
  }

  // Accepts either the numeric id or the public UUID, exactly as the API always has.
  findDetailed(id) {
    return this.db.prepare(`
      SELECT i.*, c.name AS category_name FROM items i
      JOIN categories c ON c.id = i.category_id WHERE i.id = ? OR i.uuid = ?
    `).get(id, id);
  }

  findRef(id) {
    return this.db.prepare('SELECT id, uuid, name FROM items WHERE id = ?').get(id);
  }

  // The top-most container of the chain, or the item itself when it is top-level. The depth guard
  // keeps a damaged row from looping forever even though cycles cannot be created through the API.
  findRoot(id) {
    return this.db.prepare(`
      WITH RECURSIVE chain(id, uuid, name, location, parent_item_id, depth) AS (
        SELECT id, uuid, name, location, parent_item_id, 0 FROM items WHERE id = @id
        UNION ALL SELECT p.id, p.uuid, p.name, p.location, p.parent_item_id, chain.depth + 1
        FROM items p JOIN chain ON p.id = chain.parent_item_id WHERE chain.depth < 100
      ) SELECT id, uuid, name, location FROM chain ORDER BY depth DESC LIMIT 1
    `).get({ id });
  }

  listDescendantIds(id) {
    return this.db.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM items WHERE parent_item_id = @id
        UNION ALL SELECT i.id FROM items i JOIN tree t ON i.parent_item_id = t.id
      ) SELECT id FROM tree
    `).all({ id }).map(row => row.id);
  }

  listChildren(id) {
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, i.condition, c.name AS category_name,
        (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
      FROM items i JOIN categories c ON c.id = i.category_id
      WHERE i.parent_item_id = ? ORDER BY i.name COLLATE NOCASE
    `).all(id);
  }

  listFieldValues(itemId, categoryId) {
    return this.db.prepare(`
      SELECT f.id, f.name, f.type, v.value FROM custom_fields f
      LEFT JOIN item_field_values v ON v.field_id = f.id AND v.item_id = ?
      WHERE f.category_id = ? ORDER BY f.id
    `).all(itemId, categoryId);
  }

  /*
    `sort` is either { core: key } or { fieldIds, type } of a merged custom column; unknown keys fall
    back to the name. Empty values always come last, and the item id keeps equal values in a stable
    order, so pagination never repeats or skips a row.
  */
  search({ search, categoryId, sort = {}, direction, limit, offset }) {
    const where = [];
    const params = {};
    if (search) {
      where.push(`(${[...SEARCH_COLUMNS.map(column => `${column} LIKE @search ESCAPE '\\'`), CUSTOM_TEXT_SEARCH].join(' OR ')})`);
      params.search = containsLike(search);
    }
    if (categoryId) {
      where.push('i.category_id = @categoryId');
      params.categoryId = categoryId;
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM items i ${clause}`).get(params).count;
    let column = CORE_SORT[sort.core] || CORE_SORT.name;
    if (sort.fieldIds) {
      column = CUSTOM_SORT[sort.type] || CUSTOM_SORT.text;
      params.sortFieldIds = JSON.stringify(sort.fieldIds);
    }
    const order = direction === 'desc' ? 'DESC' : 'ASC';
    const rows = this.db.prepare(`
      ${ROOTS_CTE}
      SELECT i.id, i.uuid, i.name, i.condition, i.location, i.purchase_date,
        i.purchase_price_amount, i.purchase_price_currency, i.serial_number, i.transferred_to, i.created_at, i.updated_at,
        c.id AS category_id, c.name AS category_name,
        parent.id AS parent_id, parent.name AS parent_name,
        root.id AS root_id, root.uuid AS root_uuid, root.name AS root_name, root.location AS root_location,
        (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
      FROM items i JOIN categories c ON c.id = i.category_id
      LEFT JOIN items parent ON parent.id = i.parent_item_id
      LEFT JOIN roots ON roots.id = i.id
      LEFT JOIN items root ON root.id = roots.root_id ${clause}
      ORDER BY (${column}) IS NULL, ${column} ${order}, i.id ASC LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });
    return { rows, total };
  }

  // The values of the requested custom fields for one page of items, in a single statement.
  listColumnValues(itemIds, fieldIds) {
    return this.db.prepare(`
      SELECT item_id, field_id, value FROM item_field_values
      WHERE item_id IN (SELECT value FROM json_each(?)) AND field_id IN (SELECT value FROM json_each(?))
    `).all(JSON.stringify(itemIds), JSON.stringify(fieldIds));
  }

  // Only what a printed label shows, for any number of items in one statement. The UUIDs travel as a
  // single JSON parameter, so a large selection never runs into SQLite's bound-parameter limit.
  findLabels(uuids) {
    return this.db.prepare(`
      ${ROOTS_CTE}
      SELECT i.uuid, i.name, i.description, i.location, c.name AS category_name,
        root.id AS root_id, root.location AS root_location
      FROM items i JOIN categories c ON c.id = i.category_id
      LEFT JOIN roots ON roots.id = i.id
      LEFT JOIN items root ON root.id = roots.root_id
      WHERE i.uuid IN (SELECT value FROM json_each(?))
    `).all(JSON.stringify(uuids));
  }

  listParentCandidates({ search, excludedIds }) {
    const where = [];
    const params = {};
    if (search) {
      where.push("i.name LIKE @search ESCAPE '\\'");
      params.search = containsLike(search);
    }
    if (excludedIds.length) where.push(`i.id NOT IN (${excludedIds.join(',')})`);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, c.name AS category_name FROM items i
      JOIN categories c ON c.id = i.category_id ${clause}
      ORDER BY i.name COLLATE NOCASE LIMIT 20
    `).all(params);
  }

  insert(attributes) {
    return this.db.prepare(`
      INSERT INTO items (uuid, name, category_id, description, condition, location, purchase_date,
        purchase_price_amount, purchase_price_currency, serial_number, transferred_to, parent_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), attributes.name, attributes.categoryId, attributes.description, attributes.condition,
      attributes.location, attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.transferredTo, attributes.parentId).lastInsertRowid;
  }

  update(id, attributes) {
    this.db.prepare(`
      UPDATE items SET name = ?, category_id = ?, description = ?, condition = ?, location = ?,
        purchase_date = ?, purchase_price_amount = ?, purchase_price_currency = ?, serial_number = ?,
        transferred_to = ?, parent_item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(attributes.name, attributes.categoryId, attributes.description, attributes.condition, attributes.location,
      attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.transferredTo, attributes.parentId, id);
  }

  // Distinct saved destinations, most used first. Case and surrounding whitespace do not split them.
  listTransferredToSuggestions(search, limit) {
    return this.db.prepare(`
      SELECT MIN(TRIM(transferred_to)) AS value, COUNT(*) AS usage_count FROM items
      WHERE transferred_to IS NOT NULL AND TRIM(transferred_to) != ''
        AND TRIM(transferred_to) LIKE @search ESCAPE '\\'
      GROUP BY TRIM(transferred_to) COLLATE NOCASE
      ORDER BY usage_count DESC, value COLLATE NOCASE LIMIT @limit
    `).all({ search: startsWithLike(search), limit });
  }

  saveFieldValue(itemId, fieldId, value) {
    this.db
      .prepare('INSERT INTO item_field_values (item_id, field_id, value) VALUES (?, ?, ?) ON CONFLICT(item_id, field_id) DO UPDATE SET value = excluded.value')
      .run(itemId, fieldId, value);
  }

  countChildren(id) {
    return this.db.prepare('SELECT COUNT(*) AS count FROM items WHERE parent_item_id = ?').get(id).count;
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM items WHERE id = ?').run(id).changes;
  }
}
