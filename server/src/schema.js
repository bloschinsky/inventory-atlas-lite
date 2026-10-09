import { CONDITION_GRADES } from '../../shared/conditionGrades.js';
import { LIFECYCLE_STATUSES, RETIREMENT_REASONS } from '../../shared/itemLifecycle.js';
import { FIELD_TYPES } from '../../shared/fieldDefinitions.js';

/*
  The database schema and its migrations. Nothing here touches the file system or a particular
  SQLite driver beyond the better-sqlite3 connection API, so the public demo applies the same schema
  to its in-browser database (client/src/demo/).
*/

/*
  Schema version stored in PRAGMA user_version. Databases created before restore existed report 0;
  applySchema() upgrades them in place. Restore refuses a backup that reports a higher number,
  because it was written by a newer release whose schema this one cannot read.
  Version 2 added the item template tables; version 3 added the database_metadata table; version 4
  added the checklist tables; version 5 added items.last_verified_at and the container audit columns of
  checklist_runs; version 6 added items.is_new and item_templates.is_new; version 7 added
  item_photos.sort_order, renamed the free-text condition of items and templates to condition_notes,
  and added the structured condition_grade; version 8 added the item lifecycle: items.lifecycle_status and
  the retirement columns with their snapshots of the last effective location and former container,
  and checklist_runs.skipped_retired_count; version 9 added the item activity history tables
  (item_operations, item_events, item_transfers); version 10 allowed the color type in custom_fields.type.
  user_version stays the source of truth: database_metadata.schema_version mirrors it and is written
  in the same transaction, so the two never disagree.
*/
export const SCHEMA_VERSION = 10;

export const DEFAULT_DATABASE_NAME = 'Inventory Atlas';

/*
  Every write to one of these tables advances database_metadata.last_updated_at through a trigger.
  The trigger runs inside the writing statement's transaction, so a failed or rolled-back write never
  moves the timestamp, and no service has to remember to do it. A new inventory table joins this list.
*/
export const TRACKED_TABLES = ['categories', 'custom_fields', 'items', 'item_field_values', 'item_photos',
  'item_templates', 'item_template_field_values', 'checklists', 'checklist_items', 'checklist_runs', 'checklist_run_items',
  'item_operations', 'item_events', 'item_transfers'];

// The kinds of user action that group history events, and the kinds of event one item can record.
export const ITEM_OPERATION_TYPES = ['item_update', 'bulk_move', 'bulk_replace', 'transfer', 'return', 'retire', 'restore'];
export const ITEM_EVENT_TYPES = ['location_changed', 'container_changed', 'recipient_changed', 'transferred', 'returned', 'retired', 'restored'];
const quotedList = values => values.map(value => `'${value}'`).join(', ');

// The custom field types a row may have; FIELD_TYPES is the one list of them.
const FIELD_TYPE_CHECK = `CHECK(type IN (${quotedList(FIELD_TYPES.map(type => type.value))}))`;

// Only a fixed grade key, or NULL for an unset Condition, can be stored, whatever writes the row.
const CONDITION_GRADE_CHECK = `CHECK (condition_grade IN (${quotedList(CONDITION_GRADES)}))`;

/*
  The lifecycle columns of items. Every existing and new item is active with no retirement data; the
  retirement columns are filled by a retirement and cleared by a restore. The snapshots keep the last
  effective location and the former container as text, so they never follow later moves or deletions.
*/
const LIFECYCLE_COLUMNS = [
  ['lifecycle_status', `TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN (${quotedList(LIFECYCLE_STATUSES)}))`],
  ['retired_at', 'TEXT'],
  ['retired_reason', `TEXT CHECK (retired_reason IN (${quotedList(RETIREMENT_REASONS)}))`],
  ['retired_recipient', 'TEXT'],
  ['retired_note', 'TEXT'],
  ['retired_location_snapshot', 'TEXT'],
  ['retired_parent_uuid_snapshot', 'TEXT'],
  ['retired_parent_name_snapshot', 'TEXT']
];

// ISO 8601 in UTC with milliseconds, so two writes in the same second still order correctly.
const SQL_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// Tables and columns that every Inventory Atlas Lite database has ever had. Restore validation uses
// them to recognize one of our backups before deciding whether it only needs the usual migrations.
// The free-text condition is not listed: version 7 renamed it to condition_notes.
export const CORE_SCHEMA = {
  categories: ['id', 'name'],
  items: ['id', 'uuid', 'name', 'category_id', 'description', 'location'],
  custom_fields: ['id', 'category_id', 'name', 'type'],
  item_field_values: ['id', 'item_id', 'field_id', 'value'],
  item_photos: ['id', 'item_id', 'filename', 'mime_type', 'data']
};

