import { Router } from 'express';

export const createDatabaseMetadataRoutes = ({ databaseMetadataService }) => {
  const router = Router();

  router.get('/api/database/metadata', (_req, res) => res.json(databaseMetadataService.get()));
  router.put('/api/database/metadata', (req, res) => res.json(databaseMetadataService.rename(req.body)));

  return router;
};
