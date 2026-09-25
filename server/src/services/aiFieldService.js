import { errorBody } from '../../../shared/appError.js';
import { httpError } from '../httpError.js';
import {
  FIELD_DEFINITION_VERSION, FIELD_TYPES, MAX_BATCH_FIELDS, MAX_FIELD_NAME_LENGTH,
  RESERVED_FIELD_NAMES, readFieldDefinitionDocument
} from '../../../shared/fieldDefinitions.js';

const supportedFieldTypes = FIELD_TYPES.map(type => type.value);

// The same field-definition document the batch editor accepts, expressed as a strict output schema.
const fieldDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'fields'],
  properties: {
    version: { type: 'integer', enum: [FIELD_DEFINITION_VERSION] },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'type', 'required'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: supportedFieldTypes },
          required: { type: 'boolean', enum: [false] }
        }
      }
    }
  }
};

const instructions = `Propose custom inventory fields for one category of a personal inventory application.
Return only a field-definition document: {"version": ${FIELD_DEFINITION_VERSION}, "fields": [{"name": "Brand", "type": "text", "required": false}]}.
Use only these field types: ${supportedFieldTypes.join(', ')}. There is no select, list, or multi-value type, so express such data as a text field.
Field names are short, human-readable English labels of at most ${MAX_FIELD_NAME_LENGTH} characters. Propose at most ${MAX_BATCH_FIELDS} fields.
Never repeat a name listed in existingFields or builtInFields, and never propose the same name twice.
Required fields are not supported, so "required" is always false.
Prefer a small set of practical fields a collector would actually fill in for every item of the category. Avoid redundant, overly specific, or speculative fields.`;

/*
  Draft generation only: the result is a field-definition document the user still reviews and
  confirms. Nothing is written here; the batch create path remains the single writer.
*/
export class AiFieldService {
  constructor({ aiProviderService, categoryService, customFieldRepository }) {
    this.ai = aiProviderService;
    this.categoryService = categoryService;
    this.fields = customFieldRepository;
  }

  async generateForCategory(categoryId, rawDescription) {
    const category = this.categoryService.requireCategory(categoryId);
    const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
    if (!description) throw httpError(400, 'AI_FIELDS_DESCRIPTION_REQUIRED');
    if (description.length > 2000) throw httpError(400, 'DESCRIPTION_TOO_LONG', { max: 2000 });

    const existingFieldNames = this.fields.listNamesByCategory(category.id);
    const { data: document } = await this.ai.generateStructuredData({
      purpose: 'field generation',
      instructions,
      input: JSON.stringify({
        description,
        categoryName: category.name,
        existingFields: existingFieldNames,
        builtInFields: RESERVED_FIELD_NAMES,
        supportedTypes: supportedFieldTypes,
        maxFields: MAX_BATCH_FIELDS
      }),
      schemaName: 'field_definition_document',
      schema: fieldDefinitionSchema,
      task: 'suggest fields'
    });
    if (document && typeof document === 'object' && Array.isArray(document.fields) && !document.fields.length) {
      throw httpError(422, 'AI_NO_FIELDS');
    }
    let drafts;
    try {
      drafts = readFieldDefinitionDocument(document);
    } catch (error) {
      throw httpError(502, 'AI_INVALID_FIELDS', { reason: errorBody(error) });
    }
    return { version: FIELD_DEFINITION_VERSION, fields: drafts };
  }
}
