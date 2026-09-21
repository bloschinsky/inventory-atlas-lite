import { Router } from 'express';

/*
  Starting an update is the one request in this API with a lasting effect on the machine, so it is a
  POST that only the application's own pages may send. The API carries no cookies or credentials, so
  the check is about where the request came from: a cross-site fetch is rejected outright, and a
  cross-site form post, which cannot set a JSON content type, is rejected the same way.
*/
const sameOriginOnly = (req, res, next) => {
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Update requests must come from the application itself.' });
  }
  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.get('host')) {
      return res.status(403).json({ error: 'Update requests must come from the application itself.' });
    }
  }
  next();
};

export const createUpdateRoutes = ({ updateService }) => {
  const router = Router();

  router.get('/api/update/check', async (_req, res, next) => {
    try {
      res.json(await updateService.check());
    } catch (error) { next(error); }
  });

  router.get('/api/update/status', (_req, res, next) => {
    try {
      res.json(updateService.status());
    } catch (error) { next(error); }
  });

  // Takes no body at all: the release, the repository, and the command are all fixed in the backend.
  router.post('/api/update/apply', sameOriginOnly, async (_req, res, next) => {
    try {
      res.status(202).json(await updateService.apply());
    } catch (error) { next(error); }
  });

  return router;
};
