import { reactive, watch } from 'vue';

/*
  Browser-local view preferences of a data table: the visible column keys and the one sort column.
  They live in localStorage only, like the theme and the language. `known` remembers every column the
  user has already been offered, so a default-visible column added by a later release still appears,
  while a column the user hid stays hidden. Stale keys are dropped once the real columns are known.
*/
const readStored = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null; // Blocked storage or a damaged value: the defaults still work.
  }
};

const keyList = value => (Array.isArray(value) ? value.filter(key => typeof key === 'string') : null);

export function useTablePreferences(storageKey, { columns, defaultSort }) {
  const defaults = () => ({
    visible: columns.filter(column => column.visibleByDefault).map(column => column.key),
    known: columns.map(column => column.key),
    sort: defaultSort,
    direction: 'asc'
  });
  const stored = readStored(storageKey);
  const state = reactive({
    ...defaults(),
    ...(stored && {
      visible: keyList(stored.visible) ?? defaults().visible,
      known: keyList(stored.known) ?? [],
      sort: typeof stored.sort === 'string' ? stored.sort : defaultSort,
      direction: stored.direction === 'desc' ? 'desc' : 'asc'
    })
  });

  // Brings the saved state in line with the columns that exist now.
  function reconcile(current) {
    const keys = new Set(current.map(column => column.key));
    const known = new Set(state.known);
    const visible = new Set(state.visible.filter(key => keys.has(key)));
    for (const column of current) {
      if (column.required || (column.visibleByDefault && !known.has(column.key))) visible.add(column.key);
    }
    state.visible = [...visible];
    state.known = [...keys];
    if (!current.some(column => column.sortable && column.key === state.sort)) {
      state.sort = defaultSort;
      state.direction = 'asc';
    }
  }

  const reset = () => Object.assign(state, defaults());

  // First choice of a column sorts ascending; choosing it again flips the direction.
  function toggleSort(key) {
    if (state.sort === key) state.direction = state.direction === 'asc' ? 'desc' : 'asc';
    else Object.assign(state, { sort: key, direction: 'asc' });
  }

  watch(state, value => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // A blocked storage only costs the persistence, not the view itself.
    }
  }, { deep: true });

  return { state, reconcile, reset, toggleSort };
}
