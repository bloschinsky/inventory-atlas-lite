import { httpError } from '../httpError.js';
import { nullableText, requiredText } from '../../../shared/itemValidation.js';
import { CHECKLIST_MODES } from '../../../shared/checklists.js';
import { presentLocation } from './itemService.js';

/*
  The snapshot identity of a run. A container audit also names its container: the link is live and
  becomes null when the container is deleted, while the name stays the one it had when the audit began.
*/
export const presentRun = ({
  checklist_name_snapshot: checklistName, source_container_item_id: containerId, source_container_name_snapshot: containerName, ...run
}) => ({ ...run, checklist_name: checklistName, container_id: containerId, container_name: containerName });

// The list and history rows of a run: its snapshot identity and the counts of its item states.
export const presentRunSummary = ({ total, confirmed, missing, pending, ...run }) => ({
  ...presentRun(run),
  counts: { total, confirmed, missing, pending, checked: confirmed + missing }
});

// A linked entry shows the item as it is now; a deleted one only its last known name.
const presentEntry = entry => ({
  id: entry.id,
  item_id: entry.item_id,
  item_uuid: entry.item_uuid ?? null,
  name: entry.item_name ?? entry.item_name_snapshot,
  deleted: entry.item_id === null,
  category_name: entry.category_name ?? null,
  effective_location: entry.item_id === null ? null : presentLocation(entry.root_id ? entry.root_location : entry.location),
  thumbnail_id: entry.thumbnail_id ?? null
});

const isId = value => Number.isInteger(value) && value > 0;

/*
  Reusable checklists: a name, a mode, and an ordered list of references to existing items. A
  checklist holds no check state; every use of it is a separate run (see ChecklistRunService).
*/
export class ChecklistService {
  constructor({ checklistRepository, checklistRunRepository, itemRepository }) {
    this.checklists = checklistRepository;
    this.runs = checklistRunRepository;
    this.items = itemRepository;
  }

  requireChecklist(id) {
    const checklist = this.checklists.findById(id);
    if (!checklist) throw httpError(404, 'CHECKLIST_NOT_FOUND');
    return checklist;
  }

  list() {
    const latest = new Map(this.runs.listLatestSummaries().map(run => [run.checklist_id, presentRunSummary(run)]));
    return this.checklists.list().map(checklist => ({ ...checklist, last_run: latest.get(checklist.id) ?? null }));
  }

  get(id) {
    const checklist = this.requireChecklist(id);
    return { ...checklist, items: this.checklists.listEntries(checklist.id).map(presentEntry) };
  }

  readAttributes(body) {
    const mode = body?.mode;
    if (!CHECKLIST_MODES.includes(mode)) throw httpError(400, 'CHECKLIST_MODE_INVALID');
    return { name: requiredText(body.name, 'CHECKLIST_NAME_REQUIRED'), description: nullableText(body.description), mode };
  }

  /*
    `items` is the whole ordered membership. Each entry is either { id } for an entry the checklist
    already has (the only way to keep a deleted item's entry) or { item_id } for a new reference to
    an existing item. An item may be referenced only once, so a duplicate is refused, never merged.
  */
  readEntries(raw, checklistId = null) {
    const list = raw ?? [];
    if (!Array.isArray(list)) throw httpError(400, 'CHECKLIST_ITEMS_INVALID');
    const existing = new Map(checklistId ? this.checklists.listEntries(checklistId).map(entry => [entry.id, entry]) : []);
    const entries = list.map(entry => {
      if (isId(entry?.id) && existing.has(entry.id)) return { id: entry.id, itemId: existing.get(entry.id).item_id };
      if (isId(entry?.item_id) && entry.id === undefined) return { id: null, itemId: entry.item_id };
      throw httpError(400, 'CHECKLIST_ITEMS_INVALID');
    });
    const keptIds = entries.filter(entry => entry.id).map(entry => entry.id);
    if (new Set(keptIds).size !== keptIds.length) throw httpError(400, 'CHECKLIST_ITEMS_INVALID');

    const added = entries.filter(entry => !entry.id).map(entry => entry.itemId);
    const found = new Map(this.items.findRefs({ ids: added, uuids: [] }).map(item => [item.id, item]));
    const unknown = new Set(added.filter(id => !found.has(id))).size;
    if (unknown) throw httpError(400, 'CHECKLIST_ITEMS_NOT_FOUND', { count: unknown });

    const seen = new Set();
    for (const { itemId } of entries) {
      if (itemId === null) continue;
      if (seen.has(itemId)) {
        const name = found.get(itemId)?.name ?? this.items.findRef(itemId)?.name ?? '';
        throw httpError(400, 'CHECKLIST_ITEM_DUPLICATE', { name });
      }
      seen.add(itemId);
    }
    return entries;
  }

  create(body) {
    const id = this.checklists.transaction(() => {
      const attributes = this.readAttributes(body);
      const entries = this.readEntries(body.items);
      const checklistId = this.checklists.insert(attributes);
      this.checklists.replaceEntries(checklistId, entries);
      return checklistId;
    });
    return this.get(id);
  }

  update(id, body) {
    const checklistId = this.checklists.transaction(() => {
      const current = this.requireChecklist(id);
      const attributes = this.readAttributes(body);
      const entries = this.readEntries(body.items, current.id);
      this.checklists.update(current.id, attributes);
      this.checklists.replaceEntries(current.id, entries);
      return current.id;
    });
    return this.get(checklistId);
  }

  // The definition and its entries go; its runs stay as history under their snapshot names.
  remove(id) {
    if (!this.checklists.deleteById(id)) throw httpError(404, 'CHECKLIST_NOT_FOUND');
  }
}
