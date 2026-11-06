import crypto from 'node:crypto';

// Random identifiers and secrets, and the one-way forms the security store keeps of them.
export const randomId = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
export const randomSecret = () => crypto.randomBytes(32).toString('base64url');
export const hashSecret = secret => crypto.createHash('sha256').update(String(secret)).digest('hex');

export const sameHash = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/*
  The anti-CSRF token of a session, derived from its secret: the browser can only learn it from a
  same-origin API answer, and the server never has to store it.
*/
export const csrfTokenOf = sessionSecret => crypto.createHmac('sha256', sessionSecret).update('csrf').digest('base64url');

// A one-time code an operator reads from a console and types: unambiguous characters in groups of four.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = () => {
  const characters = [...crypto.randomBytes(20)].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return characters.join('').match(/.{4}/g).join('-');
};
export const normalizeCode = code => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
