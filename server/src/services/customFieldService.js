import { httpError } from '../httpError.js';
import { requiredText } from '../../../shared/itemValidation.js';
import {
  FIELD_TYPES, blockingRows, creatableFields, fieldNameError, readFieldDefinitionDocument, reviewFieldDefinitions, sameFieldName
} from '../../../shared/fieldDefinitions.js';

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

  requireField(fieldId) {
    const field = this.fields.findById(fieldId);
    if (!field) throw httpError(404, 'FIELD_NOT_FOUND');
    return field;
  }

  /*
    Renames the field in place. Its id, type, and category never change, so every item and template
    value linked to it is kept exactly as stored. Only `name` may be sent.
  */
  rename(fieldId, input) {
    const field = this.requireField(fieldId);
    const unsupported = Object.keys(input ?? {}).find(property => property !== 'name');
    if (unsupported) throw httpError(400, 'FIELD_UPDATE_UNSUPPORTED_PROPERTY', { property: unsupported });
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (name === field.name) return field;
    const problem = fieldNameError(name);
    if (problem) throw httpError(400, problem.code, problem.params);
    const taken = () => httpError(409, 'FIELD_ALREADY_EXISTS', { name });
    if (this.fields.listByCategory(field.category_id).some(other => other.id !== field.id && sameFieldName(other.name, name))) throw taken();
    try {
      if (!this.fields.updateName(field.id, name)) throw httpError(404, 'FIELD_NOT_FOUND');
    } catch (error) {
      // The UNIQUE(category_id, name) constraint stays the final authority over a conflicting write.
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') throw taken();
      throw error;
    }
    return this.requireField(field.id);
  }

  suggestions(fieldId, { search, limit }) {
    const field = this.requireField(fieldId);
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
