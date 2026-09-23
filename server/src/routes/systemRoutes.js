import { Router } from 'express';

export const createSystemRoutes = ({ maintenance, db, appVersion }) => {
  const router = Router();

  router.get('/api/health', (_req, res) => {
    // Deployment scripts poll this endpoint, so it stays cheap and free of diagnostic details.
    // During a restore or reset the database is deliberately closed for a moment; the process itself is fine.
    if (maintenance.isMaintenance()) return res.json({ status: 'ok', database: 'maintenance', version: appVersion, ...maintenance.status() });
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', database: 'ok', version: appVersion, ...maintenance.status() });
    } catch {
      res.status(503).json({ status: 'error', database: 'error', version: appVersion, ...maintenance.status() });
    }
  });

  return router;
};
