import { ref } from 'vue';
import { i18n, translateError } from './i18n/index.js';

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
const demoReady = __DEMO__ ? import('./demo/backend.js').then(async ({ startDemoBackend }) => { demo = await startDemoBackend(i18n.global.locale.value); }) : null;

/*
  The signed-in session as auth.js reports it. Every state-changing request carries the session's
  anti-CSRF token; a lapsed session and a request that needs a fresh password confirmation are
  handed back to auth.js, which owns the sign-in page and the confirmation dialog.
*/
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const session = { csrfToken: () => null, signedOut: () => {}, reauthenticate: null };
export const connectSession = hooks => Object.assign(session, hooks);

const withCsrf = options => {
  const token = session.csrfToken();
  if (!token || !UNSAFE.has((options.method ?? 'GET').toUpperCase())) return options;
  const headers = new Headers(options.headers);
  headers.set('X-CSRF-Token', token);
  return { ...options, headers };
};

const request = async (url, options) => {
  if (!demoReady) return fetch(url, withCsrf(options));
  await demoReady;
  return demo.fetch(url, options);
};

// The address an <img> shows a stored photo from.
export const photoUrl = id => (demo ? demo.photoUrl(id) : `/api/photos/${id}`);

/*
  Demo only: puts the canonical fixture back without a reload, in the active interface language.
  `dataRevision` counts those resets; App.vue keys the page on it, so the open page loads the fresh
  data. Otherwise only the demo's guided tour changes it, through `reloadDemoPage()`, to replay a
  chapter on a freshly mounted page.
*/
export const dataRevision = ref(0);
export async function resetDemoData() {
  await demoReady;
  demo.reset(i18n.global.locale.value);
  dataRevision.value++;
}
export const reloadDemoPage = () => { dataRevision.value++; };

// A response without an error body, for example from a failing proxy, is reported by its status.
async function failure(response) {
  const body = await response.json().catch(() => ({}));
  const error = body?.error?.code ? body.error : { code: 'REQUEST_FAILED', params: { status: response.status } };
  return new ApiError(error, response.status);
}

// Sends the request again once the password is confirmed, when the server asks for that first.
async function send(url, options) {
  let response = await request(url, options);
  if (response.status === 403 && session.reauthenticate) {
    const error = await failure(response.clone());
    if (error.code === 'AUTH_REAUTH_REQUIRED' && await session.reauthenticate()) response = await request(url, options);
  }
  if (response.ok) return response;
  const error = await failure(response);
  if (error.code === 'AUTH_REQUIRED') session.signedOut();
  throw error;
}

export async function api(url, options = {}) {
  const response = await send(url, options);
  return response.status === 204 ? null : response.json();
}

export async function apiBlob(url, options = {}) {
  return (await send(url, options)).blob();
}

export const jsonOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
