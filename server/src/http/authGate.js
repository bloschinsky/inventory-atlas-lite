import { httpError } from '../httpError.js';
import { matchRoute } from '../auth/routePolicy.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/*
  The session cookie. Over HTTPS it is `__Host-` prefixed (Secure, Path=/, no Domain), so a sibling
  subdomain or a plain-HTTP page can never plant or read it. Lax keeps it on the top-level return
  from a cloud provider's OAuth page and off every cross-site subrequest.
*/
export const sessionCookieName = req => (req.secure ? '__Host-ial_session' : 'ial_session');

export const readCookie = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      try { return decodeURIComponent(value.join('=')); } catch { return undefined; }
    }
  }
  return undefined;
};

export const setSessionCookie = (req, res, { cookie, maxAgeMs }) => {
  res.cookie(sessionCookieName(req), cookie, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: maxAgeMs });
};

export const clearSessionCookie = (req, res) => {
  res.clearCookie(sessionCookieName(req), { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
};

// Headers of every response: no framing, no MIME sniffing, no referrer to other sites.
export const securityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  if (req.path.toLowerCase().startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
};

/*
  A state-changing request must come from the application's own pages. Fetch Metadata tells it
  directly; otherwise the Origin must name this host (as the trusted proxy configuration reports it).
  This guards the login and setup forms too, which have no session yet.
*/
const foreignOrigin = req => {
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host !== req.host; } catch { return true; }
};

const bearerOf = req => {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, value, extra] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && value && !extra ? value : '';
};

/*
  The authentication and authorization boundary of the whole API, mounted before every route table.
  It identifies the principal (a browser session or an API token, never both), enforces HTTPS for
  credentials, CSRF protection for cookie requests, and the entry of server/src/auth/routePolicy.js.
  Missing or invalid credentials are 401, a principal without the permission is 403.
*/
export function createAuthGate({ authService, apiTokenService, allowHttp = false }) {
  const transportAllowed = req => req.secure || allowHttp || LOOPBACK.has(req.ip);

  return (req, res, next) => {
    if (!req.path.toLowerCase().startsWith('/api/')) return next();
    const rule = matchRoute(req.method, req.path);
    const refuse = error => (rule.redirect && req.method === 'GET' ? res.redirect(303, rule.redirect) : next(error));
    const unsafe = UNSAFE.has(req.method);

    const bearer = bearerOf(req);
    const cookie = readCookie(req, sessionCookieName(req));
    if (bearer !== null && cookie) return refuse(httpError(400, 'AUTH_AMBIGUOUS_CREDENTIALS'));
    if (bearer === null && unsafe && foreignOrigin(req)) return refuse(httpError(403, 'AUTH_CROSS_SITE_REQUEST'));

    const signingIn = rule.access === 'public' && unsafe;
    if ((bearer !== null || cookie || signingIn) && !transportAllowed(req)) return refuse(httpError(403, 'AUTH_HTTPS_REQUIRED'));

    let principal = null;
    if (bearer !== null) principal = apiTokenService.resolve(bearer);
    else if (cookie) {
      principal = authService.resolveSession(cookie);
      if (!principal) clearSessionCookie(req, res);
    }
    req.principal = principal;

    // A cookie request that changes anything carries the session's anti-CSRF token as a header.
    if (principal?.type === 'session' && unsafe && req.get('x-csrf-token') !== principal.csrfToken) {
      return refuse(httpError(403, 'AUTH_CSRF_INVALID'));
    }
    if (rule.access === 'public') return next();
    if (!principal) return refuse(httpError(401, authService.setupRequired() ? 'AUTH_SETUP_REQUIRED' : 'AUTH_REQUIRED'));
    if (rule.access === 'session') return principal.type === 'session' ? next() : refuse(httpError(403, 'AUTH_FORBIDDEN'));
    if (!principal.permissions.includes(rule.access)) return refuse(httpError(403, 'AUTH_FORBIDDEN'));
    if (rule.fresh && !authService.isFresh(principal)) return refuse(httpError(403, 'AUTH_REAUTH_REQUIRED'));
    next();
  };
}
