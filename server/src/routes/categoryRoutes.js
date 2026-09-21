import { Router } from 'express';

export const createCategoryRoutes = ({ categoryService }) => {
  const router = Router();

  router.get('/api/categories', (_req, res) => res.json(categoryService.list()));
  router.post('/api/categories', (req, res) => res.status(201).json(categoryService.create(req.body)));
  router.put('/api/categories/:id', (req, res) => res.json(categoryService.rename(req.params.id, req.body)));
  router.delete('/api/categories/:id', (req, res) => {
    categoryService.remove(req.params.id);
    res.status(204).end();
  });

  return router;
};
