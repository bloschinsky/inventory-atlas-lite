import path from 'node:path';
import { httpError } from '../httpError.js';
import { detectImageMime } from '../imageMime.js';

/*
  Wraps the local segmentation adapter: the upload is verified here, and the caller receives the
  finished JPEG together with the name it should be offered under.
*/
export class ImageService {
  constructor({ removeBackground }) {
    this.removeBackground = removeBackground;
  }

  async removeImageBackground(upload) {
    if (!upload) throw httpError('Choose an image to process.');
    const mimeType = detectImageMime(upload.buffer);
    if (!mimeType || mimeType !== upload.mimetype) {
      throw httpError('The uploaded file is not a valid JPEG, PNG, WebP, or GIF image.');
    }
    const image = await this.removeBackground(upload.buffer);
    const baseName = path.parse(upload.originalname).name.slice(0, 180) || 'item';
    return { image, filename: `${baseName}-background-removed.jpg` };
  }
}
