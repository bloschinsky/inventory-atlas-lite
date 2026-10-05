import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchema } from './schema.js';

export { CORE_SCHEMA, CURRENT_SCHEMA, DEFAULT_DATABASE_NAME, SCHEMA_VERSION, TRACKED_TABLES, applySchema } from './schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const databasePath = path.join(dataDir, 'inventory.sqlite');

// Writes a brand-new database file the way a fresh installation starts: an empty file brought to the
// current schema by applySchema(), so a reset always matches whatever the current schema is.
export const createFreshDatabase = file => {
  const connection = new Database(file);
  try {
    connection.pragma('foreign_keys = ON');
    applySchema(connection);
  } finally {
    connection.close();
  }
};

const openConnection = () => {
  const connection = new Database(databasePath);
  connection.pragma('foreign_keys = ON');
  connection.pragma('journal_mode = WAL');
  applySchema(connection);
  return connection;
};

let connection = openConnection();

/*
  Restoring a backup replaces the database file, so no module may hold the connection object itself.
  Everything goes through this proxy, which always forwards to the connection that is open now.
  Statements and transactions must therefore be created when they are used, not at module load.
*/
export const db = new Proxy({}, {
  get: (_target, property) => {
    const value = connection[property];
    return typeof value === 'function' ? value.bind(connection) : value;
  },
  has: (_target, property) => property in connection
});

export const isDatabaseOpen = () => connection.open;

export const closeDatabase = () => {
  if (!connection.open) return;
  // Fold the WAL back into the main file so the replaced database leaves nothing behind.
  try { connection.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* a damaged database still has to close */ }
  connection.close();
};

export const openDatabase = () => {
  if (connection.open) return connection;
  connection = openConnection();
  return connection;
};
