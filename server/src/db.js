import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const databasePath = path.join(dataDir, 'inventory.sqlite');

/*
  Schema version stored in PRAGMA user_version. Databases created before restore existed report 0;
  applySchema() upgrades them in place. Restore refuses a backup that reports a higher number,
  because it was written by a newer release whose schema this one cannot read.
  Version 2 added the item template tables.
*/
export const SCHEMA_VERSION = 2;

// Tables and columns that every Inventory Atlas Lite database has ever had. Restore validation uses
// them to recognize one of our backups before deciding whether it only needs the usual migrations.
export const CORE_SCHEMA = {
  categories: ['id', 'name'],
  items: ['id', 'uuid', 'name', 'category_id', 'description', 'condition', 'location'],
  custom_fields: ['id', 'category_id', 'name', 'type'],
  item_field_values: ['id', 'item_id', 'field_id', 'value'],
  item_photos: ['id', 'item_id', 'filename', 'mime_type', 'data']
};

// The shape the current application needs. A migrated candidate is checked against this.
export const CURRENT_SCHEMA = {
  ...CORE_SCHEMA,
  categories: [...CORE_SCHEMA.categories, 'created_at', 'updated_at'],
  items: [...CORE_SCHEMA.items, 'purchase_date', 'purchase_price_amount', 'purchase_price_currency',
    'serial_number', 'transferred_to', 'parent_item_id', 'created_at', 'updated_at'],
  custom_fields: [...CORE_SCHEMA.custom_fields, 'created_at', 'updated_at'],
  item_photos: [...CORE_SCHEMA.item_photos, 'created_at'],
  item_templates: ['id', 'name', 'category_id', 'item_name', 'description', 'condition', 'location', 'purchase_date',
    'purchase_price_amount', 'purchase_price_currency', 'serial_number', 'transferred_to', 'created_at', 'updated_at'],
  item_template_field_values: ['id', 'template_id', 'field_id', 'value']
};

// Creates missing tables, runs the additive migrations, and stamps the current schema version.
// It is idempotent, so it is safe on the live database and on a staged restore candidate alike.
export const applySchema = connection => {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      description TEXT,
      condition TEXT,
      location TEXT,
      purchase_date TEXT,
      purchase_price_amount TEXT,
      purchase_price_currency TEXT,
      serial_number TEXT,
      transferred_to TEXT,
      parent_item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL CHECK(type IN ('text', 'number', 'date', 'boolean')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, name)
    );
    CREATE TABLE IF NOT EXISTS item_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      value TEXT,
      UNIQUE(item_id, field_id)
    );
    CREATE TABLE IF NOT EXISTS item_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- A template is a preset for new items, never an item. Deleting its category keeps the template
    -- with no category, so it stays visible and can be repaired instead of silently moving elsewhere.
    CREATE TABLE IF NOT EXISTS item_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      item_name TEXT,
      description TEXT,
      condition TEXT,
      location TEXT,
      purchase_date TEXT,
      purchase_price_amount TEXT,
      purchase_price_currency TEXT,
      serial_number TEXT,
      transferred_to TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- field_id deliberately has no foreign key: the value of a deleted field stays behind, so the
    -- template can report that it was ignored instead of losing it without a word.
    CREATE TABLE IF NOT EXISTS item_template_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(template_id, field_id)
    );
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_photos_item ON item_photos(item_id);
    CREATE INDEX IF NOT EXISTS idx_field_values_field ON item_field_values(field_id, value);
  `);

  // Additive migrations keep existing inventories usable without rebuilding their database.
  const itemColumns = new Set(connection.prepare('PRAGMA table_info(items)').all().map(column => column.name));
  const missingItemColumns = [
    ['parent_item_id', 'INTEGER REFERENCES items(id) ON DELETE RESTRICT'],
    ['purchase_date', 'TEXT'],
    ['purchase_price_amount', 'TEXT'],
    ['purchase_price_currency', 'TEXT'],
    ['serial_number', 'TEXT'],
    ['transferred_to', 'TEXT']
  ];
  for (const [name, definition] of missingItemColumns) {
    if (!itemColumns.has(name)) connection.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition}`);
  }
  connection.exec('CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_item_id)');
  if (Number(connection.pragma('user_version', { simple: true })) !== SCHEMA_VERSION) {
    connection.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
};

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
