import { i18n } from './i18n/index.js';

// Used only when the server gives no { error } of its own, for example behind a failing proxy.
const requestFailed = status => i18n.global.t('common.requestFailed', { status });

export async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || requestFailed(response.status));
  }
  return response.status === 204 ? null : response.json();
}

export async function apiBlob(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || requestFailed(response.status));
  }
  return response.blob();
}

export const jsonOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
