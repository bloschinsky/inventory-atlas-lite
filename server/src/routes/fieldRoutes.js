import { Router } from 'express';

export const createFieldRoutes = ({ customFieldService, aiFieldService }) => {
  const router = Router();

  router.get('/api/categories/:id/fields', (req, res) => res.json(customFieldService.listForCategory(req.params.id)));
  router.post('/api/categories/:id/fields', (req, res) => res.status(201).json(customFieldService.create(req.params.id, req.body)));
  router.post('/api/categories/:id/fields/batch', (req, res) => res.status(201).json(customFieldService.createBatch(req.params.id, req.body)));
  /*
    Draft generation only: the response is a field-definition document the user still reviews and
    confirms. Nothing is written here; /fields/batch remains the single create path.
  */
  router.post('/api/categories/:id/fields/ai', async (req, res) => {
    res.json(await aiFieldService.generateForCategory(req.params.id, req.body?.description));
  });
  router.get('/api/fields/:id/suggestions', (req, res) => {
    res.json(customFieldService.suggestions(req.params.id, { search: req.query.search, limit: req.query.limit }));
  });
  router.delete('/api/fields/:id', (req, res) => {
    customFieldService.remove(req.params.id, req.query.confirm === 'true');
    res.status(204).end();
  });

  return router;
};
