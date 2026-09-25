import { httpError } from '../httpError.js';

export class PhotoService {
  constructor({ itemRepository, itemPhotoRepository }) {
    this.items = itemRepository;
    this.photos = itemPhotoRepository;
  }

  addToItem(itemId, files) {
    const item = this.items.findDetailed(itemId);
    if (!item) throw httpError(404, 'ITEM_NOT_FOUND');
    if (!files?.length) throw httpError(400, 'PHOTOS_REQUIRED');
    return this.photos.insertMany(item.id, files);
  }

  // Returns the stored row, including its bytes; the route decides how to send it.
  get(id) {
    const photo = this.photos.findById(id);
    if (!photo) throw httpError(404, 'PHOTO_NOT_FOUND');
    return photo;
  }

  remove(id) {
    if (!this.photos.deleteById(id)) throw httpError(404, 'PHOTO_NOT_FOUND');
  }
}
