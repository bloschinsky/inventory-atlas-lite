import { validatePassword, validateUsername } from '../../../shared/accounts.js';
import { permissionsOfRole } from '../../../shared/permissions.js';
import { httpError } from '../httpError.js';
import { csrfTokenOf, hashSecret, normalizeCode, randomCode, randomId, randomSecret, sameHash } from './secrets.js';
import { describeUserAgent } from './userAgent.js';

export const publicUser = user => ({
  id: user.id,
  username: user.username,
  role: user.role,
  disabled: user.disabled,
  createdAt: new Date(user.createdAt).toISOString()
});

const iso = value => (value ? new Date(value).toISOString() : null);

/*
  Signing in and out, browser sessions, a person's own password, and the one-time setup and recovery
  codes the command line issues. Sessions are opaque random secrets; the store keeps only their hash,
  and the cookie value is `<session id>.<secret>`.
*/
export class AuthService {
  constructor({ users, sessions, audit, hasher, throttle, timings, clock = Date.now }) {
    Object.assign(this, { users, sessions, audit, hasher, throttle, timings, clock });
  }

  setupRequired() {
    return this.users.count() === 0;
  }

  record(event, { principal = null, actorUserId = principal?.userId ?? null, target = null, ip = null } = {}) {
    const at = this.clock();
    this.audit.record({ at, event, principalType: principal?.type ?? null, actorUserId, target, ip });
    this.recorded = (this.recorded ?? 0) + 1;
    if (this.recorded % 100 === 0) this.audit.prune();
  }

  throttled(ip, name) {
    const wait = this.throttle.retryAfter(ip, name);
    if (wait) throw httpError(429, 'AUTH_TOO_MANY_ATTEMPTS', { retryAfterSeconds: wait });
  }

  startSession(user, { ip = null, userAgent = '' } = {}) {
    const now = this.clock();
    const id = randomId();
    const secret = randomSecret();
    this.sessions.create({
      id, userId: user.id, secretHash: hashSecret(secret), createdAt: now, lastSeenAt: now,
      expiresAt: now + this.timings.sessionAbsoluteMs, authenticatedAt: now,
      userAgent: describeUserAgent(userAgent), ip
    });
    return { cookie: `${id}.${secret}`, maxAgeMs: this.timings.sessionAbsoluteMs, csrfToken: csrfTokenOf(secret), user: publicUser(user) };
  }

  /*
    The same refusal for an unknown name, a wrong password, and a disabled account, and about the
    same time for each, so the answer never tells which names exist.
  */
  async login({ username, password }, { ip, userAgent, replacing = null }) {
    const name = typeof username === 'string' ? username.trim().slice(0, 64) : '';
    this.throttled(ip, name);
    const secret = typeof password === 'string' ? password.slice(0, 1024) : '';
    const user = name ? this.users.findByUsername(name) : null;
    const valid = user ? await this.hasher.verify(user.passwordHash, secret) : await this.hasher.verifyNothing(secret);
    if (!valid || user.disabled) {
      this.throttle.fail(ip, name);
      this.record('login.failure', { ip });
      throw httpError(401, this.setupRequired() ? 'AUTH_SETUP_REQUIRED' : 'AUTH_INVALID_CREDENTIALS');
    }
    this.throttle.succeed(ip, name);
    if (this.hasher.needsRehash(user.passwordHash)) this.users.setPasswordHash(user.id, await this.hasher.hash(secret), this.clock());
    // A new session every time: a session identifier planted before the login is never adopted.
    if (replacing) this.sessions.delete(replacing);
    this.record('login.success', { actorUserId: user.id, ip });
    return this.startSession(user, { ip, userAgent });
  }

  // The principal of a session cookie, or null for anything unknown, expired, or belonging to a disabled account.
  resolveSession(cookieValue) {
    const [id, secret, extra] = String(cookieValue ?? '').split('.');
    if (!id || !secret || extra !== undefined || id.length > 64 || secret.length > 128) return null;
    const session = this.sessions.findById(id);
    if (!session || !sameHash(session.secretHash, hashSecret(secret))) return null;
    const now = this.clock();
    if (session.expiresAt <= now || session.lastSeenAt + this.timings.sessionIdleMs <= now) {
      this.sessions.delete(id);
      return null;
    }
    const user = this.users.findById(session.userId);
    if (!user || user.disabled) return null;
    if (now - session.lastSeenAt >= this.timings.touchIntervalMs) this.sessions.touch(id, now);
    return {
      type: 'session', sessionId: id, userId: user.id, username: user.username, role: user.role,
      permissions: permissionsOfRole(user.role), authenticatedAt: session.authenticatedAt, csrfToken: csrfTokenOf(secret)
    };
  }

  isFresh(principal) {
    return principal?.type === 'session' && this.clock() - principal.authenticatedAt <= this.timings.reauthWindowMs;
  }

  logout(principal, { ip } = {}) {
    this.sessions.delete(principal.sessionId);
    this.record('logout', { principal, ip });
  }

  async confirmPassword(principal, password, ip) {
    this.throttled(ip, principal.username);
    const user = this.users.findById(principal.userId);
    const valid = typeof password === 'string' && password.length <= 1024 && await this.hasher.verify(user.passwordHash, password);
    if (!valid) {
      this.throttle.fail(ip, principal.username);
      this.record('reauth.failure', { principal, ip });
      throw httpError(403, 'AUTH_CURRENT_PASSWORD_INVALID');
    }
    this.throttle.succeed(ip, principal.username);
    return user;
  }

