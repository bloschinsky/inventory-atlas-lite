import { Router } from 'express';

export const createItemRoutes = ({ itemService }) => {
  const router = Router();

  router.get('/api/items', (req, res) => res.json(itemService.list(req.query)));
  // Registered before /api/items/:id so the literal path is not read as an item identifier.
  router.get('/api/items/parent-candidates', (req, res) => res.json(itemService.parentCandidates(req.query)));
  router.get('/api/items/:id', (req, res) => res.json(itemService.get(req.params.id)));
  router.post('/api/items', (req, res) => res.status(201).json(itemService.create(req.body)));
  router.put('/api/items/:id', (req, res) => res.json(itemService.update(req.params.id, req.body)));
  router.delete('/api/items/:id', (req, res) => {
    itemService.remove(req.params.id);
    res.status(204).end();
  });

  return router;
};
