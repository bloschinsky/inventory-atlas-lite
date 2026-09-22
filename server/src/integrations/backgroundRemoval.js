import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

/*
  Local cutout pipeline. The segmentation model is IS-Net (rembg's "isnet-general-use"), a
  dichotomous-segmentation network trained on DIS5K. It replaced U2NetP because the lightweight
  model kept clutter such as hands, bubble wrap, and table edges in the foreground and left
  semi-transparent fringes behind. IS-Net runs at 768x768 instead of 320x320, which costs a couple of
  seconds of CPU time per photo but resolves thin structures like card brackets and contact fingers.
  The model is trained at 1024x1024 and the re-export this project pins accepts either; 768 keeps the
  mask within a tenth of a per cent of the 1024 result while roughly halving time and memory, which
  matters for the 1 GiB containers this application is deployed into.

  The raw mask is never composited directly. It is first reduced to a clean silhouette through
  hysteresis thresholding, connected-region filtering, and hole filling, and only then feathered,
  so the result is a crisp object on white rather than a soft matte carrying background colour.
*/
const MODEL_SIZE = 768;
const MAX_SOURCE_DIMENSION = 2048;
const MAX_INPUT_PIXELS = 40_000_000;

// Confident foreground, and the weaker value a pixel still needs to be pulled in from a confident
// neighbour. Isolated soft blobs never reach a core pixel, so background haze is dropped entirely.
const CORE_THRESHOLD = 0.6;
const EDGE_THRESHOLD = 0.2;
// Detached regions smaller than this share of the largest region are specks, not parts of the item.
const MIN_REGION_RATIO = 0.05;
// Enclosed gaps up to this share of the subject are model noise over dark areas and get filled.
const MAX_HOLE_RATIO = 0.02;
// Feathering window applied to the cleaned silhouette. The midpoint sits above 0.5 so the edge is
// pulled slightly inward, off the pixels whose colour is still mixed with the old background.
const FEATHER_LOW = 0.45;
const FEATHER_HIGH = 0.8;

const PADDING_RATIO = 0.07;
const SHADOW_BLUR_RATIO = 0.02;
const SHADOW_OFFSET_RATIO = 0.025;
const SHADOW_OPACITY = 0.22;
const SHADOW_TINT = 40;

const modelPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../models/isnet-general-use-dynamic.onnx');

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
  const planeSize = MODEL_SIZE * MODEL_SIZE;
  const normalized = new Float32Array(planeSize * 3);
  // IS-Net expects zero-centred input with unit deviation, not the ImageNet statistics U2NetP used.
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      normalized[channel * planeSize + pixel] = data[pixel * 3 + channel] / 255 - 0.5;
    }
  }
  return new ort.Tensor('float32', normalized, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

function neighbours(index, into) {
  const x = index % MODEL_SIZE;
  const y = (index - x) / MODEL_SIZE;
  let count = 0;
  if (x > 0) into[count++] = index - 1;
  if (x < MODEL_SIZE - 1) into[count++] = index + 1;
  if (y > 0) into[count++] = index - MODEL_SIZE;
  if (y < MODEL_SIZE - 1) into[count++] = index + MODEL_SIZE;
  return count;
}

// Grows every confident region over the plausible values touching it and discards everything else.
function hysteresisMask(values) {
  const total = MODEL_SIZE * MODEL_SIZE;
  const mask = new Uint8Array(total);
  const stack = new Int32Array(total);
  const around = new Int32Array(4);
  let top = 0;
  for (let index = 0; index < total; index += 1) {
    if (values[index] >= CORE_THRESHOLD) {
      mask[index] = 1;
      stack[top++] = index;
    }
  }
  if (top === 0) throw new Error('The segmentation model found no distinct subject.');
  while (top > 0) {
    const index = stack[--top];
    const count = neighbours(index, around);
    for (let step = 0; step < count; step += 1) {
      const neighbour = around[step];
      if (!mask[neighbour] && values[neighbour] >= EDGE_THRESHOLD) {
        mask[neighbour] = 1;
        stack[top++] = neighbour;
      }
    }
  }
  return mask;
}

// Labels the 4-connected regions of the mask holding `wanted` and returns their pixel counts.
function regions(mask, wanted) {
  const total = mask.length;
  const labels = new Int32Array(total);
  const stack = new Int32Array(total);
  const around = new Int32Array(4);
  const areas = [0];
  for (let seed = 0; seed < total; seed += 1) {
    if (mask[seed] !== wanted || labels[seed]) continue;
    const label = areas.length;
    let area = 0;
    let top = 0;
    labels[seed] = label;
    stack[top++] = seed;
    while (top > 0) {
      const index = stack[--top];
      area += 1;
      const count = neighbours(index, around);
      for (let step = 0; step < count; step += 1) {
        const neighbour = around[step];
        if (mask[neighbour] === wanted && !labels[neighbour]) {
          labels[neighbour] = label;
          stack[top++] = neighbour;
        }
      }
    }
    areas.push(area);
  }
  return { labels, areas };
}

function dropSpecks(mask) {
  const { labels, areas } = regions(mask, 1);
  const minimum = Math.max(...areas) * MIN_REGION_RATIO;
  let kept = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] && areas[labels[index]] < minimum) mask[index] = 0;
    else kept += mask[index];
  }
  return kept;
}

