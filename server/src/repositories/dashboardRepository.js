import { ROOTS_CTE } from './itemRepository.js';

/*
  Aggregation queries for the dashboard. The optional category scope is applied here so nothing
  above this layer builds SQL fragments. `now` is a UTC 'YYYY-MM-DD HH:MM:SS' timestamp in the format
  SQLite's CURRENT_TIMESTAMP writes, so every query of one response shares the same rolling window.
*/
export class DashboardRepository {
  constructor(db) {
    this.db = db;
  }

  // Extra conditions are fixed SQL written in this file; only the category id is a parameter.
  scope(categoryId, ...conditions) {
    if (categoryId) conditions.unshift('i.category_id = @categoryId');
    return {
      clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      params: categoryId ? { categoryId } : {}
    };
  }

  // A purchase date or price counts only in the form the item validation stores: a real calendar
  // date, and an amount together with its currency.
  itemMetrics(categoryId, now) {
    const { clause, params } = this.scope(categoryId);
    return this.db.prepare(`
      SELECT COUNT(*) AS totalItems,
        COALESCE(SUM(EXISTS(SELECT 1 FROM item_photos p WHERE p.item_id = i.id)), 0) AS withPhotos,
        COALESCE(SUM(CASE WHEN i.parent_item_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS insideContainer,
        COALESCE(SUM(CASE WHEN i.parent_item_id IS NULL AND TRIM(COALESCE(i.location, '')) != '' THEN 1 ELSE 0 END), 0) AS directLocation,
        COALESCE(SUM(CASE WHEN i.parent_item_id IS NULL AND TRIM(COALESCE(i.location, '')) = '' THEN 1 ELSE 0 END), 0) AS unplaced,
        COALESCE(SUM(CASE WHEN i.created_at >= datetime(@now, '-30 days') THEN 1 ELSE 0 END), 0) AS addedLast30Days,
        COALESCE(SUM(CASE WHEN TRIM(COALESCE(i.condition, '')) != '' THEN 1 ELSE 0 END), 0) AS withCondition,
        COALESCE(SUM(CASE WHEN date(i.purchase_date) = i.purchase_date THEN 1 ELSE 0 END), 0) AS withPurchaseDate,
        COALESCE(SUM(CASE WHEN TRIM(COALESCE(i.purchase_price_amount, '')) != ''
          AND TRIM(COALESCE(i.purchase_price_currency, '')) != '' THEN 1 ELSE 0 END), 0) AS withPurchasePrice,
        COALESCE(SUM(CASE WHEN TRIM(COALESCE(i.serial_number, '')) != '' THEN 1 ELSE 0 END), 0) AS withSerialNumber
      FROM items i ${clause}
    `).get({ ...params, now });
  }

  // Only the days that have items; the service fills the empty days of the window.
  countsByCreatedDay(categoryId, now) {
    const { clause, params } = this.scope(categoryId, "i.created_at >= datetime(@now, '-30 days')");
    return this.db.prepare(`
      SELECT date(i.created_at) AS date, COUNT(*) AS count
      FROM items i ${clause}
      GROUP BY date(i.created_at)
      ORDER BY date
    `).all({ ...params, now });
  }

  // The category breakdown always covers the whole inventory; the selected scope only highlights it.
  countsByCategory() {
    return this.db.prepare(`
      SELECT i.category_id AS categoryId, COALESCE(c.name, 'Uncategorized') AS label, COUNT(*) AS count
      FROM items i LEFT JOIN categories c ON c.id = i.category_id
      GROUP BY i.category_id, c.name
      HAVING COUNT(*) > 0
      ORDER BY count DESC, label COLLATE NOCASE, i.category_id
    `).all();
  }

  countsByCondition(categoryId) {
    const { clause, params } = this.scope(categoryId);
    return this.db.prepare(`
      SELECT CASE WHEN TRIM(COALESCE(i.condition, '')) = '' THEN '' ELSE LOWER(TRIM(i.condition)) END AS key,
        COUNT(*) AS count
      FROM items i ${clause}
      GROUP BY key
      ORDER BY count DESC, key COLLATE NOCASE
    `).all(params);
  }

  /*
    Items per exact trimmed effective location, '' when there is none. The effective location is the
    one the item list shows: the location of the outermost container, or the item's own at the top.
  */
  countsByEffectiveLocation(categoryId) {
    const { clause, params } = this.scope(categoryId);
    return this.db.prepare(`
      ${ROOTS_CTE}
      SELECT TRIM(COALESCE(CASE WHEN root.id IS NULL THEN i.location ELSE root.location END, '')) AS label,
        COUNT(*) AS count
      FROM items i
      LEFT JOIN roots ON roots.id = i.id
      LEFT JOIN items root ON root.id = roots.root_id ${clause}
      GROUP BY label
    `).all(params);
  }
}
