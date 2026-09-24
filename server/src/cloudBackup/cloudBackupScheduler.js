/*
  Runs scheduled cloud backups inside the server process, so no browser has to stay open. It only
  keeps time: which run is due, and the persisted state that prevents duplicates, belong to
  CloudBackupService. A failed run is logged and recorded, never thrown, and the next one still runs.
*/
export class CloudBackupScheduler {
  constructor({ cloudBackupService, intervalMs = 30_000 }) {
    this.cloudBackupService = cloudBackupService;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.ticking = false;
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = this.cloudBackupService.claimDueRun();
      if (due) await this.cloudBackupService.run(due.provider, 'scheduled');
    } catch (error) {
      // run() has already recorded its own failure; this only keeps the timer alive.
      console.warn(`[cloud-backup] scheduled run failed: ${error.message}`);
    } finally {
      this.ticking = false;
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.tick(); }, this.intervalMs);
    // The scheduler never keeps the process alive on its own.
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
