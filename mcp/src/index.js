import { AtlasClient } from './atlasClient.js';
import { ConfigError, readConfig } from './config.js';
import { createHttpApp, createReadiness } from './httpServer.js';
import { createLogger } from './logger.js';

/*
  The adapter's process: validated configuration, one Atlas client, the HTTP endpoint, and a startup
  check of the token. A token Atlas rejects stops the process (fail closed); an Atlas that is not
  reachable yet only delays readiness, so the adapter recovers when Atlas starts or restarts.
*/
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

const startup = await createReadiness(atlas, { cacheMs: 0 })();
if (!startup.ready && ['auth_rejected', 'forbidden'].includes(startup.reason)) {
  logger.error('Atlas rejected the API token; the adapter does not start without a valid inventory:read token.', { reason: startup.reason });
  process.exit(3);
}
if (!startup.ready) logger.warn('Atlas is not reachable yet; tools answer upstream_unavailable until it is.', { reason: startup.reason });

const { app, close } = createHttpApp({ config, atlas, logger });
const listener = app.listen(config.listen.port, config.listen.host, () => {
  const { port } = listener.address();
  const host = config.listen.host.includes(':') ? `[${config.listen.host}]` : config.listen.host;
  logger.info(`atlas-mcp listening on http://${host}:${port}/mcp`, { ready: startup.ready });
});
listener.on('error', error => {
  logger.error('cannot listen', { code: error.code });
  process.exit(1);
});
// The body of a request must arrive promptly; a stalled client cannot hold a socket for long.
listener.requestTimeout = 30000;
listener.headersTimeout = 15000;

const shutdown = async signal => {
  logger.info('shutting down', { signal });
  await close();
  listener.close(() => process.exit(0));
  listener.closeAllConnections();
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
