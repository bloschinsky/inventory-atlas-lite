/*
  In-memory throttling of credential attempts (login, setup and recovery codes, reauthentication).
  Failures are counted per client address and per address and account name together. Nothing locks
  an account itself, so someone guessing from elsewhere can never shut the administrator out; they
  only slow themselves down. A restart clears the counters, which is acceptable for a small server.
*/
export class LoginThrottle {
  constructor({ windowMs = 15 * 60 * 1000, maxPerPair = 5, maxPerAddress = 20, clock = Date.now } = {}) {
    this.windowMs = windowMs;
    this.maxPerPair = maxPerPair;
    this.maxPerAddress = maxPerAddress;
    this.clock = clock;
    this.failures = new Map();
  }

  keys(address, name) {
    return [[`ip:${address}`, this.maxPerAddress], [`pair:${address}:${String(name ?? '').toLowerCase()}`, this.maxPerPair]];
  }

  // Seconds until the next attempt is allowed, or 0.
  retryAfter(address, name) {
    const now = this.clock();
    let wait = 0;
    for (const [key, max] of this.keys(address, name)) {
      const entry = this.failures.get(key);
      if (!entry || entry.resetAt <= now) continue;
      if (entry.count >= max) wait = Math.max(wait, Math.ceil((entry.resetAt - now) / 1000));
    }
    return wait;
  }

  fail(address, name) {
    const now = this.clock();
    if (this.failures.size > 10000) this.prune(now);
    for (const [key] of this.keys(address, name)) {
      const entry = this.failures.get(key);
      if (!entry || entry.resetAt <= now) this.failures.set(key, { count: 1, resetAt: now + this.windowMs });
      else entry.count++;
    }
  }

  succeed(address, name) {
    this.failures.delete(this.keys(address, name)[1][0]);
  }

  prune(now) {
    for (const [key, entry] of this.failures) if (entry.resetAt <= now) this.failures.delete(key);
  }
}
