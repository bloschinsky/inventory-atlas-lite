import { Router } from 'express';

export const createDatabaseMetadataRoutes = ({ databaseMetadataService }) => {
  const router = Router();

  router.get('/api/database/metadata', (_req, res) => res.json(databaseMetadataService.get()));
  router.put('/api/database/metadata', (req, res) => res.json(databaseMetadataService.rename(req.body)));
  // { contentLanguage: <tag> | null }; null clears the preference.
  router.put('/api/database/metadata/content-language', (req, res) => res.json(databaseMetadataService.setContentLanguage(req.body)));

  return router;
};
