import { httpError } from '../httpError.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCATION_LIMIT = 7;

const titleCase = value => value.replace(/(^|[\s/-])([a-z])/g, (_match, separator, letter) => `${separator}${letter.toUpperCase()}`);
const percentage = (count, total) => (total ? Math.round((count / total) * 100) : 0);
// The UTC text form SQLite's CURRENT_TIMESTAMP writes, so it compares directly with created_at.
const sqliteTimestamp = date => date.toISOString().slice(0, 19).replace('T', ' ');

// Keeps a distribution readable: the leading entries stay, the rest are summed into one bucket.
const groupedDistribution = (rows, limit, makeEntry) => {
  const visible = rows.slice(0, limit).map(makeEntry);
  const otherCount = rows.slice(limit).reduce((sum, row) => sum + row.count, 0);
  if (otherCount) visible.push({ key: '__other__', label: 'Other', count: otherCount });
  return visible;
};

/*
  The rolling window starts exactly 30 days before `now`, so it touches 31 UTC calendar days: the
  partial first day, 29 whole days, and today. Every one of them gets a bucket, empty days included,
  and the buckets add up to addedLast30Days because both use the same query predicate and clock.
*/
const dailyBuckets = (rows, now) => {
  const last = now.toISOString().slice(0, 10);
  const counts = new Map();
  // A timestamp ahead of the server clock still passes the window predicate; it is shown as today.
  for (const row of rows) {
    const date = row.date > last ? last : row.date;
    counts.set(date, (counts.get(date) || 0) + row.count);
  }
  const buckets = [];
  for (let day = new Date(now.getTime() - 30 * DAY_MS); ; day = new Date(day.getTime() + DAY_MS)) {
    const date = day.toISOString().slice(0, 10);
    buckets.push({ date, count: counts.get(date) || 0 });
    if (date === last) return buckets;
  }
};

/*
  Locations are grouped by their trimmed text regardless of case; the most frequent spelling names
  the group, with the lexically first one breaking a tie. The seven largest groups stay, the rest
  become Other, and items without any effective location are reported as Unknown.
*/
const locationDistribution = rows => {
  const groups = new Map();
  let unknown = 0;
  for (const row of rows) {
    if (!row.label) {
      unknown += row.count;
      continue;
    }
    const key = row.label.toLowerCase();
    const group = groups.get(key) || { key, label: row.label, labelCount: 0, count: 0 };
    if (row.count > group.labelCount || (row.count === group.labelCount && row.label < group.label)) {
      group.label = row.label;
      group.labelCount = row.count;
    }
    group.count += row.count;
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
  const distribution = groupedDistribution(ordered, LOCATION_LIMIT, ({ key, label, count }) => ({ key, label, count }));
  if (unknown) distribution.push({ key: '__unknown__', label: 'Unknown', count: unknown });
  return distribution;
};

export class DashboardService {
  // `now` is injectable so the rolling window can be tested against a fixed clock.
  constructor({ dashboardRepository, categoryRepository, now = () => new Date() }) {
    this.dashboard = dashboardRepository;
    this.categories = categoryRepository;
    this.now = now;
  }

  resolveScope(rawCategoryId) {
    if (rawCategoryId === undefined) return null;
    if (typeof rawCategoryId !== 'string' || !/^[1-9]\d*$/.test(rawCategoryId)) {
      throw httpError(400, 'INVALID_CATEGORY_ID');
    }
    const category = this.categories.findById(Number(rawCategoryId));
    if (!category) throw httpError(404, 'CATEGORY_NOT_FOUND');
    return category;
  }

  // The selected category is always visible in the breakdown, even outside the leading entries.
  categoryDistribution(category) {
    const rows = this.dashboard.countsByCategory();
    const leading = rows.slice(0, 6);
    const selectedRow = category && !leading.some(row => row.categoryId === category.id)
      ? rows.find(row => row.categoryId === category.id) || { categoryId: category.id, label: category.name, count: 0 }
      : null;
    const visibleIds = new Set(leading.map(row => row.categoryId));
    if (selectedRow) visibleIds.add(selectedRow.categoryId);
    const distribution = [...leading, ...(selectedRow ? [selectedRow] : [])].map(row => ({
      ...row,
      selected: row.categoryId === category?.id
    }));
    const otherCount = rows.filter(row => !visibleIds.has(row.categoryId)).reduce((sum, row) => sum + row.count, 0);
    if (otherCount) distribution.push({ categoryId: null, label: 'Other', count: otherCount, selected: false });
    return distribution;
  }

  overview(query = {}) {
    const category = this.resolveScope(query.categoryId);
    const categoryId = category?.id || null;
    const now = this.now();
    const metrics = this.dashboard.itemMetrics(categoryId, sqliteTimestamp(now));
    const total = metrics.totalItems;
    const conditionDistribution = groupedDistribution(this.dashboard.countsByCondition(categoryId), 5, row => ({
      key: row.key || 'not-specified',
      label: row.key ? titleCase(row.key) : 'Not specified',
      count: row.count
    }));
    // Coverage of each field on its own; the fields are deliberately never combined into one score.
    const fieldCoverage = [
      ['photos', metrics.withPhotos],
      ['placement', metrics.insideContainer + metrics.directLocation],
      ['condition', metrics.withCondition],
      ['purchaseDate', metrics.withPurchaseDate],
      ['purchasePrice', metrics.withPurchasePrice],
      ['serialNumber', metrics.withSerialNumber]
    ].map(([key, count]) => ({ key, count, percentage: percentage(count, total) }));
    return {
      scope: { categoryId, categoryName: category?.name || null },
      categories: this.categories.listNames(),
      totalItems: total,
      photoCoverage: {
        withPhotos: metrics.withPhotos,
        withoutPhotos: total - metrics.withPhotos,
        percentage: percentage(metrics.withPhotos, total)
      },
      placement: {
        insideContainer: metrics.insideContainer,
        directLocation: metrics.directLocation,
        unplaced: metrics.unplaced
      },
      addedLast30Days: metrics.addedLast30Days,
      recentActivity: dailyBuckets(this.dashboard.countsByCreatedDay(categoryId, sqliteTimestamp(now)), now),
      categoryDistribution: this.categoryDistribution(category),
      conditionDistribution,
      fieldCoverage,
      locationDistribution: locationDistribution(this.dashboard.countsByEffectiveLocation(categoryId))
    };
  }
}
