import crypto from 'node:crypto';
import { validateTokenInput } from '../../../shared/accounts.js';
import { permissionsOfRole, permissionsOfScopes } from '../../../shared/permissions.js';
import { httpError } from '../httpError.js';
import { hashSecret, randomSecret, sameHash } from './secrets.js';

const PREFIX = 'ial_';
const iso = value => (value ? new Date(value).toISOString() : null);
const DAY_MS = 24 * 60 * 60 * 1000;

/*
  Scoped API tokens for machine clients, sent as `Authorization: Bearer ial_<id>_<secret>`. The full
  token is shown once, when it is created; the store keeps only the hash of its secret. A token acts
  for the administrator who created it and never with more than that account may do now: disabling
  the account, or demoting it, takes the token's access away with it.
*/
export class ApiTokenService {
  constructor({ tokens, users, audit, timings, clock = Date.now }) {
    Object.assign(this, { tokens, users, audit, timings, clock });
  }

  status(token, now = this.clock()) {
    if (token.revokedAt) return 'revoked';
    if (token.expiresAt && token.expiresAt <= now) return 'expired';
    return 'active';
  }

  publicToken(token) {
    return {
      id: token.id,
      name: token.name,
      // Enough to recognize the token in a client's configuration, never enough to use it.
      maskedToken: `${PREFIX}${token.id}_…`,
      scopes: token.scopes,
      owner: token.ownerUsername,
      status: this.status(token),
      createdAt: iso(token.createdAt),
      expiresAt: iso(token.expiresAt),
      lastUsedAt: iso(token.lastUsedAt),
      revokedAt: iso(token.revokedAt)
    };
  }

  list() {
    return this.tokens.list().map(token => this.publicToken(token));
  }

  create(principal, body, { ip } = {}) {
    const { name, scopes, expiresInDays } = validateTokenInput(body);
    // A token can only carry what its creator may do; no scope reaches settings, maintenance, or security.
    if (!permissionsOfScopes(scopes).every(permission => principal.permissions.includes(permission))) {
      throw httpError(403, 'AUTH_FORBIDDEN');
    }
    const now = this.clock();
    const id = crypto.randomBytes(8).toString('hex');
    const secret = randomSecret();
    const token = this.tokens.create({
      id, name, ownerUserId: principal.userId, scopes, secretHash: hashSecret(secret), createdAt: now,
      expiresAt: expiresInDays ? now + expiresInDays * DAY_MS : null
    });
    this.audit.record({ at: now, event: 'token.create', principalType: principal.type, actorUserId: principal.userId, target: id, ip });
    return { token: `${PREFIX}${id}_${secret}`, apiToken: this.publicToken(token) };
  }

  revoke(principal, id, { ip } = {}) {
    if (!this.tokens.findById(id)) throw httpError(404, 'AUTH_TOKEN_NOT_FOUND');
    const now = this.clock();
    this.tokens.revoke(id, now);
    this.audit.record({ at: now, event: 'token.revoke', principalType: principal.type, actorUserId: principal.userId, target: id, ip });
    return this.publicToken(this.tokens.findById(id));
  }

  // Command line only: revokes every token an account created, for an account that may be compromised.
  revokeAllOf(userId) {
    const now = this.clock();
    const revoked = this.tokens.revokeForOwner(userId, now);
    this.audit.record({ at: now, event: 'token.revoke-all', actorUserId: userId, target: String(userId) });
    return revoked;
  }

  // The principal of a bearer token, or null for anything malformed, unknown, revoked, or expired.
  resolve(bearer) {
    const value = String(bearer ?? '');
    const match = /^ial_([0-9a-f]{16})_([A-Za-z0-9_-]{20,128})$/.exec(value);
    if (!match) return null;
    const token = this.tokens.findById(match[1]);
    if (!token || !sameHash(token.secretHash, hashSecret(match[2])) || this.status(token) !== 'active') return null;
    const owner = this.users.findById(token.ownerUserId);
    if (!owner || owner.disabled) return null;
    const now = this.clock();
    if (!token.lastUsedAt || now - token.lastUsedAt >= this.timings.touchIntervalMs) this.tokens.touch(token.id, now);
    const allowed = permissionsOfRole(owner.role);
    return {
      type: 'token', tokenId: token.id, userId: owner.id, username: owner.username, role: null,
      permissions: permissionsOfScopes(token.scopes).filter(permission => allowed.includes(permission))
    };
  }
}
