import { AuthStore } from './authStore.js';

/*
  The owner's commands for remote access, run on the adapter's host (or `docker compose exec`):

    node src/cli.js enroll                 print a one-time enrollment code for the consent page
    node src/cli.js clients                list registered OAuth clients
    node src/cli.js revoke <client_id>     revoke one client and every token it holds

  They work on the same OAuth store as the running server (MCP_STATE_DIR) and take effect at once.
  Codes are printed here only, never served over HTTP; possession of this shell is the owner's proof.
*/
process.umask(0o077);
const [command, argument] = process.argv.slice(2);
const stateDir = process.env.MCP_STATE_DIR?.trim();
const out = text => process.stdout.write(`${text}\n`);
const fail = (text, code = 2) => {
  process.stderr.write(`atlas-mcp: ${text}\n`);
  process.exit(code);
};

if (!['enroll', 'clients', 'revoke'].includes(command)) fail('Usage: node src/cli.js enroll | clients | revoke <client_id>');
if (!stateDir) fail('MCP_STATE_DIR is not set; use the same value as the running adapter.');

const store = new AuthStore(stateDir);
const iso = value => (value ? new Date(value).toISOString() : '-');
try {
  if (command === 'enroll') {
    const { code, expiresAt } = store.createEnrollmentCode();
    out(`Enrollment code: ${code}`);
    out(`Valid once, until ${iso(expiresAt)}. Any earlier unused code no longer works.`);
  } else if (command === 'clients') {
    const clients = store.listClients();
    if (!clients.length) out('No OAuth clients are registered.');
    for (const client of clients) {
      const status = client.revokedAt ? 'revoked' : client.approvedAt ? 'approved' : 'waiting';
      out([client.clientId, status, client.name, client.redirectUris.join(' '), `grants=${client.activeGrants}`, `last_used=${iso(client.lastUsedAt)}`].join('\t'));
    }
  } else {
    if (!argument) fail('Name the client_id to revoke (see `clients`).');
    if (!store.revokeClient(argument)) fail('No active client has this id.', 1);
    out(`Revoked ${argument}; its tokens stopped working.`);
  }
} finally {
  store.close();
}
