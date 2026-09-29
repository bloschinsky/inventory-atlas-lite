import { httpError } from '../httpError.js';
import { nullableText } from '../../../shared/itemValidation.js';
import { MAX_RUN_ITEM_NOTE, RUN_ITEM_STATUSES, countRunItems } from '../../../shared/checklists.js';
import { presentRunSummary } from './checklistService.js';

/*
  Checklist runs: one concrete use of a checklist. Starting one copies the checklist as it is now, so
  later edits never reach it; each item is then pending, confirmed, or missing, and every change is
  written at once. A completed run is read-only history, and running again always starts a new run.
*/
export class ChecklistRunService {
  constructor({ checklistRepository, checklistRunRepository }) {
    this.checklists = checklistRepository;
    this.runs = checklistRunRepository;
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

  list() {
    return this.runs.listSummaries().map(presentRunSummary);
  }

  listForChecklist(checklistId) {
    const checklist = this.checklists.findById(checklistId);
    if (!checklist) throw httpError(404, 'CHECKLIST_NOT_FOUND');
    return this.runs.listSummaries({ checklistId: checklist.id }).map(presentRunSummary);
  }

  get(id) {
    const { checklist_name_snapshot: checklistName, ...run } = this.requireRun(id);
    const items = this.runs.listItems(run.id).map(({ item_name_snapshot: name, ...item }) => ({ ...item, name }));
    return { ...run, checklist_name: checklistName, counts: countRunItems(items), items };
  }

  readNote(value) {
    if (value === null) return null;
    if (typeof value !== 'string') throw httpError(400, 'CHECKLIST_NOTE_INVALID');
    const note = nullableText(value);
    if (note && note.length > MAX_RUN_ITEM_NOTE) throw httpError(400, 'CHECKLIST_NOTE_TOO_LONG', { max: MAX_RUN_ITEM_NOTE });
    return note;
  }

  // `status` and `note` are each optional, but at least one must be sent.
  updateItem(runId, runItemId, body) {
    this.checklists.transaction(() => {
      const run = this.requireOpenRun(runId);
      const item = this.runs.findItem(run.id, runItemId);
      if (!item) throw httpError(404, 'CHECKLIST_RUN_ITEM_NOT_FOUND');
      const { status, note } = body ?? {};
      if (status === undefined && note === undefined) throw httpError(400, 'INVALID_REQUEST');
      if (status !== undefined && !RUN_ITEM_STATUSES.includes(status)) throw httpError(400, 'CHECKLIST_RUN_STATUS_INVALID');
      const nextNote = note === undefined ? undefined : this.readNote(note);
      if (status !== undefined) this.runs.setItemStatus(item.id, status);
      if (nextNote !== undefined) this.runs.setItemNote(item.id, nextNote);
    });
    return this.get(runId);
  }

  // Pending items may remain; the browser asks for confirmation before it completes such a run.
  complete(runId) {
    this.checklists.transaction(() => this.runs.complete(this.requireOpenRun(runId).id));
    return this.get(runId);
  }
}
