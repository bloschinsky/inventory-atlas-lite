import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/*
  Writes a consistent copy of the live database to a temporary file for download. A download and
  the swap of a restore or reset must never overlap, which is what the maintenance guard around it is for.
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
    const file = path.join(os.tmpdir(), `inventory-backup-${randomUUID()}.sqlite`);
    this.maintenance.beginBackupDownload();
    try {
      await this.db.backup(file);
      return { file, filename: `inventory-${new Date().toISOString().slice(0, 10)}.sqlite` };
    } catch (error) {
      BackupService.discard(file);
      throw error;
    } finally {
      this.maintenance.endBackupDownload();
    }
  }
}
