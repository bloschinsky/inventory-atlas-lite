import { httpError } from '../httpError.js';

const titleCase = value => value.replace(/(^|[\s/-])([a-z])/g, (_match, separator, letter) => `${separator}${letter.toUpperCase()}`);

// Keeps a distribution readable: the leading entries stay, the rest are summed into one bucket.
const groupedDistribution = (rows, limit, makeEntry) => {
  const visible = rows.slice(0, limit).map(makeEntry);
  const otherCount = rows.slice(limit).reduce((sum, row) => sum + row.count, 0);
  if (otherCount) visible.push({ key: '__other__', label: 'Other', count: otherCount });
  return visible;
};

export class DashboardService {
  constructor({ dashboardRepository, categoryRepository }) {
    this.dashboard = dashboardRepository;
    this.categories = categoryRepository;
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
    const metrics = this.dashboard.itemMetrics(category?.id || null);
    const conditionDistribution = groupedDistribution(this.dashboard.countsByCondition(category?.id || null), 5, row => ({
      key: row.key || 'not-specified',
      label: row.key ? titleCase(row.key) : 'Not specified',
      count: row.count
    }));
    return {
      scope: { categoryId: category?.id || null, categoryName: category?.name || null },
      categories: this.categories.listNames(),
      totalItems: metrics.totalItems,
      photoCoverage: {
        withPhotos: metrics.withPhotos,
        withoutPhotos: metrics.totalItems - metrics.withPhotos,
        percentage: metrics.totalItems ? Math.round((metrics.withPhotos / metrics.totalItems) * 100) : 0
      },
      placement: {
        insideContainer: metrics.insideContainer,
        directLocation: metrics.directLocation,
        unplaced: metrics.unplaced
      },
      addedLast30Days: metrics.addedLast30Days,
      categoryDistribution: this.categoryDistribution(category),
      conditionDistribution
    };
  }
}
