import { httpError } from '../httpError.js';
import { requiredText } from '../../../shared/itemValidation.js';
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
    const name = requiredText(input?.name, 'FIELD_NAME_REQUIRED');
    if (!allowedTypes.has(input?.type)) throw httpError(400, 'UNSUPPORTED_FIELD_TYPE', { type: String(input?.type ?? '—') });
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
      throw error.status ? error : httpError(400, 'INVALID_REQUEST');
    }
    const rows = reviewFieldDefinitions(drafts, this.fields.listNamesByCategory(category.id));
    const blocked = blockingRows(rows);
    if (blocked.length) throw httpError(400, blocked[0].error.code, blocked[0].error.params);
    return this.fields.findByIds(this.fields.insertMany(category.id, creatableFields(rows)));
  }

  suggestions(fieldId, { search, limit }) {
    const field = this.fields.findById(fieldId);
    if (!field) throw httpError(404, 'FIELD_NOT_FOUND');
    if (field.type !== 'text') throw httpError(400, 'SUGGESTIONS_TEXT_ONLY');
    return this.fields.listValueSuggestions(
      field.id,
      String(search || '').trim(),
      Math.min(20, Math.max(1, Number.parseInt(limit) || 10))
    );
  }

  remove(fieldId, confirmed) {
    const field = this.fields.findWithValueCount(fieldId);
    if (!field) throw httpError(404, 'FIELD_NOT_FOUND');
    if (field.value_count && !confirmed) {
      throw httpError(409, 'FIELD_HAS_VALUES', { count: field.value_count });
    }
    this.fields.deleteById(fieldId);
  }
}