  async reauthenticate(principal, { password }, { ip }) {
    await this.confirmPassword(principal, password, ip);
    this.sessions.markAuthenticated(principal.sessionId, this.clock());
    this.record('reauth.success', { principal, ip });
    return { reauthenticatedUntil: iso(this.clock() + this.timings.reauthWindowMs) };
  }

  // Every session of the account ends, and the person continues in a new one.
  async changePassword(principal, { currentPassword, newPassword }, { ip, userAgent }) {
    const password = validatePassword(newPassword);
    const user = await this.confirmPassword(principal, currentPassword, ip);
    const hash = await this.hasher.hash(password);
    this.users.transaction(() => {
      this.users.setPasswordHash(user.id, hash, this.clock());
      this.sessions.deleteForUser(user.id);
    });
    this.record('password.change', { principal, ip });
    return this.startSession(user, { ip, userAgent });
  }

  listSessions(principal) {
    return this.sessions.listForUser(principal.userId).map(session => ({
      id: session.id,
      current: session.id === principal.sessionId,
      client: session.userAgent,
      ip: session.ip,
      createdAt: iso(session.createdAt),
      lastSeenAt: iso(session.lastSeenAt),
      expiresAt: iso(Math.min(session.expiresAt, session.lastSeenAt + this.timings.sessionIdleMs))
    }));
  }

  revokeSession(principal, id, { ip } = {}) {
    const session = this.sessions.findById(id);
    if (!session || session.userId !== principal.userId) throw httpError(404, 'AUTH_SESSION_NOT_FOUND');
    this.sessions.delete(id);
    this.record('session.revoke', { principal, ip });
    return { current: id === principal.sessionId };
  }

  revokeOtherSessions(principal, { ip } = {}) {
    const revoked = this.sessions.deleteForUser(principal.userId, { except: principal.sessionId });
    this.record('session.revoke-others', { principal, ip });
    return { revoked };
  }

  // Command line only: the code that lets the first administrator be created from the browser.
  issueSetupCode() {
    if (!this.setupRequired()) throw new Error('An administrator already exists. Use "recover <username>" instead.');
    return this.issueCode('setup');
  }

  // Command line only: the code that sets a new password for one account and enables it again.
  issueRecoveryCode(username) {
    const user = this.users.findByUsername(String(username ?? '').trim());
    if (!user) throw new Error(`No account is named "${username}".`);
    return { ...this.issueCode('recovery', user.id), user: publicUser(user) };
  }

  issueCode(purpose, userId = null) {
    const now = this.clock();
    const code = randomCode();
    const expiresAt = now + this.timings.oneTimeCodeTtlMs;
    this.users.deleteExpiredCodes(now);
    this.users.replaceCode({ purpose, userId, codeHash: hashSecret(normalizeCode(code)), now, expiresAt });
    this.record(`${purpose}.code-issued`, { actorUserId: userId });
    return { code, expiresAt: iso(expiresAt) };
  }

  // Creates the first administrator with a setup code. The check and the insert are one transaction.
  async setup({ code, username, password }, { ip, userAgent }) {
    this.throttled(ip, 'setup');
    const name = validateUsername(username);
    const hash = await this.hasher.hash(validatePassword(password));
    const user = this.users.transaction(() => {
      const issued = this.users.count() === 0 && this.users.findCode('setup', hashSecret(normalizeCode(code)), this.clock());
      if (!issued) return null;
      this.users.deleteCode(issued.id);
      return this.users.create({ username: name, role: 'admin', passwordHash: hash, now: this.clock() });
    });
    if (!user) {
      this.throttle.fail(ip, 'setup');
      this.record('setup.failure', { ip });
      throw httpError(401, 'AUTH_INVALID_SETUP_CODE');
    }
    this.record('setup.success', { actorUserId: user.id, ip });
    return this.startSession(user, { ip, userAgent });
  }

  // Sets a new password with a recovery code, enables the account, and ends its old sessions.
  async recover({ code, username, password }, { ip, userAgent }) {
    const name = typeof username === 'string' ? username.trim().slice(0, 64) : '';
    this.throttled(ip, `recovery:${name}`);
    const hash = await this.hasher.hash(validatePassword(password));
    const user = this.users.findByUsername(name);
    const recovered = user && this.users.transaction(() => {
      const issued = this.users.findCode('recovery', hashSecret(normalizeCode(code)), this.clock());
      if (!issued || issued.userId !== user.id) return false;
      const now = this.clock();
      this.users.deleteCode(issued.id);
      this.users.setPasswordHash(user.id, hash, now);
      this.users.setDisabled(user.id, false, now);
      this.sessions.deleteForUser(user.id);
      return true;
    });
    if (!recovered) {
      this.throttle.fail(ip, `recovery:${name}`);
      this.record('recovery.failure', { ip });
      throw httpError(401, 'AUTH_INVALID_RECOVERY_CODE');
    }
    this.record('recovery.success', { actorUserId: user.id, ip });
    return this.startSession(this.users.findById(user.id), { ip, userAgent });
  }
}
