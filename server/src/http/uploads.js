import multer from 'multer';
import { httpError } from '../httpError.js';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Photos and AI images are small enough to be handled in memory.
export const createImageUpload = () => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, done) => {
    const valid = imageTypes.has(file.mimetype);
    done(valid ? null : httpError(400, 'UNSUPPORTED_IMAGE_TYPE'), valid);
  }
});

// Database backups carry photo BLOBs, so the upload is streamed to a private staging file on disk
// and never buffered in memory like the photo uploads above.
export const createRestoreUpload = ({ staging, maxUploadBytes }) => multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, staging.stagingDir),
    filename: (_req, _file, done) => done(null, staging.stagedFileName())
  }),
  limits: { fileSize: maxUploadBytes, files: 1 }
}).single('backup');
