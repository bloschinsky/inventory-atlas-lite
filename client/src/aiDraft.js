let pendingDraft = null;

export function setPendingAiDraft(draft, photo) {
  pendingDraft = { draft, photo };
}

export function takePendingAiDraft() {
  const pending = pendingDraft;
  pendingDraft = null;
  return pending;
}
