import { createHmac, randomBytes } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

/*
  A small in-process cache of model lists, one entry per connection. The key is an HMAC of the
  provider, base URL, and API key under a secret that never leaves the process, so the key itself
  is neither stored nor logged here, and a different key, address, or provider never shares an entry.
  An expired entry is kept, bounded by `maxEntries`, as a labelled fallback for a failed refresh.
*/
export class ModelListCache {
  constructor({ ttlMs = DAY_MS, maxEntries = 8, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.secret = randomBytes(32);
    this.entries = new Map();
  }

  key({ provider, baseUrl, apiKey }) {
    return createHmac('sha256', this.secret).update(JSON.stringify([provider, baseUrl, apiKey])).digest('hex');
  }

  // `{ list, fresh }`, or null when this connection has never been listed.
  get(connection) {
    const entry = this.entries.get(this.key(connection));
    return entry ? { list: entry.list, fresh: this.now() - entry.storedAt < this.ttlMs } : null;
  }

  set(connection, list) {
    const key = this.key(connection);
    this.entries.delete(key);
    this.entries.set(key, { list, storedAt: this.now() });
    // A Map keeps insertion order, so the first entry is the least recently stored one.
    if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }
}
