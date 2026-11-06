import { reactive, ref } from 'vue';
import { ALL_PERMISSIONS } from '../../shared/permissions.js';
import { api, connectSession, jsonOptions } from './api.js';

/*
  Who is signed in, and what they may do. The server decides every request on its own; this state
  only lets the interface show what the person can use and send the session's anti-CSRF token.
  Nothing secret is kept in browser storage: the session itself is an HttpOnly cookie.

  status: 'loading' | 'setup' (no administrator yet) | 'signedOut' | 'signedIn'.
  The public demo has no server and no accounts; it acts as one administrator in the browser.
*/
export const auth = reactive({ status: 'loading', user: null, permissions: [], csrfToken: null });

if (__DEMO__) Object.assign(auth, { status: 'signedIn', user: { id: 0, username: 'demo', role: 'admin' }, permissions: [...ALL_PERMISSIONS] });

export const can = permission => auth.permissions.includes(permission);

function apply(body) {
  if (body?.authenticated) {
    Object.assign(auth, { status: 'signedIn', user: body.user, permissions: body.permissions ?? [], csrfToken: body.csrfToken ?? null });
  } else {
    Object.assign(auth, { status: body?.setupRequired ? 'setup' : 'signedOut', user: null, permissions: [], csrfToken: null });
  }
}

let loading = null;
export function loadAuth() {
  if (__DEMO__) return Promise.resolve();
  loading ??= api('/api/auth/session').then(apply).catch(() => apply(null));
  return loading;
}

const post = (url, body) => api(url, jsonOptions('POST', body));
export const signIn = async credentials => apply(await post('/api/auth/login', credentials));
export const setUp = async form => apply(await post('/api/auth/setup', form));
export const recover = async form => apply(await post('/api/auth/recover', form));
// A password change ends every session, this one included, and continues in a new one.
export const changePassword = async form => apply(await post('/api/auth/password', form));

// A full page load afterwards, so nothing of the signed-out person's pages stays in memory.
export async function signOut() {
  try { await post('/api/auth/logout', {}); } catch { /* the session is gone either way */ }
  window.location.assign('/login');
}

/*
  Destructive administration asks for the password again. api.js calls `reauthenticate()` when the
  server answers AUTH_REAUTH_REQUIRED; the dialog in ReauthDialog.vue shows while `reauthPending`
  is set and settles it with true (confirmed, so the request is sent again) or false (cancelled).
*/
export const reauthPending = ref(null);
function reauthenticate() {
  reauthPending.value?.(false);
  return new Promise(resolve => { reauthPending.value = resolve; });
}
export async function confirmPassword(password) {
  await post('/api/auth/reauthenticate', { password });
  settleReauth(true);
}
export function settleReauth(confirmed) {
  const resolve = reauthPending.value;
  reauthPending.value = null;
  resolve?.(confirmed);
}

// Called when a request finds the session gone: the router guard then sends the person to sign in.
let onSignedOut = () => {};
export const whenSignedOut = callback => { onSignedOut = callback; };

connectSession({
  csrfToken: () => auth.csrfToken,
  reauthenticate,
  signedOut: () => {
    if (auth.status !== 'signedIn') return;
    apply(null);
    onSignedOut();
  }
});
