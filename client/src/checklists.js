// Translation keys of the checklist vocabulary. Runs store one set of states; only the label of
// `confirmed` follows the mode: Packed for packing, Present for verification.
export const modeKey = mode => `checklists.modes.${mode}`;

export const stateKey = (mode, status) => {
  if (status !== 'confirmed') return `checklists.states.${status}`;
  return mode === 'packing' ? 'checklists.states.packed' : 'checklists.states.present';
};

// A container audit is named after the container as it was called when the audit began.
export const runTitle = (t, run) => (run.source === 'container_audit'
  ? t('checklists.audit.runTitle', { name: run.container_name })
  : run.checklist_name);

// Tabler badge colors of each state; the state is always written out as well, never shown by color alone.
export const stateBadge = {
  pending: 'bg-secondary-lt',
  confirmed: 'bg-green-lt',
  missing: 'bg-red-lt'
};
