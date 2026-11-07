import { ToolError } from './errors.js';

/*
  Pure mapping from Atlas REST responses to the adapter's own, versioned result shapes. Field names
  here are the tool contract (snake_case, stable); Atlas's response shapes can change without
  changing what MCP clients see.

  Every text value is user-entered inventory data and therefore untrusted: control characters and
  bidirectional overrides are removed (they can hide or reorder text in a client's display), and each
  value is cut to a fixed length so one record can never flood the model's context. The text stays
  data; nothing here interprets it.
*/

// Bump when a result shape changes incompatibly.
export const RESULT_VERSION = 1;

export const LIMITS = Object.freeze({
  name: 200,
  shortText: 300,
  longText: 2000,
  children: 50,
  customFields: 100,
  categories: 200,
  fields: 200,
  historyEvents: 50,
  locationChain: 20,
  distribution: 20
});

/*
  The largest serialized result a tool returns. Claude's hosted apps accept tool results of about
  150,000 characters, and a result travels twice (as structured content and as the same JSON in a text
  block), so one result stays well below half of that whatever the inventory holds.
*/
export const MAX_RESULT_CHARS = 50000;
// The shortest a text value is cut to when a result has to shrink; ids and UUIDs are never longer.
const MIN_TEXT_CHARS = 64;

const shortenStrings = (value, max) => {
  if (typeof value === 'string') {
    const points = [...value];
    return points.length > max ? `${points.slice(0, max - 1).join('')}…` : value;
  }
  if (Array.isArray(value)) return value.map(entry => shortenStrings(entry, max));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shortenStrings(entry, max)]));
  return value;
};

/*
  Keeps a result within MAX_RESULT_CHARS without dropping a record or a field: while it is too large,
  every text value is cut to a shorter length (halved each time, never below MIN_TEXT_CHARS) and the
  result says so with `text_shortened: true`. A shortened value ends with "…", so it can never be
  mistaken for a missing one. The limits per value and per list already keep ordinary results small;
  this only changes items with very long texts in many fields, or pages full of them. Should even the
  shortest texts not fit (a shape no tool produces today), the call fails as `response_too_large`
  rather than return more than the budget.
*/
export function fitResult(result) {
  if (JSON.stringify(result).length <= MAX_RESULT_CHARS) return result;
  for (let max = LIMITS.longText / 2; max >= MIN_TEXT_CHARS; max = Math.floor(max / 2)) {
    const shortened = { ...shortenStrings(result, max), text_shortened: true };
    if (JSON.stringify(shortened).length <= MAX_RESULT_CHARS) return shortened;
  }
  throw new ToolError('response_too_large', { detail: 'The answer stays larger than the adapter returns even with every text shortened.' });
}

// C0/C1 controls except tab and newline, and the Unicode bidirectional embedding/override/isolate marks.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function cleanText(value, max = LIMITS.shortText) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(UNSAFE_CHARACTERS, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return null;
  // Cut by code points, so a surrogate pair (an emoji, a rare CJK character) is never split.
  const points = [...text];
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : text;
}

const id = value => (Number.isSafeInteger(value) ? value : null);
const uuid = value => (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value.toLowerCase() : null);
const isoDate = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 32) : null);
const ref = (refId, refUuid, name) => (refId === null && refUuid === null && !name ? null
  : { id: id(refId), uuid: uuid(refUuid), name: cleanText(name, LIMITS.name) });

/*
  A custom field value in its typed form: booleans as true/false, numbers as numbers, colors as their
  preset key and HEX code. A value that does not parse stays as cleaned text rather than being guessed.
*/
export function customFieldValue(type, value) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'boolean') return value === '1' ? true : value === '0' ? false : cleanText(value);
  if (type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : cleanText(value);
  }
  if (type === 'color') {
    try {
      const color = JSON.parse(value);
      if (typeof color?.key === 'string' && /^#[0-9a-f]{6}$/i.test(color.hex)) return { key: cleanText(color.key, 40), hex: color.hex.toLowerCase() };
    } catch {
      // Falls through to the text form.
    }
  }
  if (type === 'date') return isoDate(value) ?? cleanText(value, 40);
  return cleanText(value, LIMITS.longText);
}

const category = item => (item.category_id === null && !item.category_name ? null
  : { id: id(item.category_id), name: cleanText(item.category_name, LIMITS.name) });

/*
  Where an item is, from Atlas's own derived values: `location` and `location_detail` are what was
  saved on the item, while the effective ones come from the outermost container that holds it (or
  the item itself), as Atlas shows them. Neither is a geographic coordinate.
*/
const placement = item => ({
  stored_location: cleanText(item.location),
  stored_location_detail: cleanText(item.location_detail),
  effective_location: cleanText(item.effective_location),
  effective_location_detail: cleanText(item.effective_location_detail),
  inherited_from: item.effective_location_source
    ? ref(item.effective_location_source.id, item.effective_location_source.uuid, item.effective_location_source.name) : null
});

