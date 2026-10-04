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

  /*
    Replaces the photo order of one item; the first photo becomes its cover. The list must name every
    current photo of the item exactly once, so a partial order is never guessed and a photo can never
    move to another item. A list made before a photo was added or deleted no longer matches and is
    rejected as stale without changing anything.
  */
  reorder(itemId, photoIds) {
    const item = this.items.findDetailed(itemId);
    if (!item) throw httpError(404, 'ITEM_NOT_FOUND');
    if (!Array.isArray(photoIds) || !photoIds.every(id => Number.isInteger(id) && id > 0)
      || new Set(photoIds).size !== photoIds.length) {
      throw httpError(400, 'PHOTO_ORDER_INVALID');
    }
    const current = new Set(this.photos.listIds(item.id));
    if (photoIds.length !== current.size || !photoIds.every(id => current.has(id))) throw httpError(409, 'PHOTO_ORDER_STALE');
    this.photos.writeOrder(item.id, photoIds);
    return this.photos.listMetadata(item.id);
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
