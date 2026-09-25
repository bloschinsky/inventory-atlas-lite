import { CORE_ITEM_COLUMNS, customColumnKey } from '../../../shared/itemColumns.js';

/*
  The column catalog of the Items view: the core columns, then one logical column per group of
  category fields that share a name (ignoring case) and a type. Fields with the same name but a
  different type stay separate columns, because their values do not sort or display alike. A group
  takes the name of its oldest field. It is a pure function of the field list, so it needs no database.
*/
export const buildItemColumns = customFields => {
  const groups = new Map();
  for (const field of [...customFields].sort((a, b) => a.id - b.id)) {
    const key = customColumnKey(field.type, field.name);
    const group = groups.get(key);
    if (group) group.fieldIds.push(field.id);
    else {
      groups.set(key, {
        key, label: field.name.trim(), type: field.type, sortable: true, searchable: field.type === 'text', core: false, fieldIds: [field.id]
      });
    }
  }
  const custom = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || a.type.localeCompare(b.type));
  return [...CORE_ITEM_COLUMNS.map(column => ({ ...column, core: true })), ...custom];
};
