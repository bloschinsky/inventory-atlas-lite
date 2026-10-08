/*
  The item lifecycle, shared by the client and the server. An item is active (part of the current
  inventory) or retired (it left the inventory but stays readable). The stored keys never change and
  are never translated; the interface names them through lifecycle.statuses.<key> and
  lifecycle.reasons.<key>.
*/
export const LIFECYCLE_STATUSES = ['active', 'retired'];

// Why an item left the inventory. A loan or a temporary transfer is not one of them.
export const RETIREMENT_REASONS = ['sold', 'gifted', 'lost', 'stolen', 'disposed', 'consumed', 'other'];

// The views of the Items list and the Hierarchy page; `active` is the default of both.
export const LIFECYCLE_FILTERS = ['active', 'all', 'retired'];

// The recipient is one line like the other short fields; the note may be a short paragraph.
export const MAX_RETIREMENT_RECIPIENT = 255;
export const MAX_RETIREMENT_NOTE = 2000;

export const isRetirementReason = value => RETIREMENT_REASONS.includes(value);
