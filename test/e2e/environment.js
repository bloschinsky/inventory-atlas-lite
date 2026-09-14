import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dedicated ports so a running `npm run dev` can never be mistaken for the test application.
export const apiPort = Number(process.env.E2E_API_PORT) || 3456;
export const clientPort = Number(process.env.E2E_CLIENT_PORT) || 5456;
export const baseURL = `http://127.0.0.1:${clientPort}`;

// The suite always works on a throwaway SQLite database, never on data/inventory.sqlite.
// The directory is created once in the main process; the servers and workers inherit it.
process.env.E2E_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-atlas-e2e-'));
export const dataDir = process.env.E2E_DATA_DIR;

// Windows can still hold the database file for a moment after the servers are killed.
export const removeDataDir = () =>
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
