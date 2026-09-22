import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import { decodeItemQrPayload, encodeItemQrPayload } from '../shared/itemQr.js';
import { readScannedText } from '../client/src/qrScan.js';

process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'inventory-qr-test-'));
const { applySchema } = await import('../server/src/db.js');

const uuid = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';

test('an item UUID is encoded as the canonical ial:item:v1 payload', () => {
  assert.equal(encodeItemQrPayload(uuid), `ial:item:v1:${uuid}`);
  // Real item UUIDs come from randomUUID(), and the payload never carries a host, port, or domain.
  const payload = encodeItemQrPayload(randomUUID());
  assert.match(payload, /^ial:item:v1:[0-9a-f-]{36}$/);
  // Whitespace and case are normalized so one item always produces one code.
  assert.equal(encodeItemQrPayload(`  ${uuid.toUpperCase()}  `), `ial:item:v1:${uuid}`);
  assert.throws(() => encodeItemQrPayload('42'), /Invalid item UUID/);
  assert.throws(() => encodeItemQrPayload(undefined), /Invalid item UUID/);
});

test('a canonical payload decodes back to the item UUID', () => {
  assert.equal(decodeItemQrPayload(`ial:item:v1:${uuid}`), uuid);
  assert.equal(decodeItemQrPayload(`\n ial:item:v1:${uuid} `), uuid);
  assert.equal(decodeItemQrPayload(encodeItemQrPayload(uuid)), uuid);
});

test('anything that is not an item code of this version is rejected', () => {
  for (const value of ['', 'ial:item', `http://192.168.1.10:3000/items/${uuid}`, `other:item:v1:${uuid}`,
    `ial:box:v1:${uuid}`, `ial:item:v1:${uuid}:extra`, uuid]) {
    assert.throws(() => decodeItemQrPayload(value), /not an Inventory Atlas item code/, `accepted ${JSON.stringify(value)}`);
  }
  assert.throws(() => decodeItemQrPayload(`ial:item:v2:${uuid}`), /Unsupported item code version/);
  assert.throws(() => decodeItemQrPayload('ial:item:v1:not-a-uuid-at-all-0000-000000000000'), /does not contain a valid UUID/);
  assert.throws(() => decodeItemQrPayload(`ial:item:v1:${uuid.toUpperCase()}`), /does not contain a valid UUID/);
});

test('the bundled generator turns the payload into a QR matrix without any network access', () => {
  const qr = qrcode(0, 'M');
  qr.addData(encodeItemQrPayload(uuid));
  qr.make();
  assert.ok(qr.getModuleCount() >= 21);
  // The three finder patterns are what a scanner looks for; their corners must be dark.
  assert.ok(qr.isDark(0, 0) && qr.isDark(0, qr.getModuleCount() - 1) && qr.isDark(qr.getModuleCount() - 1, 0));
});

test('the bundled scanner decoder reads a generated item code back from its pixels', () => {
  const qr = qrcode(0, 'M');
  qr.addData(encodeItemQrPayload(uuid));
  qr.make();
  // Four pixels per module and a four-module quiet zone, painted as RGBA like a canvas frame.
  const scale = 4;
  const size = (qr.getModuleCount() + 8) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - 4;
      const column = Math.floor(x / scale) - 4;
      const dark = row >= 0 && column >= 0 && row < qr.getModuleCount() && column < qr.getModuleCount() && qr.isDark(row, column);
      if (dark) pixels.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
  }
  const text = jsQR(pixels, size, size).data;
  assert.deepEqual(readScannedText(text), { uuid });
});

test('scanned text is classified into an item, a foreign code, or a broken item code', () => {
  assert.deepEqual(readScannedText(` ial:item:v1:${uuid}
`), { uuid });
  const foreign = 'This is not an Inventory Atlas QR code.';
  const broken = 'This Inventory Atlas QR code is invalid or uses an unsupported format.';
  for (const value of [`https://example.com/items/${uuid}`, uuid, '', `ial:box:v1:${uuid}`]) {
    assert.deepEqual(readScannedText(value), { error: foreign }, JSON.stringify(value));
  }
  for (const value of [`ial:item:v2:${uuid}`, 'ial:item:v1:not-a-uuid', 'ial:item:v1', `ial:item:v1:${uuid}:extra`]) {
    assert.deepEqual(readScannedText(value), { error: broken }, JSON.stringify(value));
  }
});

test('QR identity adds no database schema of its own', () => {
  const db = new Database(':memory:');
  applySchema(db);
  const columns = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    .flatMap(({ name }) => [name, ...db.prepare(`PRAGMA table_info(${name})`).all().map(column => column.name)]);
  assert.deepEqual(columns.filter(name => /qr/i.test(name)), []);
  // The QR code is derived from the UUID the items table already has.
  assert.ok(db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'uuid'));
  db.close();
});
