import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The persistent data directory (DATA_DIR, or data/ in a working copy), shared by the server and the command line.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
