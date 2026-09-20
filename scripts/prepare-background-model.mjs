import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDirectory = path.join(root, 'server', 'models');
const modelPath = path.join(modelDirectory, 'u2netp.onnx');
const temporaryPath = `${modelPath}.download`;
const modelUrl = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';
const expectedSha256 = '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';

const digest = buffer => createHash('sha256').update(buffer).digest('hex');

try {
  const existing = await readFile(modelPath);
  if (digest(existing) === expectedSha256) process.exit(0);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(modelDirectory, { recursive: true });
await rm(temporaryPath, { force: true });
console.log('Downloading the local U2NetP background-removal model...');
const response = await fetch(modelUrl);
if (!response.ok) throw new Error(`Could not download U2NetP (${response.status}).`);
const model = Buffer.from(await response.arrayBuffer());
if (digest(model) !== expectedSha256) throw new Error('The downloaded U2NetP model checksum does not match.');
await writeFile(temporaryPath, model);
await rename(temporaryPath, modelPath);
console.log('Local background-removal model is ready.');
