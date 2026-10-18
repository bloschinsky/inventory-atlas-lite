import { Router } from 'express';

/*
  The UI-safe view of the optional features this installation offers. It exists so the client can
  decide what to show from one request instead of asking each feature's own settings endpoint, and
  it deliberately carries no credentials or provider details. It also carries this deployment's
  instance label, already normalized by instanceLabel.js, or null when none is configured; no other
  environment value is ever exposed.
*/
export const createCapabilityRoutes = ({ aiSettingsService, urlImport = false, instanceLabel = null }) => {
  const router = Router();

  router.get('/api/capabilities', (_req, res) => {
    const settings = aiSettingsService.read();
    // Photo analysis is only offered when the configured model is not known to be text-only. URL import
    // needs the server's network access, so only the real server offers it, never the in-browser demo.
    res.json({ ai: { enabled: settings.enabled, imageInput: settings.imageInput !== 'unsupported' }, urlImport, instanceLabel });
  });

  return router;
};
