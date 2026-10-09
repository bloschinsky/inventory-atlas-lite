/*
  Item activity history capacity benchmark. It fills a fresh database with synthetic history and
  measures what history costs: the size of its tables and indexes, timeline pages of the busiest item,
  and a container move with hundreds of descendants while that much history exists.

  Run it on demand (it is not part of `npm test`, which runs the same measurement at 100,000 events):

    node scripts/history-benchmark.mjs                # 1,000,000 events over 10,000 items
    node scripts/history-benchmark.mjs --events 250000 --items 5000

  The database is written to a temporary directory and removed afterwards; data/ is never touched.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HISTORY_OBJECTS = ['item_events', 'item_operations', 'idx_item_events_item', 'idx_item_events_operation'];
const EVENT_TYPES = ['location_changed', 'location_changed', 'location_changed', 'container_changed', 'container_changed', 'recipient_changed'];

// A small deterministic generator, so every run builds the same history.
const random = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/*
  Adds `items` top-level items and `events` events in two-event operations, spread over three years
  with realistic text snapshots. Item 1 is the busiest one: it gets one event in fifty.
*/
export function fillHistory(db, { items, events }) {
  const next = random(42);
  const categoryId = db.prepare('SELECT id FROM categories ORDER BY id LIMIT 1').get().id;
  const start = Date.parse('2023-10-01T00:00:00.000Z');
  const step = (3 * 365 * 24 * 60 * 60 * 1000) / events;
  db.transaction(() => {
    const insertItem = db.prepare('INSERT INTO items (uuid, name, category_id, location) VALUES (?, ?, ?, ?)');
    for (let index = 0; index < items; index++) insertItem.run(crypto.randomUUID(), `Item ${index}`, categoryId, `Shelf ${index % 40}`);
    const ids = db.prepare('SELECT id FROM items ORDER BY id').all().map(row => row.id);
    const insertOperation = db.prepare("INSERT INTO item_operations (type, created_at) VALUES ('item_update', ?)");
    const insertEvent = db.prepare(`
      INSERT INTO item_events (operation_id, item_id, event_type, occurred_at, from_value, to_value, from_item_id, from_item_name, to_item_id, to_item_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let operationId;
    for (let index = 0; index < events; index++) {
      const occurredAt = new Date(start + index * step).toISOString();
      if (index % 2 === 0) operationId = insertOperation.run(occurredAt).lastInsertRowid;
      const itemId = index % 50 === 0 ? ids[0] : ids[Math.floor(next() * ids.length)];
      const type = EVENT_TYPES[Math.floor(next() * EVENT_TYPES.length)];
      if (type === 'container_changed') {
        const from = ids[Math.floor(next() * ids.length)];
        const to = ids[Math.floor(next() * ids.length)];
        insertEvent.run(operationId, itemId, type, occurredAt, null, null, from, `Box ${from}`, to, `Box ${to}`);
      } else {
        insertEvent.run(operationId, itemId, type, occurredAt, `Shelf ${Math.floor(next() * 40)}`, `Shelf ${Math.floor(next() * 40)}`,
          null, null, null, null);
      }
    }
  })();
  return { items, events };
}

const timed = work => {
  const started = performance.now();
  const result = work();
  return { result, ms: Math.round((performance.now() - started) * 100) / 100 };
};

/*
  Measures the filled database through the real services. `add(name, parent, attributes)` creates an
  item through ItemService. Sizes come from SQLite's dbstat table: the pages each table and index use.
*/
export function measureHistory(db, itemService, { add }) {
  const sizes = Object.fromEntries(db.prepare('SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name').all()
    .map(row => [row.name, row.bytes]));
  const historyBytes = HISTORY_OBJECTS.reduce((total, name) => total + (sizes[name] ?? 0), 0);
  const busiest = db.prepare('SELECT item_id, COUNT(*) AS count FROM item_events GROUP BY item_id ORDER BY count DESC LIMIT 1').get();
  const plan = db.prepare(`
    EXPLAIN QUERY PLAN SELECT e.id FROM item_events e WHERE e.item_id = ? AND e.event_type IN (SELECT value FROM json_each(?))
    ORDER BY e.occurred_at DESC, e.id DESC LIMIT 21
  `).all(busiest.item_id, '["location_changed"]').map(row => row.detail).join('; ');
  const firstPage = timed(() => itemService.activity(busiest.item_id, { limit: 20 }));
  const deepCursor = db.prepare('SELECT id FROM item_events WHERE item_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1 OFFSET ?')
    .get(busiest.item_id, busiest.count - 25).id;
  const deepPage = timed(() => itemService.activity(busiest.item_id, { limit: 20, cursor: deepCursor }));

  // A box with 200 contents moves to another bench: one container change and 201 location changes.
  const benchA = add('Bench A', null, { location: 'Workshop A' });
  const benchB = add('Bench B', null, { location: 'Workshop B' });
  const box = add('Benchmark box', benchA);
  for (let index = 0; index < 200; index++) add(`Content ${index}`, box);
  const before = db.prepare('SELECT COUNT(*) AS count FROM item_events').get().count;
  const move = timed(() => itemService.bulkMove({ item_ids: [box.id], parent_item_id: benchB.id }));
  const events = db.prepare('SELECT COUNT(*) AS count FROM item_events').get().count;

  db.pragma('wal_checkpoint(TRUNCATE)');
  return {
    events,
    fileBytes: fs.statSync(db.name).size,
    historyBytes,
    eventTableBytes: sizes.item_events,
    itemIndexBytes: sizes.idx_item_events_item,
    operationIndexBytes: sizes.idx_item_events_operation,
    operationTableBytes: sizes.item_operations,
    busiestItemEvents: busiest.count,
    firstPageMs: firstPage.ms,
    firstPageEvents: firstPage.result.events.length,
    deepPageMs: deepPage.ms,
    moveMs: move.ms,
    moveEvents: events - before,
    plan
  };
}

async function main() {
  const option = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 ? Number(process.argv[index + 1]) : fallback;
  };
  const events = option('events', 1000000);
  const items = option('items', 10000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-history-benchmark-'));
  process.env.DATA_DIR = directory;
  const { default: Database } = await import('better-sqlite3');
  const { applySchema } = await import('../server/src/schema.js');
  const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
  const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
  const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
  const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
  const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
  const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
  const { ItemService } = await import('../server/src/services/itemService.js');
  try {
    const db = new Database(path.join(directory, 'inventory.sqlite'));
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    applySchema(db);
    const categoryId = db.prepare("INSERT INTO categories (name) VALUES ('Benchmark')").run().lastInsertRowid;
    const itemService = new ItemService({
      itemRepository: new ItemRepository(db), customFieldRepository: new CustomFieldRepository(db), itemPhotoRepository: new ItemPhotoRepository(db),
      categoryRepository: new CategoryRepository(db), itemHistoryService: new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) })
    });
    const add = (name, parent = null, attributes = {}) => itemService.create({ name, category_id: categoryId, parent_item_id: parent?.id ?? null, ...attributes });
    const fill = timed(() => fillHistory(db, { items, events }));
    const measured = measureHistory(db, itemService, { add });
    console.log(JSON.stringify({ items, insertedEvents: events, fillMs: fill.ms, bytesPerEvent: Math.round(measured.historyBytes / events), ...measured }, null, 2));
    db.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
