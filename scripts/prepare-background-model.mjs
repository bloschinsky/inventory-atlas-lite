import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDirectory = path.join(root, 'server', 'models');
const modelName = 'isnet-general-use.onnx';
const modelPath = path.join(modelDirectory, modelName);
const temporaryPath = `${modelPath}.download`;
const modelUrl = `https://github.com/danielgatis/rembg/releases/download/v0.0.0/${modelName}`;
const expectedSha256 = '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a';

const digest = buffer => createHash('sha256').update(buffer).digest('hex');

// Earlier releases used u2netp.onnx. Removing it keeps installations and release archives from
// carrying a model that nothing loads any more.
const removeSupersededModels = async () => {
  for (const entry of await readdir(modelDirectory)) {
    if (entry.endsWith('.onnx') && entry !== modelName) await unlink(path.join(modelDirectory, entry));
  }
};

try {
  const existing = await readFile(modelPath);
  if (digest(existing) === expectedSha256) {
    await removeSupersededModels();
    process.exit(0);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(modelDirectory, { recursive: true });
await rm(temporaryPath, { force: true });
console.log('Downloading the local IS-Net background-removal model (170 MB)...');
const response = await fetch(modelUrl);
if (!response.ok) throw new Error(`Could not download IS-Net (${response.status}).`);
const model = Buffer.from(await response.arrayBuffer());
if (digest(model) !== expectedSha256) throw new Error('The downloaded IS-Net model checksum does not match.');
await writeFile(temporaryPath, model);
await rename(temporaryPath, modelPath);
await removeSupersededModels();
console.log('Local background-removal model is ready.');
