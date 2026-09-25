import { Router } from 'express';
import { BackupService } from '../services/backupService.js';
import { httpError } from '../httpError.js';
import { maxUploadBytes } from '../restore/restoreConfig.js';

export const createBackupRoutes = ({ backupService, maintenance, restoreService, restoreUpload }) => {
  const router = Router();

  // Readiness the Data / Backup page polls while the application finishes swapping the database.
  router.get('/api/restore/status', (_req, res) => res.json(maintenance.status()));

  router.get('/api/backup', async (_req, res, next) => {
    let download;
    try {
      download = await backupService.createDownload();
    } catch (error) { return next(error); }
    res.download(download.file, download.filename, () => BackupService.discard(download.file));
  });

  /*
    Restore is deliberately two staged requests. The upload is streamed to a private file and only
    described back to the user; replacing the active database needs the short-lived single-use token
    from this response plus the explicit confirmation phrase.
  */
  router.post('/api/restore/validate', (req, res, next) => {
    restoreUpload(req, res, error => {
      if (error) {
        restoreService.staging.discardUpload(req.file?.path);
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(httpError(413, 'RESTORE_FILE_TOO_LARGE', { maxMb: Math.round(maxUploadBytes / (1024 * 1024)) }));
        }
        if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(httpError(400, 'RESTORE_SINGLE_FILE'));
        }
        return next(error);
      }
      if (!req.file) return next(httpError(400, 'RESTORE_FILE_REQUIRED'));
      try {
        res.json(restoreService.validateUpload(req.file));
      } catch (validationError) { next(validationError); }
    });
  });

  router.post('/api/restore/apply', async (req, res, next) => {
    try {
      const result = await restoreService.apply(req.body?.restore_token, req.body?.confirmation);
      res.json({ message: 'Backup restored successfully', ...result });
    } catch (error) { next(error); }
  });

  return router;
};
