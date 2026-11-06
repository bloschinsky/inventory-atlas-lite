#!/usr/bin/env node
import { dataDir } from '../dataDir.js';
import { createSecurity } from '../auth/security.js';

/*
  Local administration of the security store, for whoever can run commands on the machine (the host,
  `docker exec`, or the Proxmox console). It is never reachable over HTTP. It prints one-time codes,
  never passwords: the code is typed into the sign-in page together with a password chosen there,
  so no password passes through a shell history or a container log.

    init               a setup code for the first administrator (only while no account exists)
    recover <username> a recovery code that sets a new password and enables the account again;
                       with --revoke-tokens it also revokes every API token the account created
    users              the accounts, their roles, and whether they are disabled
*/
const usage = `Usage: npm run auth -- <command>   (or: node server/src/cli/auth.js <command>)

Commands:
  init                Print a one-time setup code for the first administrator.
  recover <username> [--revoke-tokens]
                      Print a one-time recovery code for an account (sets a new password, enables it).
                      --revoke-tokens also revokes the account's API tokens at once, for a suspected leak.
  users               List the accounts.

Data directory: ${dataDir}`;

const [command, ...args] = process.argv.slice(2);
const security = createSecurity(dataDir);
const { authService, userAdminService, apiTokenService } = security;
const minutesLeft = expiresAt => Math.round((Date.parse(expiresAt) - Date.now()) / 60000);

try {
  if (command === 'init') {
    const { code, expiresAt } = authService.issueSetupCode();
    console.log(`Setup code: ${code}

Open Inventory Atlas Lite in a browser: the page "Create the first administrator" asks for this code,
the administrator's name, and a password. The code works once and expires in ${minutesLeft(expiresAt)} minutes;
running this command again replaces it.`);
  } else if (command === 'recover') {
    const name = args.find(arg => !arg.startsWith('--'));
    if (!name) throw new Error('Name the account: recover <username> [--revoke-tokens]');
    const { code, expiresAt, user } = authService.issueRecoveryCode(name);
    const tokens = args.includes('--revoke-tokens')
      ? `All ${apiTokenService.revokeAllOf(user.id)} active API tokens of this account were revoked.`
      : 'Its API tokens keep working; add --revoke-tokens if one may have leaked, or revoke them in Settings.';
    console.log(`Recovery code for ${user.username} (${user.role}): ${code}

On the sign-in page choose "Use a recovery code", then enter the name, this code, and a new password.
The account is enabled again and its other sessions end. The code works once and expires in
${minutesLeft(expiresAt)} minutes; running this command again replaces it.
${tokens}`);
  } else if (command === 'users') {
    const users = userAdminService.list();
    if (!users.length) console.log('No accounts yet. Run "init" to create the first administrator.');
    for (const user of users) console.log(`${user.username}\t${user.role}\t${user.disabled ? 'disabled' : 'active'}`);
  } else {
    console.log(usage);
    process.exitCode = command && command !== 'help' ? 1 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  security.close();
}
