import { Router } from 'express';

export const createAiRoutes = ({ aiSettingsService, aiProviderService, aiItemAnalysisService, imageUpload }) => {
  const router = Router();

  router.get('/api/settings/ai', (_req, res) => res.json(aiSettingsService.publicSettings()));
  router.put('/api/settings/ai', (req, res) => res.json(aiSettingsService.write(req.body)));
  // GET lists the models of the saved provider; POST those of the unsaved Settings form in the body,
  // where `refresh: true` bypasses the cached list.
  router.get('/api/ai/models', async (_req, res) => res.json(await aiProviderService.listModels()));
  router.post('/api/ai/models', async (req, res) => {
    res.json(await aiProviderService.listModels(req.body ?? {}, { refresh: req.body?.refresh === true }));
  });
  router.post('/api/ai/test', async (req, res) => res.json(await aiProviderService.testConnection(req.body ?? {})));
  router.post('/api/ai/items/analyze', imageUpload.single('image'), async (req, res) => {
    // `hint` is the previous field name for the same text and is still accepted.
    res.json(await aiItemAnalysisService.analyze(req.file, req.body.description ?? req.body.hint));
  });

  return router;
};
