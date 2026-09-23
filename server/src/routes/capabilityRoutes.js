import { Router } from 'express';

/*
  The UI-safe view of the optional features this installation offers. It exists so the client can
  decide what to show from one request instead of asking each feature's own settings endpoint, and
  it deliberately carries no credentials or provider details.
*/
export const createCapabilityRoutes = ({ aiSettingsService }) => {
  const router = Router();

  router.get('/api/capabilities', (_req, res) => {
    const settings = aiSettingsService.read();
    // Photo analysis is only offered when the configured model is not known to be text-only.
    res.json({ ai: { enabled: settings.enabled, imageInput: settings.imageInput !== 'unsupported' } });
  });

  return router;
};
