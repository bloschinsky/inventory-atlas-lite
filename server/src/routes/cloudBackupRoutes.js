import { Router } from 'express';

const STATE_COOKIE = 'ial_cloud_oauth_state';
const COOKIE_PATH = '/api/cloud-backup/oauth';

const readCookie = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
};

/*
  The address the browser used, which the OAuth callback must come back to. Browsers send it as the
  Origin header of a POST, which stays correct behind the development proxy and a reverse proxy.
*/
const origin = req => {
  const header = req.get('origin');
  try { if (header && new URL(header).origin === header) return header; } catch { /* not a usable origin */ }
  return `${req.protocol}://${req.get('host')}`;
};

export const createCloudBackupRoutes = ({ cloudBackupService, cloudConnectionService }) => {
  const router = Router();

  router.get('/api/cloud-backup', (_req, res) => res.json(cloudBackupService.overview()));

  router.put('/api/cloud-backup/settings', (req, res) => {
    cloudBackupService.updateSettings(req.body);
    res.json(cloudBackupService.overview());
  });

  // Answers with the provider's authorization URL; the browser navigates there itself.
  router.post('/api/cloud-backup/providers/:provider/connect', (req, res) => {
    const { state, authorizationUrl } = cloudConnectionService.begin(req.params.provider, origin(req));
    res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: COOKIE_PATH, maxAge: 10 * 60 * 1000 });
    res.json({ authorizationUrl });
  });

  /*
    The provider sends the browser back here. Only the outcome travels on to Settings, never a
    message from the URL: an error text is kept on the server and shown from the status instead.
  */
  router.get('/api/cloud-backup/oauth/callback', async (req, res) => {
    res.clearCookie(STATE_COOKIE, { path: COOKIE_PATH });
    try {
      const result = await cloudConnectionService.complete({
        state: req.query.state, cookieState: readCookie(req, STATE_COOKIE), code: req.query.code, error: req.query.error
      });
      res.redirect(303, `/settings?cloud=connected&provider=${encodeURIComponent(result.provider)}`);
    } catch {
      res.redirect(303, '/settings?cloud=error');
    }
  });

  router.post('/api/cloud-backup/providers/:provider/test', async (req, res) => {
    res.json(await cloudConnectionService.test(req.params.provider));
  });

  router.post('/api/cloud-backup/providers/:provider/backup', async (req, res) => {
    res.json(await cloudBackupService.run(req.params.provider, 'manual'));
  });

  router.delete('/api/cloud-backup/providers/:provider', async (req, res) => {
    res.json(await cloudBackupService.disconnect(req.params.provider));
  });

  return router;
};
