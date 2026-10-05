import { ref } from 'vue';
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

/*
  The public demo build (__DEMO__) answers every API request inside the browser, from the in-memory
  demo backend in ./demo/; the normal build never includes it and always talks to the server.
*/
let demo = null;
const demoReady = __DEMO__ ? import('./demo/backend.js').then(async ({ startDemoBackend }) => { demo = await startDemoBackend(); }) : null;

const request = async (url, options) => {
  if (!demoReady) return fetch(url, options);
  await demoReady;
  return demo.fetch(url, options);
};

// The address an <img> shows a stored photo from.
export const photoUrl = id => (demo ? demo.photoUrl(id) : `/api/photos/${id}`);

/*
  Demo only: puts the canonical fixture back without a reload. `dataRevision` counts those resets;
  App.vue keys the page on it, so the open page loads the fresh data. It never changes otherwise.
*/
export const dataRevision = ref(0);
export async function resetDemoData() {
  await demoReady;
  demo.reset();
  dataRevision.value++;
}

// A response without an error body, for example from a failing proxy, is reported by its status.
async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = body?.error?.code ? body.error : { code: 'REQUEST_FAILED', params: { status: response.status } };
  return new ApiError(error, response.status);
}

export async function api(url, options = {}) {
  const response = await request(url, options);
  if (!response.ok) throw await failure(response);
  return response.status === 204 ? null : response.json();
}

export async function apiBlob(url, options = {}) {
  const response = await request(url, options);
  if (!response.ok) throw await failure(response);
  return response.blob();
}

export const jsonOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