// The shape the current application needs. A migrated candidate is checked against this.
export const CURRENT_SCHEMA = {
  ...CORE_SCHEMA,
  categories: [...CORE_SCHEMA.categories, 'created_at', 'updated_at'],
  items: [...CORE_SCHEMA.items, 'condition_grade', 'condition_notes', 'purchase_date', 'purchase_price_amount', 'purchase_price_currency',
    'serial_number', 'transferred_to', 'parent_item_id', 'last_verified_at', 'is_new', 'created_at', 'updated_at',
    ...LIFECYCLE_COLUMNS.map(([name]) => name)],
  custom_fields: [...CORE_SCHEMA.custom_fields, 'created_at', 'updated_at'],
  item_photos: [...CORE_SCHEMA.item_photos, 'sort_order', 'created_at'],
  item_templates: ['id', 'name', 'category_id', 'item_name', 'description', 'condition_grade', 'condition_notes', 'location', 'purchase_date',
    'purchase_price_amount', 'purchase_price_currency', 'serial_number', 'transferred_to', 'is_new', 'created_at', 'updated_at'],
  item_template_field_values: ['id', 'template_id', 'field_id', 'value'],
  database_metadata: ['id', 'database_uuid', 'name', 'created_at', 'last_updated_at', 'schema_version'],
  checklists: ['id', 'name', 'description', 'mode', 'created_at', 'updated_at'],
  checklist_items: ['id', 'checklist_id', 'item_id', 'item_name_snapshot', 'sort_order', 'created_at'],
  checklist_runs: ['id', 'checklist_id', 'checklist_name_snapshot', 'mode', 'status', 'started_at', 'completed_at', 'created_at',
    'source', 'source_container_item_id', 'source_container_name_snapshot', 'audit_scope', 'skipped_retired_count'],
  checklist_run_items: ['id', 'run_id', 'item_id', 'item_name_snapshot', 'position', 'status', 'checked_at', 'note'],
  item_operations: ['id', 'type', 'created_at'],
  item_events: ['id', 'operation_id', 'item_id', 'event_type', 'occurred_at', 'from_value', 'to_value', 'from_item_id',
    'from_item_name', 'to_item_id', 'to_item_name', 'via_item_id', 'via_item_name', 'transfer_id'],
  item_transfers: ['id', 'item_id', 'recipient', 'transferred_at', 'expected_return_on', 'returned_at', 'note', 'return_note', 'created_at']
};

/*
  Brings the single metadata row up to date. A database without one (created before metadata existed)
  gets a new identity dated from its own records; a damaged row keeps every value that is still usable
  and only has the blank ones filled in. The UUID is never replaced once it is set.
*/
const ensureMetadata = connection => {
  const row = connection.prepare('SELECT * FROM database_metadata WHERE id = 1').get();
  if (!row) {
    const { earliest, latest } = connection.prepare(`
      SELECT
        strftime('%Y-%m-%dT%H:%M:%fZ', MIN(created)) AS earliest,
        strftime('%Y-%m-%dT%H:%M:%fZ', MAX(updated)) AS latest
      FROM (
        SELECT created_at AS created, updated_at AS updated FROM categories
        UNION ALL SELECT created_at, updated_at FROM custom_fields
        UNION ALL SELECT created_at, updated_at FROM items
        UNION ALL SELECT created_at, created_at FROM item_photos
        UNION ALL SELECT created_at, updated_at FROM item_templates
      )
    `).get();
    connection.prepare(`
      INSERT INTO database_metadata (id, database_uuid, name, created_at, last_updated_at, schema_version)
      VALUES (1, ?, ?, COALESCE(?, ${SQL_NOW}), COALESCE(?, ?, ${SQL_NOW}), ?)
    `).run(crypto.randomUUID(), DEFAULT_DATABASE_NAME, earliest, latest, earliest, SCHEMA_VERSION);
    return;
  }
  connection.prepare(`
    UPDATE database_metadata SET
      database_uuid = CASE WHEN TRIM(database_uuid) = '' THEN @uuid ELSE database_uuid END,
      name = CASE WHEN TRIM(name) = '' THEN @name ELSE name END,
      created_at = CASE WHEN TRIM(created_at) = '' THEN ${SQL_NOW} ELSE created_at END,
      last_updated_at = CASE WHEN TRIM(last_updated_at) = '' THEN COALESCE(NULLIF(TRIM(created_at), ''), ${SQL_NOW})
        ELSE last_updated_at END,
      schema_version = @version
    WHERE id = 1 AND (TRIM(database_uuid) = '' OR TRIM(name) = '' OR TRIM(created_at) = ''
      OR TRIM(last_updated_at) = '' OR schema_version IS NOT @version)
  `).run({ uuid: crypto.randomUUID(), name: DEFAULT_DATABASE_NAME, version: SCHEMA_VERSION });
};

