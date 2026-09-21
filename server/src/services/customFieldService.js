import { httpError } from '../httpError.js';
import { requiredText } from './itemValidation.js';
import { FIELD_TYPES, blockingRows, creatableFields, readFieldDefinitionDocument, reviewFieldDefinitions } from '../../../shared/fieldDefinitions.js';

const allowedTypes = new Set(FIELD_TYPES.map(type => type.value));

export class CustomFieldService {
  constructor(customFieldRepository, categoryService) {
    this.fields = customFieldRepository;
    this.categoryService = categoryService;
  }

  listForCategory(categoryId) {
    this.categoryService.requireCategory(categoryId);
    return this.fields.listByCategory(categoryId);
  }

  create(categoryId, input) {
    this.categoryService.requireCategory(categoryId);
    const name = requiredText(input?.name, 'Field name');
    if (!allowedTypes.has(input?.type)) throw httpError('Invalid field type.');
    return this.fields.insert(categoryId, name, input.type);
  }

  /*
    The review runs again here: the client preview is convenience, not the authority.
  */
  createBatch(categoryId, document) {
    const category = this.categoryService.requireCategory(categoryId);
    let drafts;
    try {
      drafts = readFieldDefinitionDocument(document);
    } catch (error) {
      throw Object.assign(error, { status: 400 });
    }
    const rows = reviewFieldDefinitions(drafts, this.fields.listNamesByCategory(category.id));
    const blocked = blockingRows(rows);
    if (blocked.length) throw httpError(blocked[0].message);
    return this.fields.findByIds(this.fields.insertMany(category.id, creatableFields(rows)));
  }

  suggestions(fieldId, { search, limit }) {
    const field = this.fields.findById(fieldId);
    if (!field) throw httpError('Field not found.', 404);
    if (field.type !== 'text') throw httpError('Suggestions are available for text fields only.');
    return this.fields.listValueSuggestions(
      field.id,
      String(search || '').trim(),
      Math.min(20, Math.max(1, Number.parseInt(limit) || 10))
    );
  }

  remove(fieldId, confirmed) {
    const field = this.fields.findWithValueCount(fieldId);
    if (!field) throw httpError('Field not found.', 404);
    if (field.value_count && !confirmed) {
      throw httpError(`This field has ${field.value_count} saved value(s). Confirm deletion to remove them.`, 409);
    }
    this.fields.deleteById(fieldId);
  }
}
