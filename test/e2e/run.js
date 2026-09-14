import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dataDir, removeDataDir } from './environment.js';

// Importing the environment created the temporary data directory and published it through
// E2E_DATA_DIR, which the Playwright config, the API server, and Vite all inherit from here.
console.log(`End-to-end data directory: ${dataDir}`);

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], { stdio: 'inherit' });

// Playwright stops the application processes itself; the data can only be removed afterwards.
child.on('exit', (code, signal) => {
  removeDataDir();
  process.exit(signal ? 1 : code ?? 1);
});

// Let Playwright handle the interrupt and shut the servers down before cleanup runs.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {});
