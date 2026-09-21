import { Router } from 'express';

export const createAiRoutes = ({ aiSettingsService, aiItemAnalysisService, imageUpload }) => {
  const router = Router();

  router.get('/api/settings/ai', (_req, res) => res.json(aiSettingsService.publicSettings()));
  router.put('/api/settings/ai', (req, res) => res.json(aiSettingsService.write(req.body)));
  router.get('/api/ai/models', async (_req, res) => res.json({ models: await aiSettingsService.listAvailableModels() }));
  router.post('/api/ai/items/analyze', imageUpload.single('image'), async (req, res) => {
    res.json(await aiItemAnalysisService.analyze(req.file, req.body.hint));
  });

  return router;
};