function fillHoles(mask, subjectArea) {
  const { labels, areas } = regions(mask, 0);
  const outside = new Set();
  for (let edge = 0; edge < MODEL_SIZE; edge += 1) {
    outside.add(labels[edge]);
    outside.add(labels[(MODEL_SIZE - 1) * MODEL_SIZE + edge]);
    outside.add(labels[edge * MODEL_SIZE]);
    outside.add(labels[edge * MODEL_SIZE + MODEL_SIZE - 1]);
  }
  const maximum = subjectArea * MAX_HOLE_RATIO;
  for (let index = 0; index < mask.length; index += 1) {
    const label = labels[index];
    if (!mask[index] && !outside.has(label) && areas[label] <= maximum) mask[index] = 1;
  }
}

function silhouette(values) {
  const mask = hysteresisMask(values);
  fillHoles(mask, dropSpecks(mask));
  const image = Buffer.alloc(mask.length);
  for (let index = 0; index < mask.length; index += 1) image[index] = mask[index] ? 255 : 0;
  return image;
}

// Scales the silhouette to the photo, softens the staircase left by the model grid, and turns the
// result into alpha that is either solid or absent apart from a hairline transition.
async function featheredAlpha(silhouetteMask, width, height) {
  const sigma = Math.max(0.6, Math.min(width, height) / 900);
  // sharp promotes a single-channel raw buffer to sRGB, so the result is read with its own stride.
  const scaled = await sharp(silhouetteMask, { raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 } })
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .blur(sigma)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const level = Math.min(1, Math.max(0, (scaled.data[pixel * scaled.info.channels] / 255 - FEATHER_LOW) / (FEATHER_HIGH - FEATHER_LOW)));
    alpha[pixel] = Math.round(level * level * (3 - 2 * level) * 255);
  }
  return alpha;
}

function subjectBounds(alpha, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < 128) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) throw new Error('The segmentation model found no visible subject.');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// A deliberate soft shadow, derived from the placed silhouette rather than from leftover mask noise.
async function shadowLayer(subject) {
  const { width, height } = subject.info;
  const opacity = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < opacity.length; pixel += 1) opacity[pixel] = subject.data[pixel * 4 + 3];
  const sigma = Math.max(4, height * SHADOW_BLUR_RATIO);
  const margin = Math.ceil(sigma * 3);
  const blurred = await sharp(opacity, { raw: { width, height, channels: 1 } })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: '#000000' })
    .blur(sigma)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = (width + margin * 2) * (height + margin * 2);
  const shadow = Buffer.alloc(total * 4);
  for (let pixel = 0; pixel < total; pixel += 1) {
    shadow[pixel * 4] = SHADOW_TINT;
    shadow[pixel * 4 + 1] = SHADOW_TINT;
    shadow[pixel * 4 + 2] = SHADOW_TINT;
    shadow[pixel * 4 + 3] = Math.round(blurred.data[pixel * blurred.info.channels] * SHADOW_OPACITY);
  }
  return {
    data: shadow,
    width: width + margin * 2,
    height: height + margin * 2,
    margin,
    offset: Math.round(height * SHADOW_OFFSET_RATIO)
  };
}

async function renderResult(source, silhouetteMask) {
  const { width, height, channels } = source.info;
  const alpha = await featheredAlpha(silhouetteMask, width, height);
  const bounds = subjectBounds(alpha, width, height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = source.data[pixel * channels];
    rgba[pixel * 4 + 1] = source.data[pixel * channels + 1];
    rgba[pixel * 4 + 2] = source.data[pixel * channels + 2];
    rgba[pixel * 4 + 3] = alpha[pixel];
  }
  const padding = Math.max(1, Math.round(Math.max(width, height) * PADDING_RATIO));
  const subject = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract(bounds)
    .resize(Math.max(1, width - padding * 2), Math.max(1, height - padding * 2), { fit: 'inside', withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const shadow = await shadowLayer(subject);
  const left = Math.round((width - subject.info.width) / 2);
  const top = Math.round((height - subject.info.height) / 2);
  const place = (value, layer, canvas) => Math.min(Math.max(0, value), Math.max(0, canvas - layer));
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite([
      {
        input: shadow.data,
        raw: { width: shadow.width, height: shadow.height, channels: 4 },
        left: place(left - shadow.margin, shadow.width, width),
        top: place(top - shadow.margin + shadow.offset, shadow.height, height)
      },
      {
        input: subject.data,
        raw: { width: subject.info.width, height: subject.info.height, channels: 4 },
        left,
        top
      }
    ])
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
  return renderResult(source, silhouette(output.data));
}

export function removeBackground(image) {
  const operation = processingQueue.then(async () => removeBackgroundWithSession(image, await modelSession()));
  processingQueue = operation.catch(() => {});
  return operation;
}
