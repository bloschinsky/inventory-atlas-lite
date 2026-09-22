import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { removeBackground, removeBackgroundWithSession } from '../server/src/integrations/backgroundRemoval.js';

const MODEL_SIZE = 768;
const modelPath = new URL('../server/models/isnet-general-use-dynamic.onnx', import.meta.url);
const regressionPhoto = new URL('fixtures/sound-blaster-audigy-ls-on-bubble-wrap.jpg', import.meta.url);

// The model output is the only thing stubbed, so everything after inference is exercised for real.
const sessionReturning = mask => ({
  inputNames: ['input_image'],
  outputNames: ['output_image'],
  async run() { return { output_image: { data: mask } }; }
});

const fillMask = (mask, { left, top, right, bottom }, value) => {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) mask[y * MODEL_SIZE + x] = value;
  }
};

const decoded = async image => {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  return { data, info, pixel };
};

const isWhite = ([red, green, blue]) => red > 248 && green > 248 && blue > 248;
const isNeutral = ([red, green, blue]) => Math.abs(red - green) < 6 && Math.abs(green - blue) < 6;

test('background removal isolates, centers, and places a subject on a white JPEG canvas', async () => {
  const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } })
    .composite([{ input: Buffer.from('<svg width="200" height="150"><rect width="200" height="150" fill="#d02020"/></svg>'), left: 100, top: 75 }])
    .png()
    .toBuffer();
  const mask = new Float32Array(MODEL_SIZE * MODEL_SIZE);
  fillMask(mask, { left: 192, top: 192, right: 576, bottom: 576 }, 1);

  const result = await removeBackgroundWithSession(source, sessionReturning(mask));
  assert.equal(result.subarray(0, 3).toString('hex'), 'ffd8ff');
  const { info, pixel } = await decoded(result);
  assert.deepEqual([info.width, info.height], [400, 300], 'the canvas must keep the source aspect ratio');
  assert.ok(isWhite(pixel(0, 0)) && isWhite(pixel(399, 0)), 'the top corners must stay white');
  const center = pixel(200, 150);
  assert.ok(center[0] > 180 && center[1] < 80 && center[2] < 80, 'the subject must be centered');
});

test('background removal drops specks and haze, fills mask holes, and draws a soft shadow', async () => {
  // Blue marks every area the model was uncertain about: none of it may reach the finished photo.
  const source = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#1040e0' } })
    .composite([{ input: Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="#d02020"/></svg>'), left: 300, top: 187 }])
    .png()
    .toBuffer();
  const mask = new Float32Array(MODEL_SIZE * MODEL_SIZE);
  fillMask(mask, { left: 225, top: 187, right: 525, bottom: 487 }, 1);
  // A hole the model left inside the subject, a detached speck, and a disconnected soft haze.
  fillMask(mask, { left: 300, top: 300, right: 315, bottom: 315 }, 0);
  fillMask(mask, { left: 675, top: 45, right: 697, bottom: 67 }, 1);
  fillMask(mask, { left: 37, top: 525, right: 187, bottom: 675 }, 0.35);

  const result = await removeBackgroundWithSession(source, sessionReturning(mask));
  const { data, info, pixel } = await decoded(result);

  let leaked = 0;
  let shadow = 0;
  let holes = 0;
  for (let index = 0; index < info.width * info.height; index += 1) {
    const [red, green, blue] = [data[index * 3], data[index * 3 + 1], data[index * 3 + 2]];
    if (blue > red + 20) leaked += 1;
    if (isNeutral([red, green, blue]) && red > 200 && red < 246) shadow += 1;
  }
  assert.equal(leaked, 0, 'background regions the model was unsure about were composited anyway');
  assert.ok(shadow > 2000, `expected a soft shadow, found ${shadow} shaded pixels`);
  assert.ok(isWhite(pixel(0, 0)) && isWhite(pixel(info.width - 1, 0)), 'the canvas corners must be white');

  // The subject is centered, so its filled hole sits at the middle of the finished photo.
  for (let y = info.height / 2 - 20; y < info.height / 2 + 20; y += 1) {
    for (let x = info.width / 2 - 20; x < info.width / 2 + 20; x += 1) {
      if (isWhite(pixel(Math.round(x), Math.round(y)))) holes += 1;
    }
  }
  assert.equal(holes, 0, 'a hole in the model mask was punched through the subject');
});

test('background removal reports a photo the model found no subject in', async () => {
  const source = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#808080' } }).png().toBuffer();
  await assert.rejects(
    removeBackgroundWithSession(source, sessionReturning(new Float32Array(MODEL_SIZE * MODEL_SIZE).fill(0.1))),
    error => error.message.includes('no distinct subject')
  );
});

test('background removal rejects data that cannot be decoded as an image', async () => {
  await assert.rejects(
    removeBackgroundWithSession(Buffer.from('not an image'), {}),
    error => error.status === 400 && error.message.includes('decoded safely')
  );
});

// The regression case Phase 1 was built against: a dark expansion card on textured bubble wrap,
// which the previous U2NetP pipeline returned with wrap fragments and a translucent halo around it.
test('a real cluttered photo comes back as a clean cutout', { skip: !existsSync(modelPath) && 'the local model is not installed' }, async () => {
  const result = await removeBackground(await readFile(regressionPhoto));
  const { data, info, pixel } = await decoded(result);

  let white = 0;
  let contaminated = 0;
  let subject = 0;
  let shadow = 0;
  for (let index = 0; index < info.width * info.height; index += 1) {
    const colour = [data[index * 3], data[index * 3 + 1], data[index * 3 + 2]];
    if (isWhite(colour)) white += 1;
    else if (colour[0] < 200) subject += 1;
    else if (isNeutral(colour)) shadow += 1;
    // Leftover bubble wrap and halo fringes land here: bright but neither white nor neutral.
    else contaminated += 1;
  }
  const total = info.width * info.height;
  assert.ok(white / total > 0.4, `only ${(white / total * 100).toFixed(1)}% of the canvas is white`);
  assert.ok(subject / total > 0.15, `the card covers only ${(subject / total * 100).toFixed(1)}% of the canvas`);
  assert.ok(contaminated / total < 0.02, `${(contaminated / total * 100).toFixed(2)}% of the canvas is tinted leftovers`);
  assert.ok(shadow > total * 0.005, 'the finished photo carries no visible shadow');

  // The padded border can only hold white and the shadow that is allowed to fall into it.
  for (let x = 0; x < info.width; x += 1) {
    assert.ok(isWhite(pixel(x, 0)) || isNeutral(pixel(x, 0)), `background fragment at the top edge, x=${x}`);
  }
  for (let y = 0; y < info.height; y += 1) {
    assert.ok(isWhite(pixel(0, y)) || isNeutral(pixel(0, y)), `background fragment at the left edge, y=${y}`);
  }
});
