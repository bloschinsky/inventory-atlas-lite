import { reactive } from 'vue';
import { api, jsonOptions } from './api.js';

/*
  Shared state of the database the server has open, in the same style as capabilities.js: the
  indicator in the application chrome and Settings → Database read and write the same metadata, so a
  rename shows everywhere at once. Only a server answer is shown as the active database: a failed load
  leaves no name, and a change of the database itself (restore, reset, a demo reset) drops the old
  name before asking again. A newer request always wins over an older one still in flight.
*/
export const activeDatabase = reactive({ metadata: null, status: 'loading' });

let latest = 0;

function show(metadata) {
  activeDatabase.metadata = metadata;
  activeDatabase.status = 'ready';
}

// The database itself is being replaced: its old name is no longer the active one.
export function forgetActiveDatabase() {
  latest++;
  activeDatabase.metadata = null;
  activeDatabase.status = 'loading';
}

// Loads the metadata; `replaced` first forgets the current one because the database itself changed.
export async function loadActiveDatabase({ replaced = false } = {}) {
  if (replaced) forgetActiveDatabase();
  const request = ++latest;
  try {
    const metadata = await api('/api/database/metadata');
    if (request === latest) show(metadata);
    return metadata;
  } catch (caught) {
    if (request === latest) {
      activeDatabase.metadata = null;
      activeDatabase.status = 'error';
    }
    throw caught;
  }
}

// A refused name throws before anything changes, so the indicator keeps the saved name.
export async function renameActiveDatabase(name) {
  const metadata = await api('/api/database/metadata', jsonOptions('PUT', { name }));
  latest++;
  show(metadata);
  return metadata;
}
