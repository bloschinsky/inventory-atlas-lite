import { httpError } from '../httpError.js';
import { nullableText, validateTransferredTo } from '../../../shared/itemValidation.js';
import { historyKey } from './itemHistoryService.js';

export const MAX_TRANSFER_NOTE_LENGTH = 1000;

// A browser clock a little ahead of the server's is not a date in the future.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// A moment always carries its time zone, so the browser's local time is never read as the server's.
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/*
  Temporary loans: an explicit period from Transfer item to Mark as returned. One item has at most
  one open loan; a new one may start only after the previous one ended, so the periods never
  overlap and each return closes exactly the loan it names. The loan keeps Transferred To, the
  item's current informational recipient, in step: the transfer sets it, and the return clears it
  unless it was changed by hand to someone else meanwhile. A loan never changes where the item is
  physically stored. A mistaken loan is closed with Mark as returned and a note; history is not edited.
*/
export class ItemTransferService {
  constructor({ itemRepository, itemHistoryRepository, itemHistoryService }) {
    this.items = itemRepository;
    this.history = itemHistoryRepository;
    this.events = itemHistoryService;
  }

  requireItem(id) {
    const item = this.items.findDetailed(id);
    if (!item) throw httpError(404, 'ITEM_NOT_FOUND');
    return item;
  }

  // An optional date and time, now when omitted; never in the future.
  readMoment(value) {
    const now = Date.parse(this.events.now());
    if (value === null || value === undefined || value === '') return new Date(now).toISOString();
    const time = typeof value === 'string' && MOMENT.test(value) ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(time)) throw httpError(400, 'INVALID_TRANSFER_DATE');
    if (time > now + CLOCK_SKEW_MS) throw httpError(400, 'TRANSFER_DATE_IN_FUTURE');
    return new Date(Math.min(time, now)).toISOString();
  }

  readNote(value) {
    if (value !== null && value !== undefined && typeof value !== 'string') throw httpError(400, 'INVALID_TRANSFER_NOTE');
    const note = nullableText(value);
    if (note && note.length > MAX_TRANSFER_NOTE_LENGTH) throw httpError(400, 'TRANSFER_NOTE_TOO_LONG', { max: MAX_TRANSFER_NOTE_LENGTH });
    return note;
  }

  start(id, body = {}) {
    return this.history.transaction(() => {
      const item = this.requireItem(id);
      const recipient = validateTransferredTo(body.recipient);
      if (!recipient) throw httpError(400, 'TRANSFER_RECIPIENT_REQUIRED');
      const transferredAt = this.readMoment(body.transferred_at);
      let expectedReturnOn = null;
      if (body.expected_return_on !== null && body.expected_return_on !== undefined && body.expected_return_on !== '') {
        expectedReturnOn = typeof body.expected_return_on === 'string' ? body.expected_return_on.trim() : '';
        if (!isIsoDate(expectedReturnOn)) throw httpError(400, 'INVALID_EXPECTED_RETURN_DATE');
        // The due date is a calendar day in the user's time zone, which may be a day behind UTC.
        if (expectedReturnOn < new Date(Date.parse(transferredAt) - DAY_MS).toISOString().slice(0, 10)) throw httpError(400, 'EXPECTED_RETURN_BEFORE_TRANSFER');
      }
      const note = this.readNote(body.note);
      if (this.history.findOpenTransfer(item.id)) throw httpError(409, 'TRANSFER_ALREADY_OPEN');
      const latestReturn = this.history.findLatestReturn(item.id);
      if (latestReturn && transferredAt < latestReturn) throw httpError(400, 'TRANSFER_OVERLAPS_PREVIOUS');

      const transferId = this.history.insertTransfer({ itemId: item.id, recipient, transferredAt, expectedReturnOn, note });
      this.items.setTransferredTo(item.id, recipient);
      this.events.record('transfer', [{
        item_id: item.id, event_type: 'transferred', occurred_at: transferredAt, to_value: recipient, transfer_id: transferId
      }]);
      return this.history.findTransfer(item.id, transferId);
    });
  }

  markReturned(id, transferId, body = {}) {
    return this.history.transaction(() => {
      const item = this.requireItem(id);
      const transfer = /^\d+$/.test(String(transferId)) ? this.history.findTransfer(item.id, Number(transferId)) : null;
      if (!transfer) throw httpError(404, 'TRANSFER_NOT_FOUND');
      if (transfer.returned_at) throw httpError(409, 'TRANSFER_ALREADY_RETURNED');
      const returnedAt = this.readMoment(body.returned_at);
      if (returnedAt < transfer.transferred_at) throw httpError(400, 'RETURN_BEFORE_TRANSFER');
      const note = this.readNote(body.note);

      this.history.closeTransfer(transfer.id, { returnedAt, note });
      if (historyKey(item.transferred_to) === historyKey(transfer.recipient)) this.items.setTransferredTo(item.id, null);
      this.events.record('return', [{
        item_id: item.id, event_type: 'returned', occurred_at: returnedAt, from_value: transfer.recipient, transfer_id: transfer.id
      }]);
      return this.history.findTransfer(item.id, transfer.id);
    });
  }
}
