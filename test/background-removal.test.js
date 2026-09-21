import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { removeBackgroundWithSession } from '../server/src/integrations/backgroundRemoval.js';

test('background removal isolates, centers, and places a subject on a white JPEG canvas', async () => {
  const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } })
    .composite([{ input: Buffer.from('<svg width="200" height="150"><rect width="200" height="150" fill="#d02020"/></svg>'), left: 100, top: 75 }])
    .png()
    .toBuffer();
  const sourceCenter = await sharp(source).extract({ left: 200, top: 150, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(sourceCenter[0] > 180 && sourceCenter[1] < 80 && sourceCenter[2] < 80);
  const mask = new Float32Array(320 * 320);
  for (let y = 80; y < 240; y += 1) {
    for (let x = 80; x < 240; x += 1) mask[y * 320 + x] = 1;
  }
  const session = {
    inputNames: ['input'],
    outputNames: ['mask'],
    async run() { return { mask: { data: mask } }; }
  };

  const result = await removeBackgroundWithSession(source, session);
  assert.equal(result.subarray(0, 3).toString('hex'), 'ffd8ff');
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [400, 300]);
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  assert.ok(pixel(0, 0).every(value => value > 245));
  const center = pixel(200, 150);
  assert.ok(center[0] > 180 && center[1] < 80 && center[2] < 80);
});

test('background removal rejects data that cannot be decoded as an image', async () => {
  await assert.rejects(
    removeBackgroundWithSession(Buffer.from('not an image'), {}),
    error => error.status === 400 && error.message.includes('decoded safely')
  );
});
