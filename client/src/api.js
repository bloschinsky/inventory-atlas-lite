import { translateError } from './i18n/index.js';

/*
  A failed API request. The server answers { error: { code, params } }; the message is translated
  into the active language here, and the code, parameters, and status stay available to callers.
*/
export class ApiError extends Error {
  constructor(error, status) {
    super(translateError(error));
    this.name = 'ApiError';
    this.code = error.code;
    this.params = error.params ?? {};
    this.status = status;
  }
}

// A response without an error body, for example from a failing proxy, is reported by its status.
async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = body?.error?.code ? body.error : { code: 'REQUEST_FAILED', params: { status: response.status } };
  return new ApiError(error, response.status);
}

export async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw await failure(response);
  return response.status === 204 ? null : response.json();
}

export async function apiBlob(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw await failure(response);
  return response.blob();
}

export const jsonOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
