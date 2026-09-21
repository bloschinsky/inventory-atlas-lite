import { Router } from 'express';

export const createDashboardRoutes = ({ dashboardService }) => {
  const router = Router();
  router.get('/api/dashboard', (req, res) => res.json(dashboardService.overview(req.query)));
  return router;
};
