let pendingDraft = null;

export function setPendingAiDraft(draft, photo, photoWarning = '') {
  pendingDraft = { draft, photo, photoWarning };
}

export function takePendingAiDraft() {
  const pending = pendingDraft;
  pendingDraft = null;
  return pending;
}
