/*
  The optional instance label (ATLAS_INSTANCE_LABEL), such as TEST or PROD. It names the running
  deployment, not the database: it lives only in the environment, so a database copied or restored
  from another instance never brings its label along. It is informational only and changes no
  behavior. The value is cleaned rather than refused, so a careless setting cannot stop the server:
  control and formatting characters become spaces, whitespace is collapsed, and the text is cut to
  INSTANCE_LABEL_MAX_LENGTH characters. A missing or blank value means no label.
*/
export const INSTANCE_LABEL_MAX_LENGTH = 24;

export function normalizeInstanceLabel(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...text].slice(0, INSTANCE_LABEL_MAX_LENGTH).join('').trim() || null;
}
