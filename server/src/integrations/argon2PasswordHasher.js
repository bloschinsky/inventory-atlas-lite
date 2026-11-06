import argon2 from 'argon2';

/*
  Password hashing with Argon2id (the `argon2` package, prebuilt for Linux, macOS, and Windows).
  The parameters follow the OWASP minimum for Argon2id: 19 MiB of memory, two passes, one lane.
  They keep a login near a few tens of milliseconds and fit a 1 GiB container; every hash records
  its own parameters, so raising them later still verifies older hashes and rehashes on login.
*/
export const ARGON2_OPTIONS = Object.freeze({ type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 });

export class Argon2PasswordHasher {
  constructor(options = ARGON2_OPTIONS) {
    this.options = options;
    // Verified when no account matches, so an unknown name costs as much time as a wrong password.
    this.dummy = null;
  }

  hash(password) {
    return argon2.hash(password, this.options);
  }

  async verify(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyNothing(password) {
    this.dummy ??= await this.hash('inventory-atlas-dummy-password');
    await this.verify(this.dummy, password);
    return false;
  }

  needsRehash(hash) {
    return argon2.needsRehash(hash, this.options);
  }
}
