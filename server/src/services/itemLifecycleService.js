import { httpError } from '../httpError.js';
import { nullableText } from '../../../shared/itemValidation.js';
import { MAX_RETIREMENT_NOTE, MAX_RETIREMENT_RECIPIENT, isRetirementReason } from '../../../shared/itemLifecycle.js';

// A retirement may be dated a little ahead of the server clock without being refused for it.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// Optional text with a length limit; anything that is not a string is refused as a malformed request.
const limitedText = (value, max, tooLongCode) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw httpError(400, 'INVALID_REQUEST');
  const text = nullableText(value);
  if (text && text.length > max) throw httpError(400, tooLongCode, { max });
  return text;
};

/*
  The lifecycle transitions of an item: Retire (it left the inventory) and Restore (it is back).
  Neither ever deletes data, and both change a whole subtree in one transaction, because a container
  and everything stored in it always share one lifecycle status: an active item is never stranded
  inside a retired container, and a retired item never moves with an active one.
*/
export class ItemLifecycleService {
  constructor({ itemRepository, itemService }) {
    this.items = itemRepository;
    this.itemService = itemService;
  }

  // `retired_at` is an ISO 8601 date-time, stored in UTC; it defaults to now and is never in the future.
  readRetiredAt(value, now) {
    if (value === null || value === undefined || value === '') return now.toISOString();
    const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    if (Number.isNaN(time) || time > now.getTime() + CLOCK_SKEW_MS) throw httpError(400, 'ITEM_RETIRED_AT_INVALID');
    return new Date(time).toISOString();
  }

  readRetirement(body) {
    if (body.reason === undefined || body.reason === null || body.reason === '') throw httpError(400, 'ITEM_RETIREMENT_REASON_REQUIRED');
    if (!isRetirementReason(body.reason)) throw httpError(400, 'ITEM_RETIREMENT_REASON_INVALID');
    if (body.include_contents !== undefined && typeof body.include_contents !== 'boolean') throw httpError(400, 'INVALID_REQUEST');
    return {
      reason: body.reason,
      retiredAt: this.readRetiredAt(body.retired_at, new Date()),
      recipient: limitedText(body.recipient, MAX_RETIREMENT_RECIPIENT, 'ITEM_RETIREMENT_RECIPIENT_TOO_LONG'),
      note: limitedText(body.note, MAX_RETIREMENT_NOTE, 'ITEM_RETIREMENT_NOTE_TOO_LONG')
    };
  }

  /*
    `status` is the requested state. The current state is read inside the transaction, so a repeated
    or stale request (retiring a retired item, restoring an active one) is refused instead of applied twice.
  */
  change(id, body) {
    if (!body || typeof body !== 'object') throw httpError(400, 'INVALID_REQUEST');
    if (body.status !== 'retired' && body.status !== 'active') throw httpError(400, 'ITEM_LIFECYCLE_STATUS_INVALID');
    const result = this.items.transaction(() => (body.status === 'retired' ? this.retire(id, body) : this.restore(id, body)));
    return { ...result, item: this.itemService.get(result.item_id) };
  }

  /*
    A container with contents is retired only together with all of them, and only when the request
    says so (`include_contents`); otherwise the caller is told how many items it holds, so the user
    can choose between retiring everything and moving the contents out first.
  */
  retire(id, body) {
    const item = this.itemService.requireItem(id);
    if (item.lifecycle_status === 'retired') throw httpError(409, 'ITEM_ALREADY_RETIRED');
    const retirement = this.readRetirement(body);
    const ids = this.items.listSubtreeIds([item.id]);
    const contents = ids.length - 1;
    if (contents && body.include_contents !== true) throw httpError(409, 'ITEM_RETIRE_HAS_CONTENTS', { count: contents });
    this.items.retire(ids, item.id, retirement);
    return { item_id: item.id, affected_count: ids.length };
  }

  /*
    Restores the item with everything stored in it, keeping their nesting. The item itself leaves a
    retired container it may still be in, and goes where the request says: into the active container
    `parent_item_id`, or nowhere. It is never put back into its former container on its own. `location`,
    when sent, replaces its saved location; otherwise the saved location is kept as it was.
  */
  restore(id, body) {
    const item = this.itemService.requireItem(id);
    if (item.lifecycle_status !== 'retired') throw httpError(409, 'ITEM_NOT_RETIRED');
    let parentId = null;
    if (body.parent_item_id !== undefined && body.parent_item_id !== null && body.parent_item_id !== '') {
      parentId = Number.parseInt(body.parent_item_id);
      const parent = Number.isInteger(parentId) ? this.items.findRef(parentId) : null;
      if (!parent) throw httpError(400, 'PARENT_ITEM_NOT_FOUND');
      if (parent.lifecycle_status !== 'active') throw httpError(400, 'ITEM_PARENT_LIFECYCLE_MISMATCH');
    }
    const location = body.location === undefined ? undefined : limitedText(body.location, Infinity);
    const ids = this.items.listSubtreeIds([item.id]);
    this.items.restore(ids, item.id, { parentId, location });
    return { item_id: item.id, affected_count: ids.length };
  }
}
