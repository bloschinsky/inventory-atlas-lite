import { Router } from 'express';

// Smart URL import. The preview never writes; the reviewed values are saved through the item API.
export const createUrlImportRoutes = ({ urlImportService }) => {
  const router = Router();

  router.post('/api/items/import-url/preview', async (req, res) => res.json(await urlImportService.preview(req.body)));
  // An image candidate of one preview, by its position; the remote address itself never comes from the browser.
  router.get('/api/items/import-url/:token/images/:index', async (req, res) => {
    const image = await urlImportService.image(req.params.token, req.params.index);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="${image.filename}"` });
    res.type(image.mime).send(image.data);
  });

  return router;
};
