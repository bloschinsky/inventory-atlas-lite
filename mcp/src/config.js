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

function readListen(env) {
  const host = (env.MCP_HOST || '127.0.0.1').trim();
  if (!isLoopbackHost(host) && !net.isIP(host)) fail('MCP_HOST must be an IP address or localhost.');
  const extraHosts = String(env.MCP_ALLOWED_HOSTS || '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean);
  for (const entry of extraHosts) {
    if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/.test(entry)) fail(`MCP_ALLOWED_HOSTS: "${entry}" is not a host name.`);
  }
  // Anything but loopback is reachable by other machines or containers, so it is opt-in and every
  // accepted Host header must be named: there is no client authentication before Phase 2.2.
  if (!isLoopbackHost(host) && !extraHosts.length) {
    fail('MCP_HOST is not a loopback address: set MCP_ALLOWED_HOSTS to the host names clients use on the private network.');
  }
  return { host, port: integer(env, 'MCP_PORT', 3100, 0, 65535), allowedHosts: [...new Set(['127.0.0.1', 'localhost', '[::1]', ...extraHosts])] };
}

export function readConfig(env = process.env) {
  const level = (env.MCP_LOG_LEVEL || 'info').trim();
  if (!['error', 'warn', 'info', 'debug'].includes(level)) fail('MCP_LOG_LEVEL must be error, warn, info, or debug.');
  return Object.freeze({
    atlas: Object.freeze({
      baseUrl: readBaseUrl(env.ATLAS_BASE_URL),
      token: readToken(env),
      timeoutMs: integer(env, 'ATLAS_TIMEOUT_MS', 10000, 500, 60000),
      maxResponseBytes: integer(env, 'ATLAS_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, 64 * 1024, 20 * 1024 * 1024),
      maxConcurrency: integer(env, 'ATLAS_MAX_CONCURRENCY', 4, 1, 32),
      maxQueue: integer(env, 'ATLAS_MAX_QUEUE', 32, 0, 1000)
    }),
    listen: Object.freeze(readListen(env)),
    maxSessions: integer(env, 'MCP_MAX_SESSIONS', 32, 1, 1000),
    sessionIdleMs: integer(env, 'MCP_SESSION_IDLE_SECONDS', 900, 30, 86400) * 1000,
    logLevel: level
  });
}
