import { httpError } from '../httpError.js';
import { nullableText } from '../../../shared/itemValidation.js';
import { AUDIT_SCOPES, MAX_RUN_ITEM_NOTE, RUN_ITEM_STATUSES, countRunItems } from '../../../shared/checklists.js';
import { presentRun, presentRunSummary } from './checklistService.js';

/*
  Checklist runs: one concrete use of a checklist, or a container audit started from an item. Starting
  one copies the expected items as they are now, so later edits and moves never reach it; each item is
  then pending, confirmed, or missing, and every change is written at once. A completed run is
  read-only history, and running again always starts a new run.
*/
export class ChecklistRunService {
  constructor({ checklistRepository, checklistRunRepository, itemRepository }) {
    this.checklists = checklistRepository;
    this.runs = checklistRunRepository;
    this.items = itemRepository;
  }

  requireRun(id) {
    const run = this.runs.findById(id);
    if (!run) throw httpError(404, 'CHECKLIST_RUN_NOT_FOUND');
    return run;
  }

  // Only a run still in progress accepts changes.
  requireOpenRun(id) {
    const run = this.requireRun(id);
    if (run.status === 'completed') throw httpError(409, 'CHECKLIST_RUN_COMPLETED');
    return run;
  }

  // Accepts the numeric id or the public UUID, like every item endpoint.
  requireItem(id) {
    const item = this.items.findDetailed(id);
    if (!item) throw httpError(404, 'ITEM_NOT_FOUND');
    return item;
  }

  // Items deleted from the inventory are not copied: there is nothing left to pack or find.
  start(checklistId) {
    const runId = this.checklists.transaction(() => {
      const checklist = this.checklists.findById(checklistId);
      if (!checklist) throw httpError(404, 'CHECKLIST_NOT_FOUND');
      this.checklists.refreshSnapshots(checklist.id);
      const id = this.runs.insert({ checklistId: checklist.id, name: checklist.name, mode: checklist.mode });
      if (!this.runs.copyEntries(id, checklist.id)) throw httpError(409, 'CHECKLIST_HAS_NO_ITEMS');
      return id;
    });
    return this.get(runId);
  }

  /*
    Audit contents: a verification run of what the container holds right now, read from the
    database rather than from what the browser last saw. It is not a reusable checklist, so repeated
    audits never add entries to the Checklists list; the container's name is kept as a snapshot.
  */
  startAudit(containerId, body) {
    const scope = body?.scope ?? 'direct';
    if (!AUDIT_SCOPES.includes(scope)) throw httpError(400, 'CHECKLIST_AUDIT_SCOPE_INVALID');
    const runId = this.checklists.transaction(() => {
      const container = this.requireItem(containerId);
      const id = this.runs.insertAudit({ container, scope });
      if (!this.runs.copyContainerContents(id, container.id, scope === 'nested')) throw httpError(409, 'CHECKLIST_AUDIT_NO_CONTENTS');
      return id;
    });
    return this.get(runId);
  }

  list() {
    return this.runs.listSummaries().map(presentRunSummary);
  }

  listForChecklist(checklistId) {
    const checklist = this.checklists.findById(checklistId);
    if (!checklist) throw httpError(404, 'CHECKLIST_NOT_FOUND');
    return this.runs.listSummaries({ checklistId: checklist.id }).map(presentRunSummary);
  }

  // The audits of one container, newest first.
  listForContainer(containerId) {
    return this.runs.listSummaries({ containerId: this.requireItem(containerId).id }).map(presentRunSummary);
  }

  get(id) {
    const run = presentRun(this.requireRun(id));
    const items = this.runs.listItems(run.id).map(({ item_name_snapshot: name, ...item }) => ({ ...item, name }));
    return { ...run, counts: countRunItems(items), items };
  }

  readNote(value) {
    if (value === null) return null;
    if (typeof value !== 'string') throw httpError(400, 'CHECKLIST_NOTE_INVALID');
    const note = nullableText(value);
    if (note && note.length > MAX_RUN_ITEM_NOTE) throw httpError(400, 'CHECKLIST_NOTE_TOO_LONG', { max: MAX_RUN_ITEM_NOTE });
    return note;
  }

  // `status` and `note` are each optional, but at least one must be sent.
  changeItem(item, body) {
    const { status, note } = body ?? {};
    if (status === undefined && note === undefined) throw httpError(400, 'INVALID_REQUEST');
    if (status !== undefined && !RUN_ITEM_STATUSES.includes(status)) throw httpError(400, 'CHECKLIST_RUN_STATUS_INVALID');
    const nextNote = note === undefined ? undefined : this.readNote(note);
    if (status !== undefined) this.runs.setItemStatus(item.id, status);
    if (nextNote !== undefined) this.runs.setItemNote(item.id, nextNote);
  }

  updateItem(runId, runItemId, body) {
    this.checklists.transaction(() => {
      const run = this.requireOpenRun(runId);
      const item = this.runs.findItem(run.id, runItemId);
      if (!item) throw httpError(404, 'CHECKLIST_RUN_ITEM_NOT_FOUND');
      this.changeItem(item, body);
    });
    return this.get(runId);
  }

  /*
    The same change addressed by the inventory item (numeric id or UUID) instead of the run item, so
    a caller that only knows which item is in front of it, such as a future scanner, can mark it.
  */
  updateInventoryItem(runId, itemId, body) {
    this.checklists.transaction(() => {
      const run = this.requireOpenRun(runId);
      const item = this.runs.findItemByInventoryItem(run.id, this.requireItem(itemId).id);
      if (!item) throw httpError(404, 'CHECKLIST_RUN_ITEM_NOT_FOUND');
      this.changeItem(item, body);
    });
    return this.get(runId);
  }

  /*
    Pending items may remain; the browser asks for confirmation before it completes such a run.
    Completing a verification run and recording Last verified on its Present items is one transaction,
    so neither can happen without the other. Packing never records a verification.
  */
  complete(runId) {
    this.checklists.transaction(() => {
      const run = this.requireOpenRun(runId);
      this.runs.complete(run.id);
      if (run.mode === 'verification') this.runs.recordVerifiedItems(run.id);
    });
    return this.get(runId);
  }
}
