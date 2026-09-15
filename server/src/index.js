import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowedTypes = new Set(['text', 'number', 'date', 'boolean']);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, done) => {
    const valid = imageTypes.has(file.mimetype);
    done(valid ? null : new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'), valid);
  }
});

app.use(express.json({ limit: '1mb' }));

const requiredText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  return value.trim();
};
const nullableText = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const getCategory = id => db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
const getItemBase = id => db.prepare(`
  SELECT i.*, c.name AS category_name FROM items i
  JOIN categories c ON c.id = i.category_id WHERE i.id = ? OR i.uuid = ?
`).get(id, id);
const getItemRef = id => db.prepare('SELECT id, uuid, name FROM items WHERE id = ?').get(id);
const getDescendantIds = id => db.prepare(`
  WITH RECURSIVE tree(id) AS (
    SELECT id FROM items WHERE parent_item_id = @id
    UNION ALL SELECT i.id FROM items i JOIN tree t ON i.parent_item_id = t.id
  ) SELECT id FROM tree
`).all({ id }).map(row => row.id);
const getChildren = id => db.prepare(`
  SELECT i.id, i.uuid, i.name, i.condition, c.name AS category_name,
    (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
  FROM items i JOIN categories c ON c.id = i.category_id
  WHERE i.parent_item_id = ? ORDER BY i.name COLLATE NOCASE
`).all(id);
const resolveParentId = (raw, itemId = null) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const parentId = Number.parseInt(raw);
  if (!Number.isInteger(parentId) || !getItemRef(parentId)) throw Object.assign(new Error('Parent item not found.'), { status: 400 });
  if (itemId && parentId === itemId) throw Object.assign(new Error('An item cannot be stored inside itself.'), { status: 400 });
  if (itemId && getDescendantIds(itemId).includes(parentId)) throw Object.assign(new Error('An item cannot be stored inside one of its own contents.'), { status: 400 });
  return parentId;
};
const escapeLike = value => value.replace(/[\\%_]/g, '\\$&');
const searchLike = value => `%${escapeLike(value)}%`;

app.get('/api/categories', (_req, res) => {
  res.json(db.prepare(`
    SELECT c.*, COUNT(DISTINCT i.id) AS item_count, COUNT(DISTINCT f.id) AS field_count
    FROM categories c LEFT JOIN items i ON i.category_id = c.id
    LEFT JOIN custom_fields f ON f.category_id = c.id
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE
  `).all());
});
app.post('/api/categories', (req, res) => {
  const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(requiredText(req.body.name, 'Category name'));
  res.status(201).json(getCategory(info.lastInsertRowid));
});
app.put('/api/categories/:id', (req, res) => {
  if (!getCategory(req.params.id)) return res.status(404).json({ error: 'Category not found.' });
  db.prepare('UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(requiredText(req.body.name, 'Category name'), req.params.id);
  res.json(getCategory(req.params.id));
});
app.delete('/api/categories/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS count FROM items WHERE category_id = ?').get(req.params.id).count;
  if (used) return res.status(409).json({ error: `Category is used by ${used} item(s). Move or delete them first.` });
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Category not found.' });
  res.status(204).end();
});

