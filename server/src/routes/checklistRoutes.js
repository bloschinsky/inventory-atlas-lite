import { Router } from 'express';

export const createChecklistRoutes = ({ checklistService, checklistRunService }) => {
  const router = Router();

  router.get('/api/checklists', (req, res) => res.json(checklistService.list()));
  router.post('/api/checklists', (req, res) => res.status(201).json(checklistService.create(req.body)));
  router.get('/api/checklists/:id', (req, res) => res.json(checklistService.get(req.params.id)));
  router.put('/api/checklists/:id', (req, res) => res.json(checklistService.update(req.params.id, req.body)));
  router.delete('/api/checklists/:id', (req, res) => {
    checklistService.remove(req.params.id);
    res.status(204).end();
  });

  // A new run is always copied from the checklist on the server; the browser never sends a snapshot.
  router.post('/api/checklists/:id/runs', (req, res) => res.status(201).json(checklistRunService.start(req.params.id)));
  router.get('/api/checklists/:id/runs', (req, res) => res.json(checklistRunService.listForChecklist(req.params.id)));
  // Every run, including those of deleted checklists.
  router.get('/api/checklist-runs', (req, res) => res.json(checklistRunService.list()));
  router.get('/api/checklist-runs/:runId', (req, res) => res.json(checklistRunService.get(req.params.runId)));
  router.patch('/api/checklist-runs/:runId/items/:runItemId', (req, res) => {
    res.json(checklistRunService.updateItem(req.params.runId, req.params.runItemId, req.body));
  });
  router.post('/api/checklist-runs/:runId/complete', (req, res) => res.json(checklistRunService.complete(req.params.runId)));

  return router;
};
