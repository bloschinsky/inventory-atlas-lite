#!/usr/bin/env node
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../dataDir.js';

/*
  node server/src/cli/backup.js <target file>

  Writes a consistent copy of DATA_DIR/inventory.sqlite with SQLite's online backup API, the same
  primitive as the Data / Backup download, while the server keeps running and writing in WAL mode.
  It is the local path the privileged Proxmox updater takes for its pre-update backup: the HTTP
  download needs an administrator's session, and the updater is given no credential at all. Whoever
  runs this can already read DATA_DIR, so it grants nothing new. The inventory is opened read-only and
  never migrated; the security store is never read. The copy is checked before the command succeeds.
*/
const target = process.argv[2];
if (!target) {
  console.error('Usage: node server/src/cli/backup.js <target file>');
  process.exit(2);
}

const source = path.join(dataDir, 'inventory.sqlite');
const partial = `${target}.partial`;
try {
  if (!fs.existsSync(source)) throw new Error(`No inventory database at ${source}.`);
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(partial);
  } finally {
    db.close();
  }
  const copy = new Database(partial, { readonly: true });
  let check;
  try {
    check = copy.pragma('quick_check', { simple: true });
  } finally {
    copy.close();
  }
  if (check !== 'ok') throw new Error(`The backup copy failed its integrity check (${check}).`);
  fs.renameSync(partial, target);
  console.log(`Backup written to ${target}`);
} catch (error) {
  fs.rmSync(partial, { force: true });
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
}