// One row of search_items: enough to recognize and pick an item, never its full record.
export function compactItem(item) {
  return {
    id: id(item.id),
    uuid: uuid(item.uuid),
    name: cleanText(item.name, LIMITS.name),
    category: category(item),
    lifecycle_status: item.lifecycle_status === 'retired' ? 'retired' : 'active',
    condition_grade: cleanText(item.condition_grade, 20),
    is_new: item.is_new === true,
    effective_location: cleanText(item.effective_location),
    effective_location_detail: cleanText(item.effective_location_detail),
    container: item.parent_id ? ref(item.parent_id, null, item.parent_name) : null,
    transferred_to: cleanText(item.transferred_to, LIMITS.name),
    has_photo: Boolean(item.thumbnail_id),
    updated_at: isoDate(item.updated_at)
  };
}

export function searchResult(response, request) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const pagination = response?.pagination ?? {};
  const page = Number(pagination.page) || request.page;
  const pages = Number(pagination.pages) || 1;
  return {
    version: RESULT_VERSION,
    items: items.map(compactItem),
    page,
    page_size: Number(pagination.pageSize) || request.page_size,
    total: Number(pagination.total) || 0,
    pages,
    has_more: page < pages
  };
}

const transfer = value => (value ? {
  recipient: cleanText(value.recipient, LIMITS.name),
  transferred_at: isoDate(value.transferred_at),
  expected_return_on: isoDate(value.expected_return_on),
  returned_at: isoDate(value.returned_at),
  note: cleanText(value.note)
} : null);

const retirement = value => (value ? {
  reason: cleanText(value.reason, 40),
  retired_at: isoDate(value.retired_at),
  recipient: cleanText(value.recipient, LIMITS.name),
  note: cleanText(value.note),
  last_location: cleanText(value.last_location),
  last_location_detail: cleanText(value.last_location_detail),
  former_container: value.former_parent ? ref(null, value.former_parent.uuid, value.former_parent.name) : null
} : null);

export function itemDetails(item) {
  const fields = Array.isArray(item.fields) ? item.fields : [];
  const children = Array.isArray(item.children) ? item.children : [];
  return {
    version: RESULT_VERSION,
    id: id(item.id),
    uuid: uuid(item.uuid),
    name: cleanText(item.name, LIMITS.name),
    description: cleanText(item.description, LIMITS.longText),
    category: category(item),
    lifecycle_status: item.lifecycle_status === 'retired' ? 'retired' : 'active',
    is_new: item.is_new === true,
    condition_grade: cleanText(item.condition_grade, 20),
    condition_notes: cleanText(item.condition_notes),
    ...placement(item),
    container: item.parent ? ref(item.parent.id, item.parent.uuid, item.parent.name) : null,
    contents: children.slice(0, LIMITS.children).map(child => ref(child.id, child.uuid, child.name)),
    contents_count: children.length,
    contents_truncated: children.length > LIMITS.children,
    descendant_count: Number(item.descendant_count) || 0,
    custom_fields: fields.slice(0, LIMITS.customFields).map(field => ({
      id: id(field.id), name: cleanText(field.name, LIMITS.name), type: cleanText(field.type, 20), value: customFieldValue(field.type, field.value)
    })),
    custom_fields_truncated: fields.length > LIMITS.customFields,
    purchase_date: isoDate(item.purchase_date),
    purchase_price: item.purchase_price ? { amount: Number(item.purchase_price.amount), currency: cleanText(item.purchase_price.currency, 8) } : null,
    serial_number: cleanText(item.serial_number, LIMITS.name),
    transferred_to: cleanText(item.transferred_to, LIMITS.name),
    open_loan: transfer(item.open_transfer),
    retirement: retirement(item.retirement),
    photo_count: Array.isArray(item.photos) ? item.photos.length : 0,
    source_url: cleanText(item.source_url, 2048),
    last_verified_at: isoDate(item.last_verified_at),
    created_at: isoDate(item.created_at),
    updated_at: isoDate(item.updated_at)
  };
}

export function categoryList(categories) {
  const rows = Array.isArray(categories) ? categories : [];
  return {
    version: RESULT_VERSION,
    categories: rows.slice(0, LIMITS.categories).map(row => ({
      id: id(row.id), name: cleanText(row.name, LIMITS.name), item_count: Number(row.item_count) || 0, field_count: Number(row.field_count) || 0
    })),
    total: rows.length,
    truncated: rows.length > LIMITS.categories
  };
}

export function categoryWithFields(row, fields) {
  const list = Array.isArray(fields) ? fields : [];
  return {
    version: RESULT_VERSION,
    category: { id: id(row.id), name: cleanText(row.name, LIMITS.name), item_count: Number(row.item_count) || 0 },
    fields: list.slice(0, LIMITS.fields).map(field => ({ id: id(field.id), name: cleanText(field.name, LIMITS.name), type: cleanText(field.type, 20) })),
    fields_truncated: list.length > LIMITS.fields
  };
}

