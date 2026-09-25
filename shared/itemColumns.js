/*
  Columns of the Items view, shared by the server (sort whitelist, columns endpoint) and the client
  (column picker defaults). Core columns are item attributes; the interface names each one through
  its translation key items.fields.<key>. Custom columns merge same-name, same-type category fields.
*/

export const CORE_ITEM_COLUMNS = [
  { key: 'photo', type: 'photo', sortable: false, searchable: false, visibleByDefault: true },
  { key: 'name', type: 'text', sortable: true, searchable: true, visibleByDefault: true, required: true },
  { key: 'category', type: 'text', sortable: true, searchable: false, visibleByDefault: true },
  { key: 'condition', type: 'text', sortable: true, searchable: false, visibleByDefault: true },
  { key: 'location', type: 'text', sortable: true, searchable: false, visibleByDefault: true },
  { key: 'storedInside', type: 'item', sortable: false, searchable: false, visibleByDefault: true },
  { key: 'purchaseDate', type: 'date', sortable: true, searchable: false, visibleByDefault: false },
  { key: 'purchasePrice', type: 'money', sortable: true, searchable: false, visibleByDefault: false },
  { key: 'serialNumber', type: 'text', sortable: true, searchable: true, visibleByDefault: false },
  { key: 'transferredTo', type: 'text', sortable: true, searchable: true, visibleByDefault: false },
  { key: 'created', type: 'datetime', sortable: true, searchable: false, visibleByDefault: false },
  { key: 'updated', type: 'datetime', sortable: true, searchable: false, visibleByDefault: false }
];

export const DEFAULT_ITEM_SORT = 'name';

const CUSTOM_PREFIX = 'custom:';

// Same-name fields merge only when their types match, so the type is part of the stable key. The
// encoded name keeps the key free of the commas that separate keys in the `fields` query parameter.
export const customColumnKey = (type, name) => `${CUSTOM_PREFIX}${type}:${encodeURIComponent(name.trim().toLowerCase())}`;

export const isCustomColumnKey = key => typeof key === 'string' && key.startsWith(CUSTOM_PREFIX);
