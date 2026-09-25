import { httpError } from '../httpError.js';
import { requiredText } from '../../../shared/itemValidation.js';

export class CategoryService {
  constructor(categoryRepository) {
    this.categories = categoryRepository;
  }

  requireCategory(id) {
    const category = this.categories.findById(id);
    if (!category) throw httpError(404, 'CATEGORY_NOT_FOUND');
    return category;
  }

  list() {
    return this.categories.listWithCounts();
  }

  create(input) {
    const name = requiredText(input?.name, 'CATEGORY_NAME_REQUIRED');
    return this.categories.findById(this.categories.insert(name));
  }

  rename(id, input) {
    this.requireCategory(id);
    this.categories.updateName(id, requiredText(input?.name, 'CATEGORY_NAME_REQUIRED'));
    return this.categories.findById(id);
  }

  remove(id) {
    const used = this.categories.countItemsUsing(id);
    if (used) throw httpError(409, 'CATEGORY_IN_USE', { count: used });
    if (!this.categories.deleteById(id)) throw httpError(404, 'CATEGORY_NOT_FOUND');
  }
}
