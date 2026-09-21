import { Router } from 'express';

export const createImageRoutes = ({ imageService, imageUpload }) => {
  const router = Router();

  router.post('/api/images/remove-background', imageUpload.single('image'), async (req, res) => {
    const { image, filename } = await imageService.removeImageBackground(req.file);
    res.type('image/jpeg')
      .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .send(image);
  });

  return router;
};
