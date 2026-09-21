import { httpError } from '../httpError.js';
import { requiredText } from './itemValidation.js';

export class CategoryService {
  constructor(categoryRepository) {
    this.categories = categoryRepository;
  }

  requireCategory(id) {
    const category = this.categories.findById(id);
    if (!category) throw httpError('Category not found.', 404);
    return category;
  }

  list() {
    return this.categories.listWithCounts();
  }

  create(input) {
    const name = requiredText(input?.name, 'Category name');
    return this.categories.findById(this.categories.insert(name));
  }

  rename(id, input) {
    this.requireCategory(id);
    this.categories.updateName(id, requiredText(input?.name, 'Category name'));
    return this.categories.findById(id);
  }

  remove(id) {
    const used = this.categories.countItemsUsing(id);
    if (used) throw httpError(`Category is used by ${used} item(s). Move or delete them first.`, 409);
    if (!this.categories.deleteById(id)) throw httpError('Category not found.', 404);
  }
}
