import { Router } from 'express';

export const createSystemRoutes = ({ restoreService, db, appVersion }) => {
  const router = Router();

  router.get('/api/health', (_req, res) => {
    // Deployment scripts poll this endpoint, so it stays cheap and free of diagnostic details.
    // During a restore the database is deliberately closed for a moment; the process itself is fine.
    if (restoreService.isMaintenance()) return res.json({ status: 'ok', database: 'maintenance', version: appVersion, ...restoreService.status() });
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', database: 'ok', version: appVersion, ...restoreService.status() });
    } catch {
      res.status(503).json({ status: 'error', database: 'error', version: appVersion, ...restoreService.status() });
    }
  });

  return router;
};
