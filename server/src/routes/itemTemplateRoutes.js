import { Router } from 'express';

export const createItemTemplateRoutes = ({ itemTemplateService }) => {
  const router = Router();

  router.get('/api/item-templates', (req, res) => res.json(itemTemplateService.list()));
  router.get('/api/item-templates/:id', (req, res) => res.json(itemTemplateService.get(req.params.id)));
  // Using a template only reads a draft; the item itself is created later by the regular item form.
  router.get('/api/item-templates/:id/item-draft', (req, res) => res.json(itemTemplateService.itemDraft(req.params.id)));
  router.post('/api/item-templates', (req, res) => res.status(201).json(itemTemplateService.create(req.body)));
  router.put('/api/item-templates/:id', (req, res) => res.json(itemTemplateService.update(req.params.id, req.body)));
  router.delete('/api/item-templates/:id', (req, res) => {
    itemTemplateService.remove(req.params.id);
    res.status(204).end();
  });

  return router;
};
