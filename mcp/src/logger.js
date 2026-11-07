/*
  One JSON line per event on stderr. Fields are chosen by the caller and never include tool
  arguments or results; as a second line of defence every string is scrubbed of anything that looks
  like an Atlas token or an Authorization value, at every level including debug.
*/
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Atlas API tokens, the adapter's own OAuth access and refresh tokens, and Bearer values.
const SECRET_PATTERNS = [/ial_[0-9a-f]{16}_[A-Za-z0-9_-]+/g, /amcp_(?:at|rt)_[A-Za-z0-9_-]+/g, /(bearer\s+)[^\s"']+/gi];

export const redact = value => {
  if (typeof value === 'string') return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, (_m, prefix) => `${typeof prefix === 'string' ? prefix : ''}[redacted]`), value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /token|authorization|secret|password/i.test(key) ? '[redacted]' : redact(entry)]));
  return value;
};

export function createLogger(level = 'info', write = line => process.stderr.write(`${line}\n`)) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const log = (name, message, fields = {}) => {
    if (LEVELS[name] > threshold) return;
    const clean = Object.fromEntries(Object.entries(redact(fields)).filter(([, value]) => value !== undefined && value !== null));
    write(JSON.stringify({ time: new Date().toISOString(), level: name, msg: redact(message), ...clean }));
  };
  return Object.fromEntries(Object.keys(LEVELS).map(name => [name, (message, fields) => log(name, message, fields)]));
}
