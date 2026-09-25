import { CORE_ITEM_COLUMNS, DEFAULT_ITEM_SORT } from '../../shared/itemColumns.js';
import { formatDate, formatDateTime, formatMoney, i18n } from './i18n/index.js';

// The Items view as the column picker, the table, and the cards see it.
export const ITEMS_VIEW_STORAGE_KEY = 'inventory-atlas.items.view';
export { CORE_ITEM_COLUMNS, DEFAULT_ITEM_SORT };

const { t } = i18n.global;

/*
  Interface labels: a core column is named by its translation, a custom column by the field name the
  user typed. Two custom columns that share a name have different types, so the type tells them apart.
*/
export function labelColumns(columns) {
  const counts = new Map();
  for (const column of columns) if (!column.core) counts.set(column.label.toLowerCase(), (counts.get(column.label.toLowerCase()) || 0) + 1);
  return columns.map(column => ({
    ...column,
    label: column.core
      ? t(`items.fields.${column.key}`)
      : counts.get(column.label.toLowerCase()) > 1 ? `${column.label} (${t(`fieldTypes.${column.type}`)})` : column.label
  }));
}

const coreText = {
  category: item => item.category_name,
  condition: item => item.condition,
  location: item => item.effective_location,
  storedInside: item => item.parent_name,
  purchaseDate: item => formatDate(item.purchase_date),
  purchasePrice: item => item.purchase_price && formatMoney(item.purchase_price.amount, item.purchase_price.currency),
  serialNumber: item => item.serial_number,
  transferredTo: item => item.transferred_to,
  created: item => formatDateTime(item.created_at),
  updated: item => formatDateTime(item.updated_at)
};

// Custom values are user data and shown as stored; only a boolean's yes/no and a date's format are the interface's.
function customText(type, value) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'boolean') return t(value === '1' ? 'common.yes' : 'common.no');
  if (type === 'date') return formatDate(value);
  return value;
}

// The display text of one cell, or an empty string when the item has no value there.
export const columnText = (item, column) => (column.core
  ? coreText[column.key]?.(item)
  : customText(column.type, item.custom_values?.[column.key])) || '';
