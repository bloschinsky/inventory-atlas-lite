/*
  Checklist vocabulary shared by the server and the browser. Both modes use the same run item states;
  only the label of `confirmed` differs (Packed or Present), so there is one run engine, not two.
*/
export const CHECKLIST_MODES = ['packing', 'verification'];

export const RUN_ITEM_STATUSES = ['pending', 'confirmed', 'missing'];

export const MAX_RUN_ITEM_NOTE = 500;

// A container audit checks either the items stored directly in the container or everything below it.
export const AUDIT_SCOPES = ['direct', 'nested'];

// Missing is not confirmed, but it has been explicitly checked.
export const countRunItems = items => {
  const counts = { total: items.length, confirmed: 0, missing: 0, pending: 0 };
  for (const item of items) counts[item.status] += 1;
  return { ...counts, checked: counts.confirmed + counts.missing };
};
