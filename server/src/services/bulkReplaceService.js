import { httpError } from '../httpError.js';
import { requiredText, validateTransferredTo } from '../../../shared/itemValidation.js';
import { REPLACEABLE_CORE_KEYS } from '../repositories/bulkReplaceRepository.js';

// Values match when they are equal apart from surrounding whitespace and letter case, in any script.
export const normalizeValue = value => value.trim().toLowerCase();

// The preview lists at most this many affected items; the count always covers all of them.
export const PREVIEW_ITEM_LIMIT = 100;

/*
  Bulk Replace Value: one exact saved value of one field becomes another value on every item that
  has it. Matching is never partial, and the apply step finds the matches again inside its own
  transaction, so a preview the browser still shows can never widen or stale what gets written.
*/
export class BulkReplaceService {
  constructor({ bulkReplaceRepository }) {
    this.repository = bulkReplaceRepository;
  }

  // The fields that can be selected: the whitelisted core keys and every text custom field.
  fields() {
    return { core: REPLACEABLE_CORE_KEYS, custom: this.repository.listTextFields() };
  }

  /*
    A core field is addressed by its column key, a custom field by its stable id; the same visible
    name in another category is a different field. The result is the repository target plus what
    the preview shows about it.
  */
  resolveField(field) {
    if (field?.type === 'core' && REPLACEABLE_CORE_KEYS.includes(field.key)) return { type: 'core', key: field.key };
    if (field?.type !== 'custom') throw httpError(400, 'BULK_REPLACE_UNSUPPORTED_FIELD');
    const fieldId = Number(field.fieldId);
    const found = Number.isSafeInteger(fieldId) && fieldId > 0 ? this.repository.findField(fieldId) : null;
    if (!found) throw httpError(404, 'FIELD_NOT_FOUND');
    if (found.type !== 'text') throw httpError(400, 'BULK_REPLACE_TEXT_ONLY', { field: found.name });
    return { type: 'custom', fieldId: found.id, name: found.name, category_name: found.category_name };
  }

  // Distinct saved values of one field with how many items use each, most used first.
  values(field, { search, limit } = {}) {
    const target = this.resolveField(field);
    const needle = normalizeValue(String(search || ''));
    const groups = new Map();
    for (const row of this.repository.listValues(target)) {
      const key = normalizeValue(row.value);
      if (!key) continue;
      const group = groups.get(key) || groups.set(key, { value: row.value.trim(), usage_count: 0 }).get(key);
      group.usage_count++;
    }
    return [...groups.entries()]
      .filter(([key]) => key.includes(needle))
      .map(([, group]) => group)
      .sort((a, b) => b.usage_count - a.usage_count || a.value.localeCompare(b.value))
      .slice(0, Math.min(50, Math.max(1, Number.parseInt(limit) || 10)));
  }

  // The request rules shared by preview and apply. The stored replacement is the trimmed input.
  readRequest(body) {
    const field = this.resolveField(body?.field);
    const from = requiredText(body.from, 'BULK_REPLACE_SOURCE_REQUIRED');
    let to = requiredText(body.to, 'BULK_REPLACE_TARGET_REQUIRED');
    if (field.type === 'core' && field.key === 'transferredTo') to = validateTransferredTo(to);
    if (normalizeValue(from) === normalizeValue(to)) throw httpError(400, 'BULK_REPLACE_SAME_VALUE');
    return { field, from, to };
  }

  // The saved values that match `from` exactly, keyed by item id, and how many items already hold `to`.
  match({ field, from, to }) {
    const source = normalizeValue(from);
    const target = normalizeValue(to);
    const matches = new Map();
    let existing = 0;
    for (const row of this.repository.listValues(field)) {
      const value = normalizeValue(row.value);
      if (value === source) matches.set(row.item_id, row.value);
      else if (value === target) existing++;
    }
    return { matches, existing };
  }

  // Nothing is written here.
  preview(body) {
    const request = this.readRequest(body);
    const { matches, existing } = this.match(request);
    const items = matches.size ? this.repository.listItems([...matches.keys()], PREVIEW_ITEM_LIMIT) : [];
    return {
      ...request,
      count: matches.size,
      existingCount: existing,
      items: items.map(item => ({ ...item, value: matches.get(item.id) }))
    };
  }

  // Every current match is replaced, or none is.
  apply(body) {
    const request = this.readRequest(body);
    const updated = this.repository.transaction(() => {
      const { matches } = this.match(request);
      return matches.size ? this.repository.replace(request.field, [...matches.keys()], request.to) : 0;
    });
    return { updated };
  }
}
