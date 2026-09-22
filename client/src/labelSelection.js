import { reactive } from 'vue';

/*
  UUIDs of the items chosen for label printing. The state lives for the whole browser session of the
  application, so paging, filtering, and returning from the print view never drop a selection; only
  Clear selection or a page reload does.
*/
export const labelSelection = reactive(new Set());

export function toggleLabelSelection(uuid, selected) {
  if (selected) labelSelection.add(uuid);
  else labelSelection.delete(uuid);
}

// The UUIDs go through history state rather than the URL: hundreds of them would exceed the request
// header limit when the print view is reloaded. The state itself survives a reload of that view.
export const printLabelsRoute = uuids => ({ path: '/labels/print', state: { uuids: [...uuids] } });
