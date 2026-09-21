/*
  Aggregation queries for the dashboard. The optional category scope is applied here so nothing
  above this layer builds SQL fragments.
*/
export class DashboardRepository {
  constructor(db) {
    this.db = db;
  }

  scope(categoryId) {
    return {
      clause: categoryId ? 'WHERE i.category_id = @categoryId' : '',
      params: categoryId ? { categoryId } : {}
    };
  }

  itemMetrics(categoryId) {
    const { clause, params } = this.scope(categoryId);
    return this.db.prepare(`
      SELECT COUNT(*) AS totalItems,
        COALESCE(SUM(EXISTS(SELECT 1 FROM item_photos p WHERE p.item_id = i.id)), 0) AS withPhotos,
        COALESCE(SUM(CASE WHEN i.parent_item_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS insideContainer,
        COALESCE(SUM(CASE WHEN i.parent_item_id IS NULL AND TRIM(COALESCE(i.location, '')) != '' THEN 1 ELSE 0 END), 0) AS directLocation,
        COALESCE(SUM(CASE WHEN i.parent_item_id IS NULL AND TRIM(COALESCE(i.location, '')) = '' THEN 1 ELSE 0 END), 0) AS unplaced,
        COALESCE(SUM(CASE WHEN i.created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS addedLast30Days
      FROM items i ${clause}
    `).get(params);
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
}
