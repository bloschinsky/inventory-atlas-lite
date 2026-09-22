import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDirectory = path.join(root, 'server', 'models');
const modelName = 'isnet-general-use-dynamic.onnx';
const modelPath = path.join(modelDirectory, modelName);
const temporaryPath = `${modelPath}.download`;
// An ONNX re-export of isnet-general-use whose spatial axes are dynamic, pinned to one repository
// revision and accepted only on its SHA-256. The rembg release mirror ships the same weights with
// 1024x1024 baked into the declared shape of every node, which onnxruntime refuses to run at any
// other input size. The two were compared on the regression photo at 1024 and their masks differ by
// at most 3e-6, so this is the same checkpoint rather than a different model.
const modelUrl = 'https://huggingface.co/SacredNoir/isnet-general-use-onnx/resolve/ff56cb825ee2637d4726f8a739fb7bf1bf4bea04/isnet-general-use.onnx';
const expectedSha256 = '4c56bbc21588459dda11efba5a4a8ee163969da109ae170fb1988c1c2ea4a90a';

const digest = buffer => createHash('sha256').update(buffer).digest('hex');

// Earlier releases used u2netp.onnx and the fixed-size isnet-general-use.onnx. Removing them keeps
// installations and release archives from carrying a model that nothing loads any more.
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
console.log('Downloading the local IS-Net background-removal model (168 MB)...');
const response = await fetch(modelUrl);
if (!response.ok) throw new Error(`Could not download IS-Net (${response.status}).`);
const model = Buffer.from(await response.arrayBuffer());
if (digest(model) !== expectedSha256) throw new Error('The downloaded IS-Net model checksum does not match.');
await writeFile(temporaryPath, model);
await rename(temporaryPath, modelPath);
await removeSupersededModels();
console.log('Local background-removal model is ready.');
