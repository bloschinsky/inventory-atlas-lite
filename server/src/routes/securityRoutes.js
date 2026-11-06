import { Router } from 'express';

const meta = req => ({ ip: req.ip });

// Security & Access administration: accounts and API tokens. The gate admits administrators only.
export const createSecurityRoutes = ({ userAdminService, apiTokenService }) => {
  const router = Router();

  router.get('/api/security/users', (_req, res) => res.json(userAdminService.list()));
  router.post('/api/security/users', async (req, res) => res.status(201).json(await userAdminService.create(req.principal, req.body, meta(req))));
  router.patch('/api/security/users/:id', (req, res) => res.json(userAdminService.update(req.principal, req.params.id, req.body, meta(req))));
  router.post('/api/security/users/:id/password', async (req, res) => {
    res.json(await userAdminService.resetPassword(req.principal, req.params.id, req.body, meta(req)));
  });

  router.get('/api/security/tokens', (_req, res) => res.json(apiTokenService.list()));
  // The only answer that ever contains the full token.
  router.post('/api/security/tokens', (req, res) => res.status(201).json(apiTokenService.create(req.principal, req.body, meta(req))));
  router.delete('/api/security/tokens/:id', (req, res) => res.json(apiTokenService.revoke(req.principal, req.params.id, meta(req))));

  return router;
};
