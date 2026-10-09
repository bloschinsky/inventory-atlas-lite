import { coverPhotoIdSql } from './itemPhotoRepository.js';
import { containsLike, startsWithLike } from './sql.js';
import { CONDITION_GRADES } from '../../../shared/conditionGrades.js';

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

// The semantic rank of the structured Condition (1 = broken … 5 = excellent); an unset grade is NULL.
const CONDITION_RANK = `CASE i.condition_grade ${CONDITION_GRADES.map((grade, index) => `WHEN '${grade}' THEN ${index + 1}`).join(' ')} END`;

// The whitelist of core sort expressions. A request only ever selects a key here, never SQL. The
// location is the effective one: the root container's, or the item's own when it has no root.
// Condition sorts by rank, never by its key or label; Condition Notes is plain text.
const CORE_SORT = {
  name: 'i.name COLLATE NOCASE',
  category: 'c.name COLLATE NOCASE',
  condition: CONDITION_RANK,
  conditionNotes: "NULLIF(TRIM(i.condition_notes), '') COLLATE NOCASE",
  isNew: 'i.is_new',
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

// The condition of a lifecycle view (`active`, `retired`, or `all`); only a known key ever selects SQL.
const LIFECYCLE_WHERE = {
  active: "i.lifecycle_status = 'active'",
  retired: "i.lifecycle_status = 'retired'",
  all: null
};
const lifecycleWhere = lifecycle => (Object.hasOwn(LIFECYCLE_WHERE, lifecycle) ? LIFECYCLE_WHERE[lifecycle] : LIFECYCLE_WHERE.active);

// The retirement columns every item response carries; the service folds them into one object.
const RETIREMENT_COLUMNS = `i.lifecycle_status, i.retired_at, i.retired_reason, i.retired_recipient, i.retired_note,
  i.retired_location_snapshot, i.retired_parent_uuid_snapshot, i.retired_parent_name_snapshot`;

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
    return this.db.prepare('SELECT id, uuid, name, lifecycle_status FROM items WHERE id = ?').get(id);
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

  /*
    The hierarchy walks of the containment rules. The ids travel as one JSON parameter, so a large
    selection never runs into SQLite's bound-parameter limit, and UNION (not UNION ALL) ends every
    walk even over a damaged row that forms a cycle.
  */
  // The given items and everything stored in them, at any depth.
  listSubtreeIds(ids) {
    return this.db.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM items WHERE id IN (SELECT value FROM json_each(?))
        UNION SELECT i.id FROM items i JOIN tree t ON i.parent_item_id = t.id
      ) SELECT id FROM tree
    `).all(JSON.stringify(ids)).map(row => row.id);
  }

  // The item itself and every container above it.
  listAncestorIds(id) {
    return this.db.prepare(`
      WITH RECURSIVE chain(id) AS (
        SELECT @id UNION SELECT i.parent_item_id FROM items i JOIN chain ON i.id = chain.id
        WHERE i.parent_item_id IS NOT NULL
      ) SELECT id FROM chain
    `).all({ id }).map(row => row.id);
  }

  // One row per (item, container above it) pair of the given items.
  listAncestorLinks(ids) {
    return this.db.prepare(`
      WITH RECURSIVE chain(item_id, ancestor_id) AS (
        SELECT id, parent_item_id FROM items
        WHERE id IN (SELECT value FROM json_each(?)) AND parent_item_id IS NOT NULL
        UNION SELECT chain.item_id, i.parent_item_id FROM chain JOIN items i ON i.id = chain.ancestor_id
        WHERE i.parent_item_id IS NOT NULL
      ) SELECT item_id, ancestor_id FROM chain
    `).all(JSON.stringify(ids));
  }

  // Items named by numeric id or by UUID, as the API accepts either.
  findRefs({ ids, uuids }) {
    return this.db.prepare(`
      SELECT id, uuid, name, parent_item_id, lifecycle_status FROM items
      WHERE id IN (SELECT value FROM json_each(?)) OR uuid IN (SELECT value FROM json_each(?))
    `).all(JSON.stringify(ids), JSON.stringify(uuids));
  }

  // Only the hierarchy link changes; every other column, and every descendant row, stays as it is.
  setParent(ids, parentId) {
    return this.db.prepare(`
      UPDATE items SET parent_item_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (SELECT value FROM json_each(?))
    `).run(parentId, JSON.stringify(ids)).changes;
  }

  listChildren(id) {
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, i.condition_grade, i.lifecycle_status, c.name AS category_name,
        ${coverPhotoIdSql('i.id')} AS thumbnail_id
      FROM items i JOIN categories c ON c.id = i.category_id
      WHERE i.parent_item_id = ? ORDER BY i.name COLLATE NOCASE
    `).all(id);
  }

  /*
    Every item with only what a hierarchy node shows, in one statement: the root that provides its
    effective location and its direct child count come from grouped joins rather than a query per
    item, and its cover photo from the indexed lookup that every thumbnail uses. Names order
    siblings, and the id keeps equal names stable. A container and its contents always share one
    lifecycle status, so a lifecycle view keeps every parent of the items it returns.
  */
  listHierarchy(lifecycle) {
    const where = lifecycleWhere(lifecycle);
    return this.db.prepare(`
      ${ROOTS_CTE}
      SELECT i.id, i.uuid, i.name, i.parent_item_id AS parent_id, i.location, i.lifecycle_status,
        c.id AS category_id, c.name AS category_name,
        root.id AS root_id, root.location AS root_location,
        ${coverPhotoIdSql('i.id')} AS thumbnail_id, COALESCE(kids.children_count, 0) AS children_count
      FROM items i JOIN categories c ON c.id = i.category_id
      LEFT JOIN roots ON roots.id = i.id
      LEFT JOIN items root ON root.id = roots.root_id
      LEFT JOIN (SELECT parent_item_id, COUNT(*) AS children_count FROM items
        WHERE parent_item_id IS NOT NULL GROUP BY parent_item_id) kids ON kids.parent_item_id = i.id
      ${where ? `WHERE ${where}` : ''}
      ORDER BY i.name COLLATE NOCASE, i.id
    `).all();
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
    order, so pagination never repeats or skips a row. `conditionGrade` is a grade key, or null for
    items whose Condition is not set; leaving it undefined applies no Condition filter. `lifecycle` is
    a lifecycle view, applied to the count and the page alike.
  */
  search({ search, categoryId, conditionGrade, lifecycle, sort = {}, direction, limit, offset }) {
    const where = [lifecycleWhere(lifecycle)].filter(Boolean);
    const params = {};
    if (search) {
      where.push(`(${[...SEARCH_COLUMNS.map(column => `${column} LIKE @search ESCAPE '\\'`), CUSTOM_TEXT_SEARCH].join(' OR ')})`);
      params.search = containsLike(search);
    }
    if (categoryId) {
      where.push('i.category_id = @categoryId');
      params.categoryId = categoryId;
    }
    if (conditionGrade === null) where.push('i.condition_grade IS NULL');
    else if (conditionGrade) {
      where.push('i.condition_grade = @conditionGrade');
      params.conditionGrade = conditionGrade;
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
      SELECT i.id, i.uuid, i.name, i.is_new, i.condition_grade, i.condition_notes, i.location, i.purchase_date,
        i.purchase_price_amount, i.purchase_price_currency, i.serial_number, i.transferred_to, i.created_at, i.updated_at,
        ${RETIREMENT_COLUMNS}, c.id AS category_id, c.name AS category_name,
        parent.id AS parent_id, parent.name AS parent_name,
        root.id AS root_id, root.uuid AS root_uuid, root.name AS root_name, root.location AS root_location,
        ${coverPhotoIdSql('i.id')} AS thumbnail_id
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

  // Only containers of the given lifecycle status qualify, so a move never mixes the two.
  listParentCandidates({ search, excludedIds, lifecycle = 'active' }) {
    const where = [lifecycle === 'retired' ? LIFECYCLE_WHERE.retired : LIFECYCLE_WHERE.active];
    const params = {};
    if (search) {
      where.push("i.name LIKE @search ESCAPE '\\'");
      params.search = containsLike(search);
    }
    if (excludedIds.length) {
      where.push('i.id NOT IN (SELECT value FROM json_each(@excludedIds))');
      params.excludedIds = JSON.stringify(excludedIds);
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    // The direct container tells apart candidates that share a name.
    return this.db.prepare(`
      SELECT i.id, i.uuid, i.name, c.name AS category_name, parent.name AS parent_name FROM items i
      JOIN categories c ON c.id = i.category_id
      LEFT JOIN items parent ON parent.id = i.parent_item_id ${clause}
      ORDER BY i.name COLLATE NOCASE, i.id LIMIT 20
    `).all(params);
  }

  insert(attributes) {
    return this.db.prepare(`
      INSERT INTO items (uuid, name, category_id, description, is_new, condition_grade, condition_notes, location, purchase_date,
        purchase_price_amount, purchase_price_currency, serial_number, transferred_to, parent_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), attributes.name, attributes.categoryId, attributes.description, attributes.isNew ? 1 : 0,
      attributes.conditionGrade, attributes.conditionNotes, attributes.location, attributes.purchaseDate, attributes.purchasePriceAmount,
      attributes.purchasePriceCurrency, attributes.serialNumber, attributes.transferredTo, attributes.parentId).lastInsertRowid;
  }

  update(id, attributes) {
    this.db.prepare(`
      UPDATE items SET name = ?, category_id = ?, description = ?, is_new = ?, condition_grade = ?, condition_notes = ?, location = ?,
        purchase_date = ?, purchase_price_amount = ?, purchase_price_currency = ?, serial_number = ?,
        transferred_to = ?, parent_item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(attributes.name, attributes.categoryId, attributes.description, attributes.isNew ? 1 : 0,
      attributes.conditionGrade, attributes.conditionNotes, attributes.location,
      attributes.purchaseDate, attributes.purchasePriceAmount, attributes.purchasePriceCurrency,
      attributes.serialNumber, attributes.transferredTo, attributes.parentId, id);
  }

  // A loan writes only the current recipient; every other column stays as it is.
  setTransferredTo(id, value) {
    this.db.prepare('UPDATE items SET transferred_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(value, id);
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

  /*
    Retires the given subtree in one statement. Each item keeps a text snapshot of its effective
    location and direct container as they are right now (an UPDATE reads the rows before it writes
    them); the subtree root alone leaves its container, so the contents stay nested inside it. The
    saved `location` of every item is left exactly as it was.
  */
  retire(ids, rootId, { retiredAt, reason, recipient, note }) {
    return this.db.prepare(`
      ${ROOTS_CTE}
      UPDATE items SET lifecycle_status = 'retired', retired_at = @retiredAt, retired_reason = @reason,
        retired_recipient = @recipient, retired_note = @note,
        retired_location_snapshot = snapshot.location, retired_parent_uuid_snapshot = snapshot.parent_uuid,
        retired_parent_name_snapshot = snapshot.parent_name,
        parent_item_id = CASE WHEN items.id = @rootId THEN NULL ELSE items.parent_item_id END,
        updated_at = CURRENT_TIMESTAMP
      FROM (
        SELECT i.id, NULLIF(TRIM(CASE WHEN root.id IS NULL THEN i.location ELSE root.location END), '') AS location,
          parent.uuid AS parent_uuid, parent.name AS parent_name
        FROM items i
        LEFT JOIN roots ON roots.id = i.id
        LEFT JOIN items root ON root.id = roots.root_id
        LEFT JOIN items parent ON parent.id = i.parent_item_id
        WHERE i.id IN (SELECT value FROM json_each(@ids))
      ) snapshot
      WHERE items.id = snapshot.id
    `).run({ ids: JSON.stringify(ids), rootId, retiredAt, reason, recipient, note }).changes;
  }

  /*
    Makes the given retired subtree active again and clears its retirement data. Only the subtree
    root changes its container (`parentId`, or none) and, when `location` is given, its saved location;
    the nesting inside the subtree and every other column stay as they are.
  */
  restore(ids, rootId, { parentId, location }) {
    return this.db.prepare(`
      UPDATE items SET lifecycle_status = 'active', retired_at = NULL, retired_reason = NULL, retired_recipient = NULL,
        retired_note = NULL, retired_location_snapshot = NULL, retired_parent_uuid_snapshot = NULL,
        retired_parent_name_snapshot = NULL,
        parent_item_id = CASE WHEN id = @rootId THEN @parentId ELSE parent_item_id END,
        location = CASE WHEN id = @rootId AND @setLocation THEN @location ELSE location END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (SELECT value FROM json_each(@ids)) AND lifecycle_status = 'retired'
    `).run({ ids: JSON.stringify(ids), rootId, parentId, setLocation: location === undefined ? 0 : 1, location: location ?? null }).changes;
  }

  countChildren(id) {
    return this.db.prepare('SELECT COUNT(*) AS count FROM items WHERE parent_item_id = ?').get(id).count;
  }

  deleteById(id) {
    return this.db.prepare('DELETE FROM items WHERE id = ?').run(id).changes;
  }
}
