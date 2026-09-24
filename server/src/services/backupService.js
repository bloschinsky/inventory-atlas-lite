import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/*
  Writes a consistent copy of the live database to a temporary file, for a download or a cloud
  upload. Writing it and the swap of a restore or reset must never overlap, which is what the
  maintenance guard around it is for. The caller discards the file when it is done with it.
*/
export class BackupService {
  constructor({ db, maintenance }) {
    this.db = db;
    this.maintenance = maintenance;
  }

  static discard(file) {
    fs.rm(file, { force: true }, () => {});
  }

  async createDownload() {
    return { file: await this.createSnapshot(), filename: `inventory-${new Date().toISOString().slice(0, 10)}.sqlite` };
  }

  async createSnapshot() {
    const file = path.join(os.tmpdir(), `inventory-backup-${randomUUID()}.sqlite`);
    this.maintenance.beginBackupDownload();
    try {
      await this.db.backup(file);
      return file;
    } catch (error) {
      BackupService.discard(file);
      throw error;
    } finally {
      this.maintenance.endBackupDownload();
    }
  }
}