const eventRef = value => (value ? { id: id(value.id), name: cleanText(value.name, LIMITS.name), still_exists: value.exists === true } : null);

export function historyResult(response) {
  const events = Array.isArray(response?.events) ? response.events : [];
  return {
    version: RESULT_VERSION,
    events: events.slice(0, LIMITS.historyEvents).map(event => ({
      id: id(event.id),
      type: cleanText(event.type, 40),
      occurred_at: isoDate(event.occurred_at),
      operation_type: cleanText(event.operation_type, 40),
      from: cleanText(event.from),
      to: cleanText(event.to),
      from_detail: cleanText(event.from_detail),
      to_detail: cleanText(event.to_detail),
      from_container: eventRef(event.from_item),
      to_container: eventRef(event.to_item),
      via_container: eventRef(event.via_item),
      loan: transfer(event.transfer)
    })),
    // Atlas's own cursor: the id of the last event of this page, passed back for the next one.
    next_cursor: Number.isSafeInteger(response?.next_cursor) ? String(response.next_cursor) : null
  };
}

const distribution = (rows, map) => (Array.isArray(rows) ? rows.slice(0, LIMITS.distribution).map(map) : []);

// The Dashboard's figures, as Atlas computes them; nothing is aggregated again here.
export function inventorySummary(dashboard) {
  const d = dashboard ?? {};
  return {
    version: RESULT_VERSION,
    scope: { category_id: id(d.scope?.categoryId), category_name: cleanText(d.scope?.categoryName, LIMITS.name) },
    active_items: Number(d.totalItems) || 0,
    retired_items: Number(d.retiredItems) || 0,
    added_last_30_days: Number(d.addedLast30Days) || 0,
    photo_coverage: {
      with_photos: Number(d.photoCoverage?.withPhotos) || 0,
      without_photos: Number(d.photoCoverage?.withoutPhotos) || 0,
      percentage: Number(d.photoCoverage?.percentage) || 0
    },
    placement: {
      inside_container: Number(d.placement?.insideContainer) || 0,
      direct_location: Number(d.placement?.directLocation) || 0,
      unplaced: Number(d.placement?.unplaced) || 0
    },
    by_category: distribution(d.categoryDistribution, row => ({
      category_id: id(row.categoryId), name: row.categoryId === null ? 'Other' : cleanText(row.label, LIMITS.name), count: Number(row.count) || 0
    })),
    by_condition: distribution(d.conditionDistribution, row => ({ grade: cleanText(row.key, 20), count: Number(row.count) || 0 })),
    by_location: distribution(d.locationDistribution, row => ({
      location: row.key === '__other__' ? 'Other' : row.key === '__unknown__' ? 'Unknown' : cleanText(row.label), count: Number(row.count) || 0
    })),
    field_coverage: distribution(d.fieldCoverage, row => ({ field: cleanText(row.key, 40), count: Number(row.count) || 0, percentage: Number(row.percentage) || 0 })),
    // Only the days on which items were added; the Dashboard's empty days are left out.
    added_by_day: (Array.isArray(d.recentActivity) ? d.recentActivity : []).filter(day => day.count > 0)
      .map(day => ({ date: isoDate(day.date), count: Number(day.count) || 0 }))
  };
}

/*
  The current physical placement of an item, derived only from what Atlas stores. `chain` is the
  container path from the item's own container outwards. `status` is `unknown` when Atlas has neither
  a location text nor a container for it; nothing is guessed. Atlas stores no geographic coordinates.
*/
export function itemLocation(item, chain, chainTruncated) {
  const place = placement(item);
  const retired = item.lifecycle_status === 'retired';
  const inherited = Boolean(place.inherited_from);
  const known = Boolean(place.effective_location || place.effective_location_detail || chain.length);
  return {
    version: RESULT_VERSION,
    item: ref(item.id, item.uuid, item.name),
    lifecycle_status: retired ? 'retired' : 'active',
    status: known ? 'known' : 'unknown',
    location: place.effective_location,
    location_detail: place.effective_location_detail,
    location_source: place.effective_location || place.effective_location_detail ? (inherited ? 'outermost_container' : 'item') : 'none',
    inherited_from: place.inherited_from,
    stored_location: place.stored_location,
    stored_location_detail: place.stored_location_detail,
    container_chain: chain.map(node => ref(node.id, node.uuid, node.name)),
    container_chain_truncated: chainTruncated,
    on_loan: item.open_transfer ? transfer(item.open_transfer) : null,
    retirement_snapshot: retired && item.retirement ? {
      last_location: cleanText(item.retirement.last_location),
      last_location_detail: cleanText(item.retirement.last_location_detail),
      former_container: item.retirement.former_parent ? ref(null, item.retirement.former_parent.uuid, item.retirement.former_parent.name) : null
    } : null,
    geocoordinates: null,
    note: 'Locations in Atlas are free text entered by people, not geographic coordinates.'
  };
}
