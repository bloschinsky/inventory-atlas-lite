import { Router } from 'express';

export const createPhotoRoutes = ({ photoService, imageUpload }) => {
  const router = Router();

  router.post('/api/items/:id/photos', imageUpload.array('photos', 10), (req, res) => {
    res.status(201).json(photoService.addToItem(req.params.id, req.files));
  });
  router.get('/api/photos/:id', (req, res) => {
    const photo = photoService.get(req.params.id);
    res.type(photo.mime_type)
      .set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(photo.filename)}`)
      .send(photo.data);
  });
  router.delete('/api/photos/:id', (req, res) => {
    photoService.remove(req.params.id);
    res.status(204).end();
  });

  return router;
};
