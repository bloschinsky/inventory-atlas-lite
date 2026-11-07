import { readFileSync } from 'node:fs';
import net from 'node:net';

/*
  The adapter's whole configuration, read once from the environment and validated strictly: a
  missing token, a malformed address, or an out-of-range limit stops the process before it listens,
  so it never starts half-configured or falls back to anonymous requests.
*/

// The shape of an Atlas API token (`ial_<16 hex id>_<base64url secret>`); the secret itself is never logged.
export const TOKEN_PATTERN = /^ial_[0-9a-f]{16}_[A-Za-z0-9_-]{16,128}$/;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
export const isLoopbackHost = host => LOOPBACK_HOSTS.has(host) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);

export class ConfigError extends Error {}

const fail = message => { throw new ConfigError(message); };

const integer = (env, name, fallback, min, max) => {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) < min || Number(raw) > max) fail(`${name} must be an integer from ${min} to ${max}.`);
  return Number(raw);
};

function readBaseUrl(raw) {
  if (!raw || !raw.trim()) fail('ATLAS_BASE_URL is required, for example http://127.0.0.1:3000.');
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    fail('ATLAS_BASE_URL is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) fail('ATLAS_BASE_URL must use http or https.');
  if (url.username || url.password) fail('ATLAS_BASE_URL must not contain credentials; use ATLAS_API_TOKEN.');
  if (url.search || url.hash) fail('ATLAS_BASE_URL must not contain a query or a fragment.');
  return url.href.replace(/\/+$/, '');
}

function readToken(env) {
  const inline = env.ATLAS_API_TOKEN?.trim();
  const file = env.ATLAS_API_TOKEN_FILE?.trim();
  if (inline && file) fail('Set either ATLAS_API_TOKEN or ATLAS_API_TOKEN_FILE, not both.');
  let token = inline;
  if (file) {
    try {
      token = readFileSync(file, 'utf8').trim();
    } catch {
      fail('ATLAS_API_TOKEN_FILE cannot be read.');
    }
  }
  if (!token) fail('ATLAS_API_TOKEN or ATLAS_API_TOKEN_FILE is required: create a Read-only token in Settings → Security & Access → API Access.');
  // The message never repeats the value, which may be a real token pasted with a typo.
  if (!TOKEN_PATTERN.test(token)) fail('The Atlas API token is malformed; expected the full ial_… value shown once when it was created.');
  return token;
}

const list = raw => String(raw || '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean);

function readListen(env, oauth) {
  const host = (env.MCP_HOST || '127.0.0.1').trim();
  if (!isLoopbackHost(host) && !net.isIP(host)) fail('MCP_HOST must be an IP address or localhost.');
  const extraHosts = list(env.MCP_ALLOWED_HOSTS);
  for (const entry of extraHosts) {
    if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/.test(entry)) fail(`MCP_ALLOWED_HOSTS: "${entry}" is not a host name.`);
  }
  // Anything but loopback is reachable by other machines or containers, so it is opt-in and every
  // accepted Host header must be named. With OAuth the public host name is that name; without it
  // there is no client authentication, so the private names must be listed explicitly.
  if (!isLoopbackHost(host) && !extraHosts.length && !oauth) {
    fail('MCP_HOST is not a loopback address: set MCP_ALLOWED_HOSTS to the host names clients use on the private network.');
  }
  const publicHost = oauth ? [new URL(oauth.issuerUrl).hostname] : [];
  return { host, port: integer(env, 'MCP_PORT', 3100, 0, 65535), allowedHosts: [...new Set(['127.0.0.1', 'localhost', '[::1]', ...publicHost, ...extraHosts])] };
}

/*
  Remote access (Phase 2.2) is switched on by MCP_PUBLIC_URL and only together with OAuth. Without it
  the adapter has no client authentication and must stay on loopback or a private container network
  (readListen); Host checks are not authentication. The URL is the issuer and, with
  /mcp, the protected resource every token is bound to; it must be HTTPS, except on a loopback host
  for a test on the same machine.
*/
function readOAuth(env) {
  const raw = env.MCP_PUBLIC_URL?.trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('MCP_PUBLIC_URL is not a valid URL.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname.replace(/^\[|\]$/g, '')))) {
    fail('MCP_PUBLIC_URL must use https (plain http only on a loopback host for local tests).');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    fail('MCP_PUBLIC_URL must be an origin only, for example https://mcp.example.com, without a path, query, or credentials.');
  }
  const stateDir = env.MCP_STATE_DIR?.trim();
  if (!stateDir) fail('MCP_STATE_DIR is required with MCP_PUBLIC_URL: a private directory for the OAuth clients and grants.');
  return Object.freeze({
    issuerUrl: url.origin,
    resourceUrl: `${url.origin}/mcp`,
    stateDir,
    accessTokenSeconds: integer(env, 'MCP_ACCESS_TOKEN_SECONDS', 3600, 300, 86400),
    refreshTokenSeconds: integer(env, 'MCP_REFRESH_TOKEN_DAYS', 30, 1, 90) * 86400
  });
}

// Express "trust proxy" values: addresses or CIDR ranges of the reverse proxy, or Express's named ranges.
const PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);
function readTrustProxy(env) {
  const entries = list(env.MCP_TRUST_PROXY);
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const family = net.isIP(address);
    const validPrefix = prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 6 ? 128 : 32));
    if (!PROXY_NAMES.has(entry) && !(family && validPrefix && extra === undefined)) {
      fail(`MCP_TRUST_PROXY: "${entry}" is not an IP address, a CIDR range, loopback, linklocal, or uniquelocal.`);
    }
  }
  return entries.length ? Object.freeze(entries) : false;
}

export function readConfig(env = process.env) {
  const level = (env.MCP_LOG_LEVEL || 'info').trim();
  if (!['error', 'warn', 'info', 'debug'].includes(level)) fail('MCP_LOG_LEVEL must be error, warn, info, or debug.');
  const oauth = readOAuth(env);
  return Object.freeze({
    atlas: Object.freeze({
      baseUrl: readBaseUrl(env.ATLAS_BASE_URL),
      token: readToken(env),
      timeoutMs: integer(env, 'ATLAS_TIMEOUT_MS', 10000, 500, 60000),
      maxResponseBytes: integer(env, 'ATLAS_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, 64 * 1024, 20 * 1024 * 1024),
      maxConcurrency: integer(env, 'ATLAS_MAX_CONCURRENCY', 4, 1, 32),
      maxQueue: integer(env, 'ATLAS_MAX_QUEUE', 32, 0, 1000)
    }),
    listen: Object.freeze(readListen(env, oauth)),
    oauth,
    trustProxy: readTrustProxy(env),
    maxSessions: integer(env, 'MCP_MAX_SESSIONS', 32, 1, 1000),
    sessionIdleMs: integer(env, 'MCP_SESSION_IDLE_SECONDS', 900, 30, 86400) * 1000,
    logLevel: level
  });
}
