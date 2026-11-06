import { validatePassword, validateRole, validateUsername } from '../../../shared/accounts.js';
import { httpError } from '../httpError.js';
import { publicUser } from './authService.js';

/*
  Account administration for Security & Access. There is no public sign-up and no way to pick one's
  own role: only an administrator creates accounts and changes them. The last active administrator
  can never be disabled or demoted, and nobody can disable or demote themselves.
*/
export class UserAdminService {
  constructor({ users, sessions, audit, hasher, clock = Date.now }) {
    Object.assign(this, { users, sessions, audit, hasher, clock });
  }

  record(event, principal, target, ip) {
    this.audit.record({ at: this.clock(), event, principalType: principal.type, actorUserId: principal.userId, target: String(target), ip });
  }

  list() {
    return this.users.list().map(publicUser);
  }

  find(id) {
    const user = this.users.findById(Number(id));
    if (!user) throw httpError(404, 'AUTH_USER_NOT_FOUND');
    return user;
  }

  async create(principal, body, { ip } = {}) {
    const username = validateUsername(body?.username);
    const role = validateRole(body?.role ?? 'viewer');
    const passwordHash = await this.hasher.hash(validatePassword(body?.password));
    if (this.users.findByUsername(username)) throw httpError(409, 'AUTH_USERNAME_TAKEN');
    const user = this.users.create({ username, role, passwordHash, now: this.clock() });
    this.record('user.create', principal, user.id, ip);
    return publicUser(user);
  }

  // Changes the role and/or the disabled state; either change ends every session of the account.
  update(principal, id, body, { ip } = {}) {
    const user = this.find(id);
    const role = body?.role === undefined ? user.role : validateRole(body.role);
    if (body?.disabled !== undefined && typeof body.disabled !== 'boolean') throw httpError(400, 'INVALID_REQUEST');
    const disabled = body?.disabled ?? user.disabled;
    const losesAdmin = user.role === 'admin' && !user.disabled && (role !== 'admin' || disabled);
    if (losesAdmin && user.id === principal.userId) throw httpError(409, 'AUTH_SELF_LOCKOUT');
    this.users.transaction(() => {
      if (losesAdmin && this.users.countActiveAdmins() <= 1) throw httpError(409, 'AUTH_LAST_ADMIN');
      const now = this.clock();
      if (role !== user.role) this.users.setRole(user.id, role, now);
      if (disabled !== user.disabled) this.users.setDisabled(user.id, disabled, now);
      if (role !== user.role || disabled !== user.disabled) this.sessions.deleteForUser(user.id);
    });
    if (role !== user.role) this.record('user.role', principal, user.id, ip);
    if (disabled !== user.disabled) this.record(disabled ? 'user.disable' : 'user.enable', principal, user.id, ip);
    return publicUser(this.users.findById(user.id));
  }

  // An administrator's reset of someone else's password; one's own is changed from Sessions with the current one.
  async resetPassword(principal, id, body, { ip } = {}) {
    const user = this.find(id);
    if (user.id === principal.userId) throw httpError(409, 'AUTH_SELF_RESET');
    const passwordHash = await this.hasher.hash(validatePassword(body?.password));
    this.users.transaction(() => {
      this.users.setPasswordHash(user.id, passwordHash, this.clock());
      this.sessions.deleteForUser(user.id);
    });
    this.record('user.password-reset', principal, user.id, ip);
    return publicUser(this.users.findById(user.id));
  }
}
