import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const databasePath = path.join(dataDir, 'inventory.sqlite');
export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
  CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_photos_item ON item_photos(item_id);
  CREATE INDEX IF NOT EXISTS idx_field_values_field ON item_field_values(field_id, value);
`);

// Additive migrations keep existing inventories usable without rebuilding their database.
const itemColumns = new Set(db.prepare('PRAGMA table_info(items)').all().map(column => column.name));
const missingItemColumns = [
  ['parent_item_id', 'INTEGER REFERENCES items(id) ON DELETE RESTRICT'],
  ['purchase_date', 'TEXT'],
  ['purchase_price_amount', 'TEXT'],
  ['purchase_price_currency', 'TEXT'],
  ['serial_number', 'TEXT']
];
for (const [name, definition] of missingItemColumns) {
  if (!itemColumns.has(name)) db.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition}`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_item_id)');
