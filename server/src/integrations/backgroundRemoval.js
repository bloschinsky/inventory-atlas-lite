import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

const MODEL_SIZE = 320;
const MAX_SOURCE_DIMENSION = 2048;
const MAX_INPUT_PIXELS = 40_000_000;
const modelPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../models/u2netp.onnx');

let sessionPromise;
let processingQueue = Promise.resolve();

function modelSession() {
  sessionPromise ||= ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all'
  });
  return sessionPromise;
}

async function decodedImage(image) {
  try {
    const pipeline = sharp(image, { animated: false, limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    const metadata = await pipeline.metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) throw new Error('Unsupported image format.');
    return pipeline
      .resize(MAX_SOURCE_DIMENSION, MAX_SOURCE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw Object.assign(new Error('The uploaded image could not be decoded safely.'), { status: 400 });
  }
}

async function inputTensor(source) {
  const { data } = await sharp(source.data, {
    raw: { width: source.info.width, height: source.info.height, channels: source.info.channels }
  }).resize(MODEL_SIZE, MODEL_SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let maximum = 1;
  for (const value of data) maximum = Math.max(maximum, value);
  const planeSize = MODEL_SIZE * MODEL_SIZE;
  const normalized = new Float32Array(planeSize * 3);
  const means = [0.485, 0.456, 0.406];
  const deviations = [0.229, 0.224, 0.225];
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      normalized[channel * planeSize + pixel] = (data[pixel * 3 + channel] / maximum - means[channel]) / deviations[channel];
    }
  }
  return new ort.Tensor('float32', normalized, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

function normalizedMask(values) {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  const range = maximum - minimum;
  if (!Number.isFinite(range) || range < 1e-6) throw new Error('The segmentation model found no distinct subject.');
  const mask = Buffer.alloc(values.length);
  for (let index = 0; index < values.length; index += 1) {
    mask[index] = Math.round(Math.min(1, Math.max(0, (values[index] - minimum) / range)) * 255);
  }
  return mask;
}

function subjectBounds(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] < 32) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('The segmentation model found no visible subject.');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function renderResult(source, mask) {
  const { width, height, channels } = source.info;
  const resized = await sharp(mask, { raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 } })
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const resizedMask = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    resizedMask[pixel] = resized.data[pixel * resized.info.channels];
  }
  const bounds = subjectBounds(resizedMask, width, height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = source.data[pixel * channels];
    rgba[pixel * 4 + 1] = source.data[pixel * channels + 1];
    rgba[pixel * 4 + 2] = source.data[pixel * channels + 2];
    const alpha = resizedMask[pixel];
    rgba[pixel * 4 + 3] = alpha < 12 ? 0 : (alpha > 243 ? 255 : alpha);
  }
  const padding = Math.max(1, Math.round(Math.max(width, height) * 0.06));
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const subject = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract(bounds)
    .resize(availableWidth, availableHeight, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite([{
      input: subject.data,
      left: Math.round((width - subject.info.width) / 2),
      top: Math.round((height - subject.info.height) / 2)
    }])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

export async function removeBackgroundWithSession(image, session) {
  const source = await decodedImage(image);
  const tensor = await inputTensor(source);
  const inputName = session.inputNames[0];
  const result = await session.run({ [inputName]: tensor });
  const output = result[session.outputNames[0]];
  if (!output?.data || output.data.length !== MODEL_SIZE * MODEL_SIZE) {
    throw new Error('The segmentation model returned an invalid mask.');
  }
  return renderResult(source, normalizedMask(output.data));
}

export function removeBackground(image) {
  const operation = processingQueue.then(async () => removeBackgroundWithSession(image, await modelSession()));
  processingQueue = operation.catch(() => {});
  return operation;
}