// The type CHECK of custom_fields as any release wrote it, whatever its spacing.
const TYPE_CHECK_PATTERN = /CHECK\s*\(\s*type\s+IN\s*\([^)]*\)\s*\)/i;

/*
  The definition of custom_fields when its type CHECK predates the current FIELD_TYPES, otherwise
  null. A database whose table never had a type CHECK already accepts every type and is left alone.
*/
const outdatedCustomFieldsSql = connection => {
  const table = connection.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'custom_fields'").get();
  return table && TYPE_CHECK_PATTERN.test(table.sql) && !table.sql.includes(FIELD_TYPE_CHECK) ? table.sql : null;
};

/*
  Version 10: SQLite cannot change a CHECK in place, so custom_fields is rebuilt from its own
  definition with only the type CHECK replaced; its columns, their order, and every other constraint
  stay exactly as they were. Every row keeps its id, so item and template values and their links stay
  as they are, and the AUTOINCREMENT counter is carried over, so the id of a deleted field (whose
  template values are kept on purpose) is never handed to a new field. Foreign keys are off while this
  runs (see applySchema), otherwise dropping the old table would cascade into item_field_values. The
  touch triggers go with the old table and are recreated with the others.
*/
const rebuildCustomFields = (connection, sql) => {
  const autoincrement = /AUTOINCREMENT/i.test(sql);
  const sequence = autoincrement ? connection.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'custom_fields'").get() : null;
  const definition = sql.replace(TYPE_CHECK_PATTERN, FIELD_TYPE_CHECK).replace(/^CREATE TABLE[^(]*\(/i, 'CREATE TABLE custom_fields_rebuilt (');
  connection.exec(`
    ${definition};
    INSERT INTO custom_fields_rebuilt SELECT * FROM custom_fields;
    DROP TABLE custom_fields;
    ALTER TABLE custom_fields_rebuilt RENAME TO custom_fields;
  `);
  if (!autoincrement) return;
  connection.exec("DELETE FROM sqlite_sequence WHERE name IN ('custom_fields', 'custom_fields_rebuilt')");
  connection.prepare("INSERT INTO sqlite_sequence (name, seq) SELECT 'custom_fields', MAX(?, COALESCE(MAX(id), 0)) FROM custom_fields")
    .run(sequence?.seq ?? 0);
};

/*
  Creates missing tables, runs the migrations, and stamps the current schema version. It is
  idempotent, so it is safe on the live database and on a staged restore candidate alike, and it runs
  as one transaction: a failed migration leaves the database exactly as it was. A table rebuild needs
  foreign keys off, which SQLite only allows outside a transaction, so they are switched off around it
  and restored afterwards; the rebuild keeps every id, so no relationship can break.
*/
export const applySchema = connection => {
  const rebuild = outdatedCustomFieldsSql(connection);
  const foreignKeys = Number(connection.pragma('foreign_keys', { simple: true })) === 1;
  if (rebuild && foreignKeys) connection.pragma('foreign_keys = OFF');
  try {
    migrate(connection, rebuild);
  } finally {
    if (rebuild && foreignKeys) connection.pragma('foreign_keys = ON');
  }
};

const migrate = (connection, rebuild) => connection.transaction(() => {
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
      condition_grade TEXT ${CONDITION_GRADE_CHECK},
      condition_notes TEXT,
      location TEXT,
      purchase_date TEXT,
      purchase_price_amount TEXT,
      purchase_price_currency TEXT,
      serial_number TEXT,
      transferred_to TEXT,
      parent_item_id INTEGER REFERENCES items(id) ON DELETE RESTRICT,
      last_verified_at TEXT,
      is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1)),
      ${LIFECYCLE_COLUMNS.map(([name, definition]) => `${name} ${definition},`).join(' ')}
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL ${FIELD_TYPE_CHECK},
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
    -- sort_order is the persisted photo order within one item, 0..n-1; the first photo is the cover.
    CREATE TABLE IF NOT EXISTS item_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      sort_order INTEGER NOT NULL,
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
      condition_grade TEXT ${CONDITION_GRADE_CHECK},
      condition_notes TEXT,
      location TEXT,
      purchase_date TEXT,
      purchase_price_amount TEXT,
      purchase_price_currency TEXT,
      serial_number TEXT,
      transferred_to TEXT,
      -- NULL leaves the New flag of items created from the template at its own default.
      is_new INTEGER CHECK (is_new IN (0, 1)),
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
    -- Exactly one row describes the database itself; the CHECK keeps it that way.
    CREATE TABLE IF NOT EXISTS database_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      database_uuid TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_updated_at TEXT NOT NULL,
      schema_version INTEGER NOT NULL
    );
    -- A checklist is a reusable list of references to items; its state lives only in its runs.
    CREATE TABLE IF NOT EXISTS checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      mode TEXT NOT NULL CHECK(mode IN ('packing', 'verification')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Deleting an item never fails because of a checklist: the entry keeps its name snapshot and
    -- loses only its link, so the checklist can show it as deleted.
    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      item_name_snapshot TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- A run is history: it outlives its checklist, and its snapshots keep it readable on its own. A
    -- container audit has no checklist at all: its source is the container, kept as a name snapshot
    -- and a link that a deleted container sets to NULL.
    CREATE TABLE IF NOT EXISTS checklist_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER REFERENCES checklists(id) ON DELETE SET NULL,
      checklist_name_snapshot TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('packing', 'verification')),
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed')),
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source TEXT NOT NULL DEFAULT 'checklist' CHECK(source IN ('checklist', 'container_audit')),
      source_container_item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      source_container_name_snapshot TEXT,
      audit_scope TEXT CHECK(audit_scope IN ('direct', 'nested')),
      -- Checklist entries whose item was retired when the run started; they are not part of the run.
      skipped_retired_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS checklist_run_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      item_name_snapshot TEXT NOT NULL,
      position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'missing')),
      checked_at TEXT,
      note TEXT
    );
    -- Item activity history: one operation per confirmed user action, and one compact event per
    -- meaningful change of one item. Events keep exact snapshots (location text, container and
    -- recipient names) instead of links, so they stay readable after renames, moves, and deletions.
    -- Permanently deleting an item deletes its own events and loans with it; other items' events
    -- that name it keep their snapshot. History is append-only and kept indefinitely.
    CREATE TABLE IF NOT EXISTS item_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN (${quotedList(ITEM_OPERATION_TYPES)})),
      created_at TEXT NOT NULL
    );
    -- from_/to_value hold the effective location or the recipient; from_/to_item_* the direct container;
    -- via_item_* the moved container a descendant travelled with; transfer_id the loan period.
    CREATE TABLE IF NOT EXISTS item_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id INTEGER NOT NULL REFERENCES item_operations(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK(event_type IN (${quotedList(ITEM_EVENT_TYPES)})),
      occurred_at TEXT NOT NULL,
      from_value TEXT,
      to_value TEXT,
      from_item_id INTEGER,
      from_item_name TEXT,
      to_item_id INTEGER,
      to_item_name TEXT,
      via_item_id INTEGER,
      via_item_name TEXT,
      transfer_id INTEGER
    );
    -- One row per temporary loan; returned_at stays NULL while it is open.
    CREATE TABLE IF NOT EXISTS item_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      recipient TEXT NOT NULL,
      transferred_at TEXT NOT NULL,
      expected_return_on TEXT,
      returned_at TEXT,
      note TEXT,
      return_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_item_events_item ON item_events(item_id, occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_item_events_operation ON item_events(operation_id);
    CREATE INDEX IF NOT EXISTS idx_item_transfers_item ON item_transfers(item_id, transferred_at);
    -- At most one open loan per item, whatever writes the row.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_item_transfers_open ON item_transfers(item_id) WHERE returned_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_photos_item ON item_photos(item_id);
    CREATE INDEX IF NOT EXISTS idx_field_values_field ON item_field_values(field_id, value);
    -- One live reference per item and checklist; deleted entries (NULL) never collide.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_items_item ON checklist_items(checklist_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_items_linked ON checklist_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_runs_checklist ON checklist_runs(checklist_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_run_items_run ON checklist_run_items(run_id, position);
    CREATE INDEX IF NOT EXISTS idx_checklist_run_items_linked ON checklist_run_items(item_id);
  `);

  if (rebuild) rebuildCustomFields(connection, rebuild);
  // Additive migrations keep existing inventories usable without rebuilding their database.
  const itemColumns = new Set(connection.prepare('PRAGMA table_info(items)').all().map(column => column.name));
  const missingItemColumns = [
    ['parent_item_id', 'INTEGER REFERENCES items(id) ON DELETE RESTRICT'],
    ['purchase_date', 'TEXT'],
    ['purchase_price_amount', 'TEXT'],
    ['purchase_price_currency', 'TEXT'],
    ['serial_number', 'TEXT'],
    ['transferred_to', 'TEXT'],
    ['last_verified_at', 'TEXT'],
    // Existing items read as not new; the free-text condition is never parsed to guess otherwise.
    ['is_new', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1))'],
    // Version 8: every existing item becomes active, with no retirement data.
    ...LIFECYCLE_COLUMNS
  ];
  for (const [name, definition] of missingItemColumns) {
    if (!itemColumns.has(name)) connection.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition}`);
  }
  // Existing templates keep no New default.
  const templateColumns = new Set(connection.prepare('PRAGMA table_info(item_templates)').all().map(column => column.name));
  if (!templateColumns.has('is_new')) connection.exec('ALTER TABLE item_templates ADD COLUMN is_new INTEGER CHECK (is_new IN (0, 1))');
  /*
    Version 7: the old free-text condition keeps every value, untouched, as condition_notes. The new
    grade starts unset: free text such as "Good" is never parsed into a grade.
  */
  for (const [table, columns] of [['items', itemColumns], ['item_templates', templateColumns]]) {
    if (columns.has('condition') && !columns.has('condition_notes')) {
      connection.exec(`ALTER TABLE ${table} RENAME COLUMN condition TO condition_notes`);
    }
    if (!columns.has('condition_grade')) connection.exec(`ALTER TABLE ${table} ADD COLUMN condition_grade TEXT ${CONDITION_GRADE_CHECK}`);
  }
  connection.exec('CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_item_id)');
  connection.exec('CREATE INDEX IF NOT EXISTS idx_items_lifecycle ON items(lifecycle_status)');
  // Existing photos keep the order they were shown in, by id, so no item's cover changes. The
  // migration is not an inventory edit, so the update trigger is recreated only after it ran.
  const photoColumns = new Set(connection.prepare('PRAGMA table_info(item_photos)').all().map(column => column.name));
  if (!photoColumns.has('sort_order')) {
    connection.exec(`
      DROP TRIGGER IF EXISTS item_photos_update_touches_metadata;
      ALTER TABLE item_photos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      UPDATE item_photos SET sort_order = ranked.position
      FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY id) - 1 AS position FROM item_photos) ranked
      WHERE ranked.id = item_photos.id;
    `);
  }
  connection.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_item_order ON item_photos(item_id, sort_order)');
  const runColumns = new Set(connection.prepare('PRAGMA table_info(checklist_runs)').all().map(column => column.name));
  const missingRunColumns = [
    ['source', "TEXT NOT NULL DEFAULT 'checklist' CHECK(source IN ('checklist', 'container_audit'))"],
    ['source_container_item_id', 'INTEGER REFERENCES items(id) ON DELETE SET NULL'],
    ['source_container_name_snapshot', 'TEXT'],
    ['audit_scope', "TEXT CHECK(audit_scope IN ('direct', 'nested'))"],
    ['skipped_retired_count', 'INTEGER NOT NULL DEFAULT 0']
  ];
  for (const [name, definition] of missingRunColumns) {
    if (!runColumns.has(name)) connection.exec(`ALTER TABLE checklist_runs ADD COLUMN ${name} ${definition}`);
  }
  connection.exec('CREATE INDEX IF NOT EXISTS idx_checklist_runs_container ON checklist_runs(source_container_item_id)');
  for (const table of TRACKED_TABLES) {
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      connection.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_${event.toLowerCase()}_touches_metadata AFTER ${event} ON ${table}
        BEGIN UPDATE database_metadata SET last_updated_at = ${SQL_NOW} WHERE id = 1; END
      `);
    }
  }
  ensureMetadata(connection);
  if (Number(connection.pragma('user_version', { simple: true })) !== SCHEMA_VERSION) {
    connection.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
})();
