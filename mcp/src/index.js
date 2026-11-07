import http from 'node:http';
import { AtlasClient } from './atlasClient.js';
import { ConfigError, readConfig } from './config.js';
import { createHttpApp, createReadiness } from './httpServer.js';
import { createLogger } from './logger.js';

/*
  The adapter's process: validated configuration, one Atlas client, the HTTP endpoint, and a startup
  check of the token. A token Atlas rejects, or one with more access than inventory:read, stops the
  process (fail closed); an Atlas that is not reachable yet only delays readiness, so the adapter
  recovers when Atlas starts or restarts. With MCP_PUBLIC_URL the OAuth store is opened as well.
*/
// Everything the adapter writes (the OAuth store, its WAL files) is readable by its own user only.
process.umask(0o077);

let config;
try {
  config = readConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  process.stderr.write(`atlas-mcp: ${error.message}\n`);
  process.exit(2);
}

const logger = createLogger(config.logLevel);
const atlas = new AtlasClient(config.atlas);

let authStore = null;
if (config.oauth) {
  try {
    // Loaded only for remote access: node:sqlite needs Node.js 22.13 or later.
    const { AuthStore } = await import('./authStore.js');
    authStore = new AuthStore(config.oauth.stateDir);
  } catch (error) {
    logger.error('cannot open the OAuth store in MCP_STATE_DIR', { error: error?.code ?? error?.name ?? 'Error' });
    process.exit(2);
  }
}

const REFUSED = {
  auth_rejected: 'Atlas rejected the API token; the adapter does not start without a valid inventory:read token.',
  forbidden: 'Atlas refused to describe the API token (Atlas 0.73.0 or later reports a token\'s permissions); the adapter does not start.',
  token_overprivileged: 'The Atlas API token can do more than read; create a Read-only (inventory:read) token for the adapter.'
};
const startup = await createReadiness(atlas, { cacheMs: 0 })();
if (!startup.ready && REFUSED[startup.reason]) {
  logger.error(REFUSED[startup.reason], { reason: startup.reason });
  process.exit(3);
}
if (!startup.ready) logger.warn('Atlas is not reachable yet; tools answer upstream_unavailable until it is.', { reason: startup.reason });

const { app, close } = createHttpApp({ config, atlas, logger, authStore });
// The server is created here rather than through app.listen: Express 5 also hands a listen error to
// the listening callback, which would then read the address of a server that never bound.
const listener = http.createServer(app);
listener.once('listening', () => {
  const { port } = listener.address();
  const host = config.listen.host.includes(':') ? `[${config.listen.host}]` : config.listen.host;
  logger.info(`atlas-mcp listening on http://${host}:${port}/mcp`, { ready: startup.ready, remote: config.oauth?.resourceUrl });
});
listener.on('error', error => {
  logger.error('cannot listen', { code: error.code, host: config.listen.host, port: config.listen.port });
  process.exit(4);
});
listener.listen(config.listen.port, config.listen.host);
// The body of a request must arrive promptly; a stalled client cannot hold a socket for long.
listener.requestTimeout = 30000;
listener.headersTimeout = 15000;

const shutdown = async signal => {
  logger.info('shutting down', { signal });
  await close();
  authStore?.close();
  listener.close(() => process.exit(0));
  listener.closeAllConnections();
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
