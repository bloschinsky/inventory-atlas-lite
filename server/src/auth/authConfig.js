import net from 'node:net';
import path from 'node:path';

/*
  Authentication settings of one running instance. Each instance keeps its own security store in its
  own DATA_DIR, so a TEST and a PROD deployment never share users, sessions, or tokens.
*/
export const authDatabaseFile = dataDir => path.join(dataDir, 'auth.sqlite');

const minutes = value => value * 60 * 1000;
const days = value => value * 24 * 60 * 60 * 1000;
const positive = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

export const authTimings = Object.freeze({
  // A browser session ends after this long without a request, and in any case after the absolute lifetime.
  sessionIdleMs: positive('AUTH_SESSION_IDLE_MS', days(3)),
  sessionAbsoluteMs: positive('AUTH_SESSION_ABSOLUTE_MS', days(30)),
  // Destructive administration needs a password confirmation no older than this.
  reauthWindowMs: positive('AUTH_REAUTH_WINDOW_MS', minutes(10)),
  // Activity timestamps are written at most this often, so reads do not turn into writes.
  touchIntervalMs: minutes(5),
  // A one-time setup or recovery code from the command line is valid this long.
  oneTimeCodeTtlMs: minutes(30)
});

const TRUST_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/*
  ATLAS_TRUST_PROXY names the reverse proxies whose X-Forwarded-* headers are believed: Express preset
  names or IP addresses and CIDR ranges, separated by commas. Unset means no proxy is trusted, so a
  client can never claim HTTPS or another address by sending those headers itself. `true` and hop
  counts are refused because they would trust whoever connects.
*/
export function parseTrustProxy(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  const entries = text.split(',').map(entry => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const validPrefix = prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= 128);
    if (TRUST_PRESETS.has(entry) || (net.isIP(address) && validPrefix && extra === undefined)) continue;
    throw new Error(`ATLAS_TRUST_PROXY: "${entry}" is not a preset (loopback, linklocal, uniquelocal), an IP address, or a CIDR range.`);
  }
  return entries.join(',');
}

// Plain HTTP from another machine is refused unless the operator opts in explicitly (see README.md).
export const allowInsecureHttp = value => ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());
