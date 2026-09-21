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
  constructor({ aiSettingsService, openAiClient, categoryService, customFieldRepository }) {
    this.settingsService = aiSettingsService;
    this.openAiClient = openAiClient;
    this.categoryService = categoryService;
    this.fields = customFieldRepository;
  }

  async generateForCategory(categoryId, rawDescription) {
    const category = this.categoryService.requireCategory(categoryId);
    const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
    if (!description) throw httpError('Describe the fields you need.');
    if (description.length > 2000) throw httpError('The description must be 2,000 characters or fewer.');

    const settings = this.settingsService.requireUsableSettings('Add an OpenAI API key in Settings before generating fields.');
    const existingFieldNames = this.fields.listNamesByCategory(category.id);
    const started = Date.now();
    let result;
    try {
      result = await this.openAiClient.createStructuredResponse({
        apiKey: settings.apiKey,
        body: this.requestBody({ settings, description, category, existingFieldNames }),
        failureMessage: 'OpenAI could not suggest fields. Try again later.'
      });
    } catch (error) {
      console.info('AI field generation', { provider: settings.provider, model: settings.model, durationMs: Date.now() - started, success: false });
      throw error;
    }
    const document = result.parsed;
    if (document && typeof document === 'object' && Array.isArray(document.fields) && !document.fields.length) {
      throw httpError('The AI did not suggest any fields. Describe the category in more detail and try again.', 422);
    }
    let drafts;
    try {
      drafts = readFieldDefinitionDocument(document);
    } catch (error) {
      throw httpError(`OpenAI returned fields that do not match the supported format. ${error.message}`, 502);
    }
    console.info('AI field generation', { provider: settings.provider, model: settings.model, durationMs: Date.now() - started, success: true, fields: drafts.length, usage: result.usage });
    return { version: FIELD_DEFINITION_VERSION, fields: drafts };
  }

  requestBody({ settings, description, category, existingFieldNames }) {
    return {
      model: settings.model,
      store: false,
      instructions,
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: JSON.stringify({
            description,
            categoryName: category.name,
            existingFields: existingFieldNames,
            builtInFields: RESERVED_FIELD_NAMES,
            supportedTypes: supportedFieldTypes,
            maxFields: MAX_BATCH_FIELDS
          })
        }]
      }],
      text: { format: { type: 'json_schema', name: 'field_definition_document', strict: true, schema: fieldDefinitionSchema } }
    };
  }
}
