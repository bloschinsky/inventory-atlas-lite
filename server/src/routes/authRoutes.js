import { Router } from 'express';
import { permissionsOfRole } from '../../../shared/permissions.js';
import { clearSessionCookie, setSessionCookie } from '../http/authGate.js';
import { httpError } from '../httpError.js';

const meta = req => ({ ip: req.ip, userAgent: req.get('user-agent') });

// Signing in only accepts JSON, which a plain cross-site form cannot send.
const requireJson = (req, _res, next) => (req.is('application/json') ? next() : next(httpError(415, 'AUTH_JSON_REQUIRED')));

const signedIn = ({ user, csrfToken }) => ({ authenticated: true, user, permissions: permissionsOfRole(user.role), csrfToken });

export const createAuthRoutes = ({ authService }) => {
  const router = Router();

  // Where the browser stands: setup pending, signed out, or signed in with its anti-CSRF token.
  router.get('/api/auth/session', (req, res) => {
    const principal = req.principal;
    if (principal?.type !== 'session') return res.json({ authenticated: false, setupRequired: authService.setupRequired() });
    res.json({
      authenticated: true,
      setupRequired: false,
      user: { id: principal.userId, username: principal.username, role: principal.role },
      permissions: principal.permissions,
      csrfToken: principal.csrfToken
    });
  });

  const startSession = async (req, res, work) => {
    const session = await work();
    setSessionCookie(req, res, session);
    res.json(signedIn(session));
  };

  router.post('/api/auth/login', requireJson, (req, res) => startSession(req, res,
    () => authService.login(req.body ?? {}, { ...meta(req), replacing: req.principal?.sessionId ?? null })));
  router.post('/api/auth/setup', requireJson, (req, res) => startSession(req, res, () => authService.setup(req.body ?? {}, meta(req))));
  router.post('/api/auth/recover', requireJson, (req, res) => startSession(req, res, () => authService.recover(req.body ?? {}, meta(req))));

  router.post('/api/auth/logout', (req, res) => {
    authService.logout(req.principal, meta(req));
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  router.post('/api/auth/reauthenticate', async (req, res) => res.json(await authService.reauthenticate(req.principal, req.body ?? {}, meta(req))));
  router.post('/api/auth/password', (req, res) => startSession(req, res, () => authService.changePassword(req.principal, req.body ?? {}, meta(req))));

  /*
    The calling token's own description: its id, scopes, and effective permissions (the scopes limited
    by its owner's role), never its secret. A service such as the MCP adapter reads it at startup and
    refuses to run with more access than it needs, without probing with a write.
  */
  router.get('/api/auth/token', (req, res) => {
    const { tokenId, scopes, permissions, expiresAt } = req.principal;
    res.json({ id: tokenId, scopes, permissions, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
  });

  router.get('/api/auth/sessions',(req, res) => res.json(authService.listSessions(req.principal)));
  router.post('/api/auth/sessions/revoke-others', (req, res) => res.json(authService.revokeOtherSessions(req.principal, meta(req))));
  router.delete('/api/auth/sessions/:id', (req, res) => {
    const { current } = authService.revokeSession(req.principal, req.params.id, meta(req));
    if (current) clearSessionCookie(req, res);
    res.status(204).end();
  });

  return router;
};
