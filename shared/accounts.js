import { AppError } from './appError.js';
import { roleExists, TOKEN_SCOPES } from './permissions.js';

/*
  Input rules of accounts and API tokens, enforced by the server and shown by the Security & Access
  forms. Usernames compare without regard to case.
*/
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const TOKEN_NAME_MAX_LENGTH = 80;
// Days a new API token lives; null is a token without an expiry date.
export const TOKEN_EXPIRY_DAYS = Object.freeze([30, 90, 365, null]);

export function validateUsername(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!USERNAME_PATTERN.test(username)) throw new AppError('AUTH_INVALID_USERNAME', { min: 3, max: 64 });
  return username;
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new AppError('AUTH_INVALID_PASSWORD', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
  }
  return value;
}

export function validateRole(value) {
  if (!roleExists(value)) throw new AppError('AUTH_INVALID_ROLE');
  return value;
}

export function validateTokenInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > TOKEN_NAME_MAX_LENGTH) throw new AppError('AUTH_INVALID_TOKEN_NAME', { max: TOKEN_NAME_MAX_LENGTH });
  const scopes = Array.isArray(body?.scopes) ? [...new Set(body.scopes)] : [];
  if (!scopes.length || !scopes.every(scope => Object.hasOwn(TOKEN_SCOPES, scope))) throw new AppError('AUTH_INVALID_TOKEN_SCOPES');
  // Read access comes with every token; writing items is the only addition.
  if (!scopes.includes('inventory:read')) scopes.unshift('inventory:read');
  const expiresInDays = body?.expiresInDays ?? null;
  if (!TOKEN_EXPIRY_DAYS.includes(expiresInDays)) throw new AppError('AUTH_INVALID_TOKEN_EXPIRY');
  return { name, scopes, expiresInDays };
}
