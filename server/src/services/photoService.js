import { httpError } from '../httpError.js';

export class PhotoService {
  constructor({ itemRepository, itemPhotoRepository }) {
    this.items = itemRepository;
    this.photos = itemPhotoRepository;
  }

  addToItem(itemId, files) {
    const item = this.items.findDetailed(itemId);
    if (!item) throw httpError('Item not found.', 404);
    if (!files?.length) throw httpError('Choose at least one image.');
    return this.photos.insertMany(item.id, files);
  }

  // Returns the stored row, including its bytes; the route decides how to send it.
  get(id) {
    const photo = this.photos.findById(id);
    if (!photo) throw httpError('Photo not found.', 404);
    return photo;
  }

  remove(id) {
    if (!this.photos.deleteById(id)) throw httpError('Photo not found.', 404);
  }
}
