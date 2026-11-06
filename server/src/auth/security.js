import { authDatabaseFile, authTimings } from './authConfig.js';
import { openAuthDatabase } from './authDatabase.js';
import { ApiTokenRepository } from './apiTokenRepository.js';
import { ApiTokenService } from './apiTokenService.js';
import { AuditRepository } from './auditRepository.js';
import { AuthService } from './authService.js';
import { LoginThrottle } from './loginThrottle.js';
import { SessionRepository } from './sessionRepository.js';
import { UserAdminService } from './userAdminService.js';
import { UserRepository } from './userRepository.js';
import { Argon2PasswordHasher } from '../integrations/argon2PasswordHasher.js';

/*
  The security store and its services. The store is its own file in DATA_DIR, opened once and never
  touched by the inventory's backup, restore, or reset. The command line (server/src/cli/auth.js)
  builds the same services over the same file, without the inventory or the HTTP server.
*/
export function createSecurity(directory, { clock = Date.now } = {}) {
  const authDb = openAuthDatabase(authDatabaseFile(directory));
  const users = new UserRepository(authDb);
  const sessions = new SessionRepository(authDb);
  const tokens = new ApiTokenRepository(authDb);
  const audit = new AuditRepository(authDb);
  const hasher = new Argon2PasswordHasher();
  const authService = new AuthService({ users, sessions, audit, hasher, throttle: new LoginThrottle({ clock }), timings: authTimings, clock });
  sessions.deleteExpired(clock(), authTimings.sessionIdleMs);
  return {
    authDb,
    authService,
    userAdminService: new UserAdminService({ users, sessions, audit, hasher, clock }),
    apiTokenService: new ApiTokenService({ tokens, users, audit, timings: authTimings, clock }),
    close: () => authDb.close()
  };
}