app.get('/api/categories/:id/fields', (req, res) => {
  if (!getCategory(req.params.id)) return res.status(404).json({ error: 'Category not found.' });
  res.json(db.prepare('SELECT * FROM custom_fields WHERE category_id = ? ORDER BY id').all(req.params.id));
});
app.post('/api/categories/:id/fields', (req, res) => {
  if (!getCategory(req.params.id)) return res.status(404).json({ error: 'Category not found.' });
  const name = requiredText(req.body.name, 'Field name');
  if (!allowedTypes.has(req.body.type)) return res.status(400).json({ error: 'Invalid field type.' });
  const info = db.prepare('INSERT INTO custom_fields (category_id, name, type) VALUES (?, ?, ?)').run(req.params.id, name, req.body.type);
  res.status(201).json(db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(info.lastInsertRowid));
});
app.get('/api/fields/:id/suggestions', (req, res) => {
  const field = db.prepare('SELECT id, type FROM custom_fields WHERE id = ?').get(req.params.id);
  if (!field) return res.status(404).json({ error: 'Field not found.' });
  if (field.type !== 'text') return res.status(400).json({ error: 'Suggestions are available for text fields only.' });
  const search = String(req.query.search || '').trim();
  const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit) || 10));
  // Suggestions are the values already saved for this exact field, most used first.
  res.json(db.prepare(`
    SELECT MIN(TRIM(value)) AS value, COUNT(*) AS usage_count FROM item_field_values
    WHERE field_id = @fieldId AND value IS NOT NULL AND TRIM(value) != ''
      AND TRIM(value) LIKE @search ESCAPE '\\'
    GROUP BY TRIM(value) COLLATE NOCASE
    ORDER BY usage_count DESC, value COLLATE NOCASE LIMIT @limit
  `).all({ fieldId: field.id, search: `${escapeLike(search)}%`, limit }));
});
app.delete('/api/fields/:id', (req, res) => {
  const field = db.prepare('SELECT f.*, COUNT(v.id) AS value_count FROM custom_fields f LEFT JOIN item_field_values v ON v.field_id = f.id WHERE f.id = ? GROUP BY f.id').get(req.params.id);
  if (!field) return res.status(404).json({ error: 'Field not found.' });
  if (field.value_count && req.query.confirm !== 'true') return res.status(409).json({ error: `This field has ${field.value_count} saved value(s). Confirm deletion to remove them.` });
  db.prepare('DELETE FROM custom_fields WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

app.get('/api/items', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize) || 12));
  const sortMap = { name: 'i.name COLLATE NOCASE', category: 'c.name COLLATE NOCASE', created: 'i.created_at', updated: 'i.updated_at' };
  const sort = sortMap[req.query.sort] || sortMap.name;
  const direction = req.query.direction === 'desc' ? 'DESC' : 'ASC';
  const search = String(req.query.search || '').trim();
  const categoryId = Number.parseInt(req.query.categoryId) || null;
  const where = [];
  const params = {};
  if (search) { where.push('(i.name LIKE @search ESCAPE \'\\\' OR i.description LIKE @search ESCAPE \'\\\')'); params.search = searchLike(search); }
  if (categoryId) { where.push('i.category_id = @categoryId'); params.categoryId = categoryId; }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM items i ${clause}`).get(params).count;
  const items = db.prepare(`
    SELECT i.id, i.uuid, i.name, i.condition, i.location, i.created_at, i.updated_at,
      c.id AS category_id, c.name AS category_name,
      (SELECT id FROM item_photos p WHERE p.item_id = i.id ORDER BY p.id LIMIT 1) AS thumbnail_id
    FROM items i JOIN categories c ON c.id = i.category_id ${clause}
    ORDER BY ${sort} ${direction}, i.id ASC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ items, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
});
app.get('/api/items/parent-candidates', (req, res) => {
  const search = String(req.query.search || '').trim();
  const excludeId = Number.parseInt(req.query.excludeId) || null;
  const excluded = excludeId ? [excludeId, ...getDescendantIds(excludeId)] : [];
  const where = [];
  const params = {};
  if (search) { where.push("i.name LIKE @search ESCAPE '\\'"); params.search = searchLike(search); }
  if (excluded.length) where.push(`i.id NOT IN (${excluded.join(',')})`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(db.prepare(`
    SELECT i.id, i.uuid, i.name, c.name AS category_name FROM items i
    JOIN categories c ON c.id = i.category_id ${clause}
    ORDER BY i.name COLLATE NOCASE LIMIT 20
  `).all(params));
});
app.get('/api/items/:id', (req, res) => {
  const item = getItemBase(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  item.fields = db.prepare(`SELECT f.id, f.name, f.type, v.value FROM custom_fields f LEFT JOIN item_field_values v ON v.field_id = f.id AND v.item_id = ? WHERE f.category_id = ? ORDER BY f.id`).all(item.id, item.category_id);
  item.photos = db.prepare('SELECT id, filename, mime_type, created_at FROM item_photos WHERE item_id = ? ORDER BY id').all(item.id);
  item.parent = item.parent_item_id ? getItemRef(item.parent_item_id) : null;
  item.children = getChildren(item.id);
  res.json(item);
});

const validateValues = (categoryId, values = {}) => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Object.assign(new Error('Field values must be an object.'), { status: 400 });
  const fields = db.prepare('SELECT id, type FROM custom_fields WHERE category_id = ?').all(categoryId);
  const allowed = new Map(fields.map(f => [String(f.id), f.type]));
  return Object.entries(values).map(([fieldId, raw]) => {
    const type = allowed.get(String(fieldId));
    if (!type) throw Object.assign(new Error(`Field ${fieldId} does not belong to the selected category.`), { status: 400 });
    if (raw === '' || raw === null || raw === undefined) return [Number(fieldId), null];
    if (type === 'number' && !Number.isFinite(Number(raw))) throw Object.assign(new Error(`Field ${fieldId} must be a number.`), { status: 400 });
    if (type === 'boolean' && !['true', 'false', true, false, 1, 0, '1', '0'].includes(raw)) throw Object.assign(new Error(`Field ${fieldId} must be a boolean.`), { status: 400 });
    return [Number(fieldId), type === 'boolean' ? (['true', true, 1, '1'].includes(raw) ? '1' : '0') : String(raw)];
  });
};
const saveValue = db.prepare('INSERT INTO item_field_values (item_id, field_id, value) VALUES (?, ?, ?) ON CONFLICT(item_id, field_id) DO UPDATE SET value = excluded.value');
const createItem = db.transaction(body => {
  const name = requiredText(body.name, 'Item name');
  const categoryId = Number.parseInt(body.category_id);
  if (!getCategory(categoryId)) throw Object.assign(new Error('Valid category is required.'), { status: 400 });
  const values = validateValues(categoryId, body.field_values);
  const parentId = resolveParentId(body.parent_item_id);
  const info = db.prepare('INSERT INTO items (uuid, name, category_id, description, condition, location, parent_item_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), name, categoryId, nullableText(body.description), nullableText(body.condition), nullableText(body.location), parentId);
  for (const [fieldId, value] of values) saveValue.run(info.lastInsertRowid, fieldId, value);
  return info.lastInsertRowid;
});
const updateItem = db.transaction((id, body) => {
  const current = getItemBase(id);
  if (!current) throw Object.assign(new Error('Item not found.'), { status: 404 });
  const name = requiredText(body.name, 'Item name');
  const categoryId = Number.parseInt(body.category_id);
  if (!getCategory(categoryId)) throw Object.assign(new Error('Valid category is required.'), { status: 400 });
  const values = validateValues(categoryId, body.field_values);
  const parentId = resolveParentId(body.parent_item_id, current.id);
  db.prepare('UPDATE items SET name = ?, category_id = ?, description = ?, condition = ?, location = ?, parent_item_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, categoryId, nullableText(body.description), nullableText(body.condition), nullableText(body.location), parentId, current.id);
  for (const [fieldId, value] of values) saveValue.run(current.id, fieldId, value);
  return current.id;
});
app.post('/api/items', (req, res) => { const id = createItem(req.body); res.status(201).json(getItemBase(id)); });
app.put('/api/items/:id', (req, res) => { const id = updateItem(req.params.id, req.body); res.json(getItemBase(id)); });
app.delete('/api/items/:id', (req, res) => {
  const item = getItemBase(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const contained = db.prepare('SELECT COUNT(*) AS count FROM items WHERE parent_item_id = ?').get(item.id).count;
  if (contained) return res.status(409).json({ error: `This item contains ${contained} item(s). Move or delete them first.` });
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  res.status(204).end();
});

app.post('/api/items/:id/photos', upload.array('photos', 10), (req, res) => {
  const item = getItemBase(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (!req.files?.length) return res.status(400).json({ error: 'Choose at least one image.' });
  const insert = db.prepare('INSERT INTO item_photos (item_id, filename, mime_type, data) VALUES (?, ?, ?, ?)');
  const ids = db.transaction(files => files.map(file => insert.run(item.id, file.originalname, file.mimetype, file.buffer).lastInsertRowid))(req.files);
  res.status(201).json(db.prepare(`SELECT id, filename, mime_type, created_at FROM item_photos WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids));
});
app.get('/api/photos/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM item_photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });
  res.type(photo.mime_type).set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(photo.filename)}`).send(photo.data);
});
app.delete('/api/photos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM item_photos WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Photo not found.' });
  res.status(204).end();
});

app.get('/api/backup', async (_req, res, next) => {
  const backupPath = path.join(os.tmpdir(), `inventory-backup-${randomUUID()}.sqlite`);
  try {
    await db.backup(backupPath);
    res.download(backupPath, `inventory-${new Date().toISOString().slice(0, 10)}.sqlite`, () => fs.rm(backupPath, { force: true }, () => {}));
  } catch (error) { fs.rm(backupPath, { force: true }, () => {}); next(error); }
});

if (isProduction) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
app.use((error, _req, res, _next) => {
  console.error(error);
  const duplicate = error.code === 'SQLITE_CONSTRAINT_UNIQUE';
  res.status(error.status || (duplicate ? 409 : 500)).json({ error: duplicate ? 'A record with this name already exists.' : (error.message || 'Unexpected server error.') });
});
const server = app.listen(port, '0.0.0.0', () => console.log(`Inventory server listening on http://0.0.0.0:${port}`));
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
