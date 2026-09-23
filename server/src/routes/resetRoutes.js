import { Router } from 'express';

export const createResetRoutes = ({ resetService }) => {
  const router = Router();

  // Both steps accept only a JSON body, never a query string: a plain cross-site form cannot send
  // one without a CORS preflight, which this server never grants.
  const requireJson = (req, res, next) => (req.is('application/json')
    ? next()
    : res.status(415).json({ error: 'Send the reset request as JSON from the Data / Backup page.' }));

  /*
    Resetting the inventory is deliberately two requests. Prepare changes nothing: it reports the
    current counts and issues a short-lived single-use token. Apply needs that token plus the typed
    confirmation phrase, and replaces the database only after a verified safety backup.
  */
  router.post('/api/database/reset/prepare', requireJson, (_req, res, next) => {
    try {
      res.json(resetService.prepare());
    } catch (error) { next(error); }
  });

  router.post('/api/database/reset/apply', requireJson, async (req, res, next) => {
    try {
      const result = await resetService.apply(req.body?.resetToken, req.body?.confirmation);
      res.json({ message: 'Database reset completed.', ...result });
    } catch (error) { next(error); }
  });

  return router;
};
